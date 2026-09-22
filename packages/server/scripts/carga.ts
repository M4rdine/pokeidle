/**
 * Sonda de carga: quantas caçadas simultâneas este servidor sustenta dentro do orçamento do tick.
 *
 * A pergunta é uma só, e é de capacidade: o agendador roda TODAS as caçadas ativas dentro da
 * mesma janela de 200 ms, num processo só. Se a soma do trabalho passar da janela, o atraso não
 * aparece como erro em lugar nenhum — o jogo inteiro simplesmente anda mais devagar que o relógio,
 * para todo mundo ao mesmo tempo, e o sintoma que chega é "o jogo travou".
 *
 * A sonda NÃO mede com régua própria: ela gera a carga e lê o que o servidor já publica em
 * `/metrics`. Uma segunda medição, feita daqui, mediria a latência da rede desta máquina junto e
 * concordaria com o servidor só por acaso.
 *
 * A CONTA nasce pelo banco; a CAÇADA começa pela rota real. A divisão não é arbitrária:
 * `/auth/register` tem limite de 10 por minuto por IP, de propósito, e cadastro não é o que se
 * está medindo — mas quem chama `scheduler.attach` é `POST /hunts/:id/start`, e não o WebSocket.
 * A primeira versão desta sonda começava a caçada direto no banco e media 51 sockets abertos
 * contra DUAS caçadas ativas: as linhas estavam lá, e o processo no ar não sabia de nenhuma delas.
 *
 * O teto prático é o limite global de 300 requisições por minuto por IP: cada caçada gasta uma.
 *
 * Uso, com o servidor no ar e o mesmo `DATABASE_URL`:
 *   pnpm --filter @pokeidle/server carga
 *   pnpm --filter @pokeidle/server carga --cacadas 200 --segundos 120
 *
 * `METRICS_TOKEN` é necessário se o servidor estiver configurado com ele; de outra máquina que não
 * o loopback, `/metrics` não responde sem o token.
 */
import { loadRegistry } from '@pokeidle/shared'
import WebSocket from 'ws'
import { chooseStarter } from '../src/account/starter.js'
import { register } from '../src/account/register.js'
import { createDb } from '../src/db/client.js'

const ORIGIN = process.env['APP_ORIGIN'] ?? 'http://localhost:3000'
const DATABASE_URL = process.env['DATABASE_URL']
const METRICS_TOKEN = process.env['METRICS_TOKEN']
const AREA = 'campo-inicial'
/** Argon2 é caro de propósito; na semeadura ele é só custo. A senha destes treinadores é lixo. */
const HASH_BARATO = { memoryCost: 1024, timeCost: 1, parallelism: 1 }

const arg = (nome: string, padrao: number): number => {
  const i = process.argv.indexOf(`--${nome}`)
  if (i === -1) return padrao
  const valor = Number(process.argv[i + 1])
  if (!Number.isFinite(valor) || valor <= 0) throw new Error(`--${nome} precisa de um número positivo`)
  return valor
}

// ── Leitura do que o servidor publica ────────────────────────────────────────

/** O formato de texto do Prometheus, só o suficiente para estas métricas: `nome{rótulos} valor`. */
function lerExposicao(texto: string): Map<string, number> {
  const fora = new Map<string, number>()
  for (const linha of texto.split('\n')) {
    if (linha.startsWith('#') || linha.trim() === '') continue
    const corte = linha.lastIndexOf(' ')
    if (corte === -1) continue
    const valor = Number(linha.slice(corte + 1))
    if (Number.isFinite(valor)) fora.set(linha.slice(0, corte), valor)
  }
  return fora
}

async function metricas(): Promise<Map<string, number>> {
  const res = await fetch(`${ORIGIN}/metrics`, {
    headers: METRICS_TOKEN === undefined ? {} : { authorization: `Bearer ${METRICS_TOKEN}` },
  })
  if (!res.ok) throw new Error(`/metrics respondeu ${res.status}: sem token, ele só atende o loopback`)
  return lerExposicao(await res.text())
}

const valor = (m: Map<string, number>, chave: string): number => m.get(chave) ?? 0

/**
 * Soma uma série e TODAS as suas variantes por rótulo.
 *
 * `pokeidle_persist_duration_seconds` é publicada por `kind`, então a série sem rótulo não existe
 * e procurar por ela devolve zero em silêncio — foi o que fez a primeira rodada desta sonda
 * relatar "gravações 0,0 ms" enquanto o tick gastava 486 ms, escondendo justamente o suspeito
 * número um.
 */
const somaSeries = (m: Map<string, number>, prefixo: string): number => {
  let total = 0
  for (const [chave, v] of m) if (chave === prefixo || chave.startsWith(`${prefixo}{`)) total += v
  return total
}

