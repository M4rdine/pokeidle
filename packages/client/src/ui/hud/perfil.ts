import { findArea } from '@pokeidle/shared'
import type { AppContext } from '../../app-context.js'
import { PokedexSchema } from '../../api/dto.js'
import { trainerProgress } from '../../state/progress.js'
import { huntPokedexCount } from '../../state/tips.js'
import { el, pct } from '../dom.js'

const CONN_TEXT: Readonly<Record<string, string>> = { open: 'conectado', connecting: 'conectando', reconnecting: 'reconectando', closed: 'desconectado' }

/**
 * A coluna de perfil: quem é o jogador e como ele está.
 *
 * Era uma barra de topo de uma linha só, com treze elementos disputando a mesma faixa — e a
 * largura obrigava a cortar texto e a esconder mostrador em tela estreita. Numa coluna o mesmo
 * conteúdo respira, os números ficam grandes, e o topo do centro sobra para o menu de funções.
 */
export function mountPerfil(root: HTMLElement, ctx: AppContext): () => void {
  const name = el('strong', {})
  const level = el('span', { 'data-level': '' })
  const xpBar = el('progress', { class: 'xp-bar', max: '100', value: '0' })
  const nextUnlock = el('span', { class: 'tb-corta', 'data-next': '' }, '—')
  const gold = el('span', { 'data-gold': '' }, '0')
  // O número do tique é telemetria de desenvolvedor: o que ele diz ao jogador é só "a simulação
  // está viva". Fica no título, para quem quiser o número, e some do texto corrente.
  const tick = el('span', { class: 'muted tb-pulso', 'data-tick': '', title: 'tique da simulação' }, 'simulando')
  const conn = el('span', { class: 'conn', 'data-conn': 'closed', role: 'status' }, CONN_TEXT['closed']!)
  const dex = el('span', { 'data-dex': '' }, '—')
  /** Rótulo do mostrador de área: o nome da área nomeia o próprio medidor. */
  const areaNome = el('span', {}, 'área')
  /** Rótulo micro em caixa alta sobre o número, como mostrador de instrumento. */
  const leitura = (rotulo: HTMLElement, valor: HTMLElement, classe = ''): HTMLElement =>
    el('div', { class: `leitura ${classe}`.trim() }, rotulo, valor)

  // O progresso do nível vem com os números ao lado da barra, e não só com a barra: "faltam
  // 1.894.076 xp" é uma informação; uma barra a 87 % é uma impressão.
  const xpTexto = el('span', { class: 'muted', 'data-xp-texto': '' }, '—')

  root.append(el('header', { class: 'perfil panel' },
    el('div', { class: 'perfil-id' }, name, level),
    el('div', { class: 'medidor' },
      el('div', { class: 'medidor-topo' }, el('span', {}, 'xp'), xpTexto),
      xpBar),
    el('div', { class: 'perfil-leituras' },
      leitura(el('span', {}, 'ouro'), gold, 'leitura-ouro'),
      leitura(areaNome, dex)),
    leitura(el('span', {}, 'próximo'), nextUnlock),
    el('div', { class: 'perfil-status' }, conn, tick)))

  // O XP do treinador sobe durante a hunt: o espelho manda, o /me só serve enquanto não há hunt.
  const renderProgress = (): void => {
    const me = ctx.session.get().me
    if (!me) return
    name.textContent = me.trainer.name
    const xp = ctx.hunt.get().state?.trainer.xp ?? me.trainer.xp
    const progress = trainerProgress(ctx.registry, xp)
    level.textContent = `nível ${progress.level}`
    xpBar.setAttribute('value', String(pct(progress.xpInto, progress.xpSpan)))
    xpTexto.textContent = `${progress.xpInto.toLocaleString('pt-BR')} / ${progress.xpSpan.toLocaleString('pt-BR')}`
    nextUnlock.textContent = progress.next ? `${progress.next.what} · nv ${progress.next.level}` : 'tudo destravado'
    // O texto pode ser longo e a barra é de uma linha só: o corte mostra o começo e o título
    // devolve o resto a quem passar o mouse.
    nextUnlock.title = nextUnlock.textContent
  }
  const offMe = ctx.session.subscribe((s) => s.me, renderProgress)
  const offXp = ctx.hunt.subscribe((v) => v.state?.trainer.xp ?? null, renderProgress)
  const offGold = ctx.hunt.subscribe((v) => v.state?.trainer.gold ?? null, (value) => {
    if (value !== null) gold.textContent = value.toLocaleString('pt-BR')
  })
  const offTick = ctx.hunt.subscribe((v) => v.tick, (value) => { tick.title = `tique ${value} da simulação` })
  // Contador "Rota 1: n/m": a Pokédex do servidor é lida uma vez e `seen` da sessão atualiza ao vivo.
  let entries: Awaited<ReturnType<typeof loadEntries>> = []
  async function loadEntries() { return (await ctx.http.get('/trainer/pokedex', PokedexSchema)).entries }
  const renderDex = (): void => {
    const huntId = ctx.hunt.get().session?.huntId
    const area = huntId ? findArea(ctx.registry.regions, huntId)?.area : undefined
    if (!area) { areaNome.textContent = 'área'; dex.textContent = '—'; return }
    const { n, m } = huntPokedexCount(ctx.hunt.get(), entries, area.species)
    areaNome.textContent = area.name
    dex.textContent = `${n}/${m}`
  }
  // Engolir aqui deixava o mostrador em "—" para sempre, indistinguível de "ainda carregando".
  void loadEntries()
    .then((loaded) => { entries = loaded; renderDex() })
    .catch(() => { areaNome.textContent = 'área'; dex.textContent = '?'; dex.title = 'não foi possível ler a Pokédex' })
  const offDex = ctx.hunt.subscribe((v) => v.state?.settings.seen, renderDex)
  const offConn = ctx.session.subscribe((s) => s.socket, (status) => {
    const phase = ctx.hunt.get().phase
    const key = phase === 'catching-up' ? 'catching-up' : status
    conn.setAttribute('data-conn', key)
    conn.textContent = key === 'catching-up' ? 'recuperando tempo' : CONN_TEXT[status] ?? status
  })
  const offPhase = ctx.hunt.subscribe((v) => v.phase, (phase) => {
    const status = ctx.session.get().socket
    const key = phase === 'catching-up' ? 'catching-up' : status
    conn.setAttribute('data-conn', key)
    conn.textContent = key === 'catching-up' ? 'recuperando tempo' : CONN_TEXT[status] ?? status
  })
  return () => { offMe(); offXp(); offGold(); offTick(); offDex(); offConn(); offPhase() }
}
