const TILE = 32
const $ = (id) => document.getElementById(id)
const state = { map: null, atlas: null, atlasImg: null, snapshot: null, wilds: new Map(), player: null, targetWildId: null, flashes: [], ws: null }

const api = async (method, url, body) => {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const json = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error ? `${json.error.code}: ${json.error.message}` : `${res.status}`)
  return json
}
const setStatus = (text) => { $('status').textContent = text }
const log = (cls, text) => {
  const li = document.createElement('li'); li.className = cls; li.textContent = text
  const ol = $('log'); ol.prepend(li); while (ol.children.length > 200) ol.lastChild.remove()
}

async function loadMap(huntId) {
  if (state.map?.id === huntId) return
  state.map = await api('GET', `/debug/map/${huntId}`)
  state.atlas = await api('GET', '/debug/atlas/tiles.json')
  state.atlasImg = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = '/debug/atlas/tiles.png' })
  const canvas = $('map'); canvas.width = state.map.width * TILE; canvas.height = state.map.height * TILE
}

function applySnapshot(msg) {
  state.snapshot = msg
  state.wilds = new Map(msg.state.wilds.map((w) => [w.id, w]))
  const p = msg.state.player
  state.player = { position: p.position, mode: p.mode, team: p.team, activeIndex: p.activeIndex }
  state.targetWildId = p.targetWildId
  $('trainer').textContent = JSON.stringify({ xp: msg.state.trainer.xp, gold: msg.state.trainer.gold, inventory: msg.state.inventory, team: p.team.map((m) => `${m.speciesName} L${m.level} ${m.hp}/${m.hpMax}`), mode: p.mode }, null, 1)
}

function applyEvent(e) {
  const p = state.player
  switch (e.type) {
    case 'moved': p.position = e.to; break
    case 'spawned': state.wilds.set(e.wildId, { id: e.wildId, speciesName: e.speciesName, level: e.level, position: e.position, hp: null, hpMax: null }); break
    case 'attack': {
      if (e.attacker === 'player') { const w = state.wilds.get(Number(e.targetId)); if (w) { w.hp = e.targetHp; state.targetWildId = w.id } }
      else { const m = p.team.find((x) => x.id === e.targetId); if (m) m.hp = e.targetHp; state.targetWildId = Number(e.attackerId) }
      state.flashes.push({ at: e.attacker === 'player' ? state.wilds.get(Number(e.targetId))?.position : p.position, until: performance.now() + 250 })
      break
    }
    case 'wildDefeated': case 'captured': case 'skipped': if (e.type !== 'skipped') state.wilds.delete(e.wildId); if (state.targetWildId === e.wildId) state.targetWildId = null; break
    case 'itemUsed': { const m = p.team.find((x) => x.id === e.pokemonId); if (m) m.hp = e.hp; break }
    case 'switched': p.activeIndex = p.team.findIndex((x) => x.id === e.pokemonId); break
    case 'healed': p.team.forEach((m) => { m.hp = m.hpMax }); p.mode = 'searching'; break
    case 'returning': p.mode = 'returning'; state.targetWildId = null; break
    case 'levelUp': { const m = p.team.find((x) => x.id === e.pokemonId); if (m) m.level = e.level; break }
    case 'evolved': { const m = p.team.find((x) => x.id === e.pokemonId); if (m) m.speciesName = e.to; break }
    case 'stopped': p.mode = 'stopped'; break
  }
}