/**
 * A fatia das observações que ficou ACIMA de um limite, entre duas leituras.
 *
 * O histograma do Prometheus é cumulativo: o balde `le="0.2"` conta tudo que ficou em 200 ms ou
 * menos. O que passou do limite é o total menos esse balde — e sempre como DIFERENÇA entre as duas
 * leituras, senão o número carrega o histórico do processo desde o boot e dilui o teste.
 */
/**
 * O balde também carrega os rótulos da métrica: `{kind="save",le="0.25"}`, e não `{le="0.25"}`.
 * Procurar a chave exata devolvia zero em silêncio, e zero dentro do balde vira "100% acima" —
 * a sonda chegou a relatar 100% das gravações acima de 250 ms com média de 93,6 ms. Um número
 * errado no relatório é pior que número nenhum: este aqui acusaria um problema inexistente
 * justamente depois de o problema real ter sido corrigido.
 */
function somaBaldes(m: Map<string, number>, metrica: string, le: string): number {
  let total = 0
  for (const [chave, v] of m) {
    if (chave.startsWith(`${metrica}_bucket{`) && chave.includes(`le="${le}"`)) total += v
  }
  return total
}

function fracaoAcima(antes: Map<string, number>, depois: Map<string, number>, metrica: string, le: string): number {
  const total = somaSeries(depois, `${metrica}_count`) - somaSeries(antes, `${metrica}_count`)
  if (total <= 0) return 0
  const dentro = somaBaldes(depois, metrica, le) - somaBaldes(antes, metrica, le)
  return (total - dentro) / total
}

function media(antes: Map<string, number>, depois: Map<string, number>, metrica: string): number {
  const n = somaSeries(depois, `${metrica}_count`) - somaSeries(antes, `${metrica}_count`)
  return n <= 0 ? 0 : ((somaSeries(depois, `${metrica}_sum`) - somaSeries(antes, `${metrica}_sum`)) / n) * 1000
}

/** Quantas observações a métrica ganhou no período — zero aqui denuncia rótulo errado na leitura. */
const observacoes = (antes: Map<string, number>, depois: Map<string, number>, metrica: string): number =>
  somaSeries(depois, `${metrica}_count`) - somaSeries(antes, `${metrica}_count`)

// ── Semeadura ────────────────────────────────────────────────────────────────

interface Jogador { readonly trainerId: string; readonly cookie: string }

async function semear(quantas: number): Promise<{ jogadores: Jogador[]; fechar: () => Promise<void> }> {
  if (DATABASE_URL === undefined) throw new Error('DATABASE_URL não definida: a sonda semeia pelo banco')
  const { db, close } = createDb(DATABASE_URL)
  const registry = loadRegistry()
  const marca = Date.now().toString(36)
  const jogadores: Jogador[] = []
  for (let i = 0; i < quantas; i++) {
    const now = new Date()
    const { trainer, token } = await register(db, {
      email: `carga-${marca}-${i}@test.dev`,
      password: 'senha-de-carga-123',
      // O nome aceita só letra, número e espaço, e tem teto de 16.
      name: `Carga ${marca}${i}`.slice(0, 16),
    }, { hash: HASH_BARATO, now })
    await chooseStarter(db, registry, trainer.id, 'charmander', now)
    jogadores.push({ trainerId: trainer.id, cookie: `sid=${token}` })
    if ((i + 1) % 25 === 0) process.stdout.write(`  semeados ${i + 1}/${quantas}\n`)
  }
  return { jogadores, fechar: close }
}

/**
 * Começa a caçada pela ROTA, que é quem chama `scheduler.attach`. Semear a linha de
 * `hunt_sessions` direto no banco não faz o processo no ar saber que ela existe: ele só a
 * encontraria no próximo boot, pelo `recoverSessions`.
 */
