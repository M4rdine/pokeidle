/**
 * Painel de operação: lê `/metrics` — o mesmo texto que o Prometheus raspa — e mostra o agora.
 *
 * Sem histórico de propósito: o endpoint não guarda série. Quem quiser gráfico no tempo aponta um
 * Prometheus para a mesma URL. Aqui a pergunta é "como está agora", e a resposta cabe numa tela.
 */

const INTERVALO_MS = 5000
/** Quantis lidos dos buckets do histograma; o Prometheus faz isso na consulta, aqui é na mão. */
const QUANTIS = [0.5, 0.95, 0.99]

/**
 * Lê o formato de exposição do Prometheus. Uma linha é `nome{rótulos} valor`; comentários
 * começam com `#`. Não é um parser geral — cobre o que este endpoint emite.
 */
export function parseMetrics(texto) {
  const amostras = []
  for (const linha of texto.split('\n')) {
    if (linha === '' || linha.startsWith('#')) continue
    const abre = linha.indexOf('{')
    const espaco = linha.lastIndexOf(' ')
    if (espaco < 0) continue
    const valor = Number(linha.slice(espaco + 1))
    if (!Number.isFinite(valor)) continue
    if (abre < 0 || abre > espaco) {
      amostras.push({ nome: linha.slice(0, espaco), rotulos: {}, valor })
      continue
    }
    const fecha = linha.lastIndexOf('}', espaco)
    amostras.push({ nome: linha.slice(0, abre), rotulos: parseRotulos(linha.slice(abre + 1, fecha)), valor })
  }
  return amostras
}

function parseRotulos(corpo) {
  const rotulos = {}
  for (const par of corpo.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const igual = par.indexOf('=')
    if (igual < 0) continue
    rotulos[par.slice(0, igual).trim()] = par.slice(igual + 1).trim().replace(/^"|"$/g, '')
  }
  return rotulos
}

const valor = (amostras, nome, filtro = {}) =>
  amostras.find((a) => a.nome === nome && casa(a.rotulos, filtro))?.valor ?? null

const soma = (amostras, nome, filtro = {}) =>
  amostras.filter((a) => a.nome === nome && casa(a.rotulos, filtro)).reduce((t, a) => t + a.valor, 0)

const casa = (rotulos, filtro) => Object.entries(filtro).every(([k, v]) => rotulos[k] === v)

/**
 * Quantil a partir dos buckets cumulativos de um histograma. O bucket dá o teto da faixa, então
 * o resultado é "no máximo isto" — é a mesma aproximação que o `histogram_quantile` faz.
 */
export function quantilDeBuckets(amostras, nome, q, filtro = {}) {
  const buckets = amostras
    .filter((a) => a.nome === `${nome}_bucket` && casa(a.rotulos, filtro))
    .map((a) => ({ le: a.rotulos.le === '+Inf' ? Infinity : Number(a.rotulos.le), n: a.valor }))
    .sort((a, b) => a.le - b.le)
  const total = buckets.at(-1)?.n ?? 0
  if (total === 0) return null
  const alvo = q * total
  const achado = buckets.find((b) => b.n >= alvo)
  return achado === undefined || achado.le === Infinity ? null : achado.le
}

const ms = (segundos) => (segundos === null ? '—' : `${(segundos * 1000).toFixed(segundos < 0.01 ? 1 : 0)} ms`)
const inteiro = (n) => (n === null ? '—' : String(Math.round(n)))
const mib = (bytes) => (bytes === null ? '—' : `${(bytes / 1024 / 1024).toFixed(0)} MiB`)

const duracao = (segundos) => {
  if (segundos === null || segundos < 0) return ''
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  return h > 0 ? `no ar há ${h} h ${m} min` : `no ar há ${m} min`
}

const texto = (id, valor) => { const el = document.getElementById(id); if (el) el.textContent = valor }

/** Substitui o corpo de uma tabela por linhas, ou por um aviso quando não há o que mostrar. */
function preencher(id, linhas, vazio) {
  const corpo = document.getElementById(id)
  if (!corpo) return
  corpo.replaceChildren()
  if (linhas.length === 0) {
    const tr = document.createElement('tr')
    const td = document.createElement('td')
    td.colSpan = 4
    td.className = 'muted'
    td.textContent = vazio
    tr.append(td)
    corpo.append(tr)
    return
  }
  for (const celulas of linhas) {
    const tr = document.createElement('tr')
    celulas.forEach((valor, i) => {
      const cel = document.createElement(i === 0 ? 'th' : 'td')
      if (i === 0) cel.scope = 'row'
      else cel.className = 'num'
      cel.textContent = valor
      tr.append(cel)
    })
    corpo.append(tr)
  }
}