function draw() {
  const canvas = $('map'), ctx = canvas.getContext('2d')
  if (!state.map || !state.atlasImg) { requestAnimationFrame(draw); return }
  const { map, atlas } = state
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const blit = (name, x, y) => { const f = atlas.frames[name]; if (!f) return; ctx.drawImage(state.atlasImg, f.frame.x, f.frame.y, f.frame.w, f.frame.h, x * TILE, y * TILE, TILE, TILE) }
  for (let i = 0; i < map.width * map.height; i++) {
    const x = i % map.width, y = Math.floor(i / map.width)
    if (map.layers.ground[i]) blit(map.layers.ground[i], x, y)
    if (map.layers.detail[i]) blit(map.layers.detail[i], x, y)
    if ($('showBlocking').checked && map.layers.blocking[i]) { ctx.fillStyle = 'rgba(255,0,0,.35)'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE) }
  }
  ctx.fillStyle = 'rgba(80,160,255,.6)'; ctx.fillRect(map.pokecenter.x * TILE, map.pokecenter.y * TILE, TILE, TILE)
  ctx.font = '11px monospace'
  const bar = (x, y, hp, hpMax, color) => { if (hp == null || !hpMax) return; ctx.fillStyle = '#000'; ctx.fillRect(x * TILE, y * TILE - 6, TILE, 4); ctx.fillStyle = color; ctx.fillRect(x * TILE, y * TILE - 6, TILE * Math.max(0, hp / hpMax), 4) }
  for (const w of state.wilds.values()) {
    ctx.fillStyle = w.id === state.targetWildId ? '#ff4' : '#f66'
    ctx.beginPath(); ctx.arc(w.position.x * TILE + 16, w.position.y * TILE + 16, 10, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.fillText(`${w.speciesName} L${w.level}`, w.position.x * TILE - 4, w.position.y * TILE + 30)
    bar(w.position.x, w.position.y, w.hp, w.hpMax, '#f66')
  }
  if (state.player) {
    const p = state.player, m = p.team[p.activeIndex]
    ctx.fillStyle = p.mode === 'fighting' ? '#f90' : p.mode === 'returning' ? '#9cf' : p.mode === 'healing' ? '#6f6' : '#fff'
    ctx.fillRect(p.position.x * TILE + 6, p.position.y * TILE + 6, 20, 20)
    ctx.fillStyle = '#fff'; ctx.fillText(`${m.speciesName} ${p.mode}`, p.position.x * TILE - 8, p.position.y * TILE - 8)
    bar(p.position.x, p.position.y, m.hp, m.hpMax, '#6f6')
  }
  const now = performance.now()
  state.flashes = state.flashes.filter((f) => f.until > now && f.at)
  for (const f of state.flashes) { ctx.strokeStyle = '#ff0'; ctx.lineWidth = 3; ctx.strokeRect(f.at.x * TILE, f.at.y * TILE, TILE, TILE) }
  requestAnimationFrame(draw)
}

function connect() {
  if (state.ws) state.ws.close()
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
  state.ws = ws
  ws.onopen = () => setStatus('conectado')
  ws.onclose = (e) => setStatus(`fechado ${e.code} ${e.reason}`)
  ws.onmessage = async (ev) => {
    const msg = JSON.parse(ev.data)
    switch (msg.t) {
      case 'hunt.idle': setStatus('sem hunt'); break
      case 'hunt.catchup': setStatus(`catch-up: ${msg.ticksRemaining} ticks restantes`); break
      case 'hunt.summary': log('stopped', `resumo do catch-up: ${JSON.stringify(msg.summary)}`); break
      case 'hunt.snapshot': await loadMap(msg.session.huntId); applySnapshot(msg); setStatus(`hunt ${msg.session.huntId} tick ${msg.state.tick}`); break
      case 'hunt.tick': for (const e of msg.events) { applyEvent(e); if (e.type !== 'moved') log(e.type, `#${e.tick} ${JSON.stringify(e)}`) } break
      case 'hunt.stopped': log('stopped', `hunt parada: ${msg.reason}${msg.healed ? ' (time curado)' : ''}`); setStatus(`parada: ${msg.reason}`); break
      case 'error': log('attack', `erro: ${msg.code} ${msg.message}`); break
    }
  }
}

const send = (obj) => state.ws?.readyState === 1 && state.ws.send(JSON.stringify(obj))
const creds = () => ({ email: $('email').value, password: $('password').value })
$('auth').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('POST', '/auth/login', creds()); setStatus('logado'); connect() } catch (err) { setStatus(String(err.message)) } })
$('register').addEventListener('click', async () => { try { await api('POST', '/auth/register', { ...creds(), name: $('name').value }); setStatus('registrado'); connect() } catch (err) { setStatus(String(err.message)) } })
$('logout').addEventListener('click', async () => { await api('POST', '/auth/logout'); state.ws?.close(); setStatus('saiu') })
$('choose').addEventListener('click', async () => { try { const r = await api('POST', '/trainer/starter', { species: $('starter').value }); log('captured', `inicial: ${r.pokemon.speciesName} L${r.pokemon.level}`) } catch (err) { setStatus(String(err.message)) } })
$('start').addEventListener('click', async () => { try { await api('POST', '/hunts/route-1/start') } catch (err) { setStatus(String(err.message)) } })
$('stop').addEventListener('click', () => send({ t: 'hunt.stop' }))
requestAnimationFrame(draw)