async function iniciarCacadas(jogadores: readonly Jogador[]): Promise<number> {
  let iniciadas = 0
  for (const j of jogadores) {
    const res = await fetch(`${ORIGIN}/hunts/${AREA}/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: j.cookie },
      body: '{}',
    })
    if (res.ok) iniciadas++
    else if (res.status === 429) throw new Error('limite de 300 req/min por IP estourado: use menos caçadas por rodada')
    else throw new Error(`start falhou: ${res.status} ${await res.text()}`)
  }
  return iniciadas
}

// ── Sockets ──────────────────────────────────────────────────────────────────

interface Conexao { readonly socket: WebSocket; recebidas: number }

function conectar(jogador: Jogador, aoErrar: (mensagem: string) => void): Conexao {
  const socket = new WebSocket(`${ORIGIN.replace(/^http/, 'ws')}/ws`, { headers: { cookie: jogador.cookie, origin: ORIGIN } })
  const conexao: Conexao = { socket, recebidas: 0 }
  socket.on('message', () => { conexao.recebidas++ })
  socket.on('error', (e) => aoErrar(e.message))
  return conexao
}

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`

async function main(): Promise<void> {
  const quantas = Math.round(arg('cacadas', 50))
  const segundos = Math.round(arg('segundos', 60))
  process.stdout.write(`Carga: ${quantas} caçadas por ${segundos} s contra ${ORIGIN}\n\n`)

  process.stdout.write('semeando treinadores…\n')
  const { jogadores, fechar } = await semear(quantas)

  process.stdout.write('iniciando caçadas…\n')
  const iniciadas = await iniciarCacadas(jogadores)

  const erros: string[] = []
  process.stdout.write('abrindo sockets…\n')
  const conexoes = jogadores.map((j) => conectar(j, (m) => erros.push(m)))
  // Os sockets sobem juntos; o attach de cada caçada é assíncrono do lado do servidor, e medir
  // enquanto metade ainda está anexando mediria a subida, não o regime.
  await esperar(3000)

  const antes = await metricas()
  const t0 = Date.now()
  process.stdout.write(`medindo por ${segundos} s…\n\n`)
  await esperar(segundos * 1000)
  const depois = await metricas()
  const decorrido = (Date.now() - t0) / 1000

  const ticks = valor(depois, 'pokeidle_ticks_total') - valor(antes, 'pokeidle_ticks_total')
  const recebidas = conexoes.reduce((total, c) => total + c.recebidas, 0)
  const linha = (rotulo: string, texto: string): void => { process.stdout.write(`${rotulo.padEnd(34)} ${texto}\n`) }

  linha('caçadas iniciadas', String(iniciadas))
  linha('caçadas ativas no tick', String(valor(depois, 'pokeidle_hunts_active')))
  linha('sockets abertos', String(valor(depois, 'pokeidle_ws_connections')))
  linha('ticks no período', `${ticks} (esperado ~${Math.round(decorrido * 5)})`)
  // O sintoma real de sobrecarga: o agendador entrega menos ticks do que o relógio pediu.
  linha('ritmo do relógio', pct(ticks / (decorrido * 5)))
  linha('tempo por tick (média)', `${media(antes, depois, 'pokeidle_tick_duration_seconds').toFixed(1)} ms`)
  linha('ticks acima de 200 ms', pct(fracaoAcima(antes, depois, 'pokeidle_tick_duration_seconds', '0.2')))
  linha('atraso do tick (média)', `${media(antes, depois, 'pokeidle_tick_lag_seconds').toFixed(1)} ms`)
  linha('atraso acima de 200 ms', pct(fracaoAcima(antes, depois, 'pokeidle_tick_lag_seconds', '0.2')))
  linha('gravações', `${observacoes(antes, depois, 'pokeidle_persist_duration_seconds')} em ${media(antes, depois, 'pokeidle_persist_duration_seconds').toFixed(1)} ms cada`)
  // 250 ms e não 200: os baldes de I/O do servidor são outros, e rotular pelo balde errado seria
  // relatar um limite que a métrica não tem.
  linha('gravações acima de 250 ms', pct(fracaoAcima(antes, depois, 'pokeidle_persist_duration_seconds', '0.25')))
  linha('memória do processo', `${(valor(depois, 'process_resident_memory_bytes') / 1024 / 1024).toFixed(0)} MB`)
  linha('mensagens recebidas aqui', `${recebidas} (${(recebidas / quantas / decorrido).toFixed(1)}/s por socket)`)
  linha('erros de socket', erros.length === 0 ? 'nenhum' : `${erros.length} (${erros[0]!})`)

  /*
   * Parar antes de sair não é cortesia: uma sessão deixada aberta volta no próximo boot pelo
   * `recoverSessions`, e cada rodada de carga abandonada deixaria mais caçadas fantasma para o
   * servidor recuperar — inclusive com catch-up do tempo desde agora.
   */
  process.stdout.write('\nparando as caçadas…\n')
  for (const c of conexoes) {
    if (c.socket.readyState === WebSocket.OPEN) c.socket.send(JSON.stringify({ t: 'hunt.stop' }))
  }
  await esperar(2000)
  for (const c of conexoes) c.socket.close(1000, 'carga concluída')
  await fechar()
  process.stdout.write('As contas ficam no banco, sem caçada ativa; são de teste e não atrapalham nada.\n')
  process.exit(0)
}

main().catch((error: unknown) => {
  process.stdout.write(`falha na sonda de carga: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