export function render(amostras) {
  texto('huntsAtivas', inteiro(valor(amostras, 'pokeidle_hunts_active')))
  texto('huntsCatchup', inteiro(valor(amostras, 'pokeidle_hunts_catching_up')))
  texto('conexoes', inteiro(valor(amostras, 'pokeidle_ws_connections')))
  texto('memoria', mib(valor(amostras, 'process_resident_memory_bytes')))
  // O prom-client expõe o instante do boot, não o tempo decorrido; a conta é aqui.
  const inicio = valor(amostras, 'process_start_time_seconds')
  texto('uptime', inicio === null ? '' : duracao(Date.now() / 1000 - inicio))

  const [p50, p95, p99] = QUANTIS
  texto('tickP50', ms(quantilDeBuckets(amostras, 'pokeidle_tick_duration_seconds', p50)))
  texto('tickP95', ms(quantilDeBuckets(amostras, 'pokeidle_tick_duration_seconds', p95)))
  texto('tickP99', ms(quantilDeBuckets(amostras, 'pokeidle_tick_duration_seconds', p99)))
  texto('lagP50', ms(quantilDeBuckets(amostras, 'pokeidle_tick_lag_seconds', p50)))
  texto('lagP95', ms(quantilDeBuckets(amostras, 'pokeidle_tick_lag_seconds', p95)))
  texto('lagP99', ms(quantilDeBuckets(amostras, 'pokeidle_tick_lag_seconds', p99)))

  const tipos = ['save', 'sync', 'finish']
  preencher('persistCorpo', tipos.flatMap((kind) => {
    const n = valor(amostras, 'pokeidle_persist_duration_seconds_count', { kind })
    if (n === null) return []
    return [[kind, inteiro(n), ms(quantilDeBuckets(amostras, 'pokeidle_persist_duration_seconds', p95, { kind })), inteiro(valor(amostras, 'pokeidle_persist_failures_total', { kind }) ?? 0)]]
  }), 'nenhuma gravação ainda')

  const rotas = [...new Set(amostras.filter((a) => a.nome === 'pokeidle_http_requests_total').map((a) => a.rotulos.route))]
  preencher('httpCorpo', rotas
    .map((route) => ({
      route,
      total: soma(amostras, 'pokeidle_http_requests_total', { route }),
      erros: amostras
        .filter((a) => a.nome === 'pokeidle_http_requests_total' && a.rotulos.route === route && a.rotulos.status?.startsWith('5'))
        .reduce((t, a) => t + a.valor, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)
    .map((r) => [r.route, inteiro(r.total), inteiro(r.erros)]), 'nenhuma requisição ainda')

  preencher('errosCorpo', amostras
    .filter((a) => a.nome === 'pokeidle_errors_total' && a.valor > 0)
    .map((a) => [a.rotulos.scope, inteiro(a.valor)]), 'nenhum')

  preencher('fimCorpo', amostras
    .filter((a) => a.nome === 'pokeidle_hunts_finished_total' && a.valor > 0)
    .map((a) => [a.rotulos.reason, inteiro(a.valor)]), 'nenhuma')
}

async function atualizar() {
  const estado = document.getElementById('estado')
  try {
    const resposta = await fetch('/metrics', { headers: { accept: 'text/plain' } })
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
    render(parseMetrics(await resposta.text()))
    if (estado) { estado.textContent = 'atualizado'; estado.dataset.estado = 'ok' }
  } catch (erro) {
    // O painel continua mostrando os últimos números; o estado diz que eles envelheceram.
    if (estado) {
      estado.textContent = erro instanceof Error ? `sem dados: ${erro.message}` : 'sem dados'
      estado.dataset.estado = 'erro'
    }
  }
}

if (typeof document !== 'undefined' && document.getElementById('estado')) {
  void atualizar()
  setInterval(() => void atualizar(), INTERVALO_MS)
}
