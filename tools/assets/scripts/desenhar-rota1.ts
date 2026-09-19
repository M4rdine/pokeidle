/**
 * Compõe a Rota 1 usando o tileset curado: lagoa com margem orgânica, caminho sinuoso com
 * transição de terreno, grama variada, bosques com copa acima do jogador e props espalhados.
 * Escreve o .tmj de autoria; o mapa do jogo sai do `map-import` como sempre.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const W = 40
const H = 30
const TMJ = 'tools/assets/maps/route-1.tmj'

const tsj = JSON.parse(readFileSync('assets/atlas/tiles.tsj', 'utf8')) as {
  tiles: { id: number; properties: { value: string }[] }[]
}
const idByName = new Map(tsj.tiles.map((t) => [t.properties[0]!.value, t.id]))
const FIRSTGID = 1
const gid = (name: string): number => {
  const id = idByName.get(name)
  if (id === undefined) throw new Error(`tile "${name}" não está no tileset`)
  return id + FIRSTGID
}

/** Ruído determinístico em [0,1) a partir de coordenadas inteiras. */
function noise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

type Material = 'grass' | 'dirt' | 'water' | 'sand'
const corners: Material[][] = Array.from({ length: H + 1 }, () => Array.from({ length: W + 1 }, (): Material => 'grass'))

// --- lagoa: elipse com raio perturbado por ângulo, para a margem não ficar geométrica
const POND = { cx: 10.5, cy: 19.5, rx: 6.2, ry: 4.2 }
for (let cy = 0; cy <= H; cy++) {
  for (let cx = 0; cx <= W; cx++) {
    const dx = (cx - POND.cx) / POND.rx
    const dy = (cy - POND.cy) / POND.ry
    const ang = Math.atan2(dy, dx)
    const wobble = 0.88 + 0.18 * Math.sin(ang * 3 + 1.2) + 0.07 * Math.sin(ang * 5)
    const d2 = dx * dx + dy * dy
    if (d2 < wobble) corners[cy]![cx] = 'water'
    // faixa de areia na margem: a borda entre areia e água lê como praia, e a de areia com
    // grama usa o pincel grama-areia, então a lagoa deixa de ser um recorte duro no gramado.
    else if (d2 < wobble * 1.45) corners[cy]![cx] = 'sand'
  }
}

// --- caminho: polilinha com curvas suaves, engrossada por distância
const WAY: [number, number][] = [
  [4, 25.2], [10, 25.2], [12.5, 24.2], [19, 24.2], [20.8, 22], [20.8, 14],
  [22.5, 12.2], [30, 12.2], [32.8, 10], [32.8, 6],
]
function distToPath(px: number, py: number): number {
  let best = Infinity
  for (let i = 0; i + 1 < WAY.length; i++) {
    const [ax, ay] = WAY[i]!
    const [bx, by] = WAY[i + 1]!
    const vx = bx - ax
    const vy = by - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)))
    const d = Math.hypot(px - (ax + t * vx), py - (ay + t * vy))
    if (d < best) best = d
  }
  return best
}
for (let cy = 0; cy <= H; cy++) {
  for (let cx = 0; cx <= W; cx++) {
    if (corners[cy]![cx] === 'water' || corners[cy]![cx] === 'sand') continue
    const largura = 1.35 + 0.2 * Math.sin(cx * 0.55 + cy * 0.31)
    if (distToPath(cx, cy) < largura) corners[cy]![cx] = 'dirt'
  }
}

// --- praça do Centro Pokémon: chão de laje, com cantos arredondados pelo ruído
const PRACA = { x0: 30, y0: 3, x1: 36, y1: 8 }
const naPraca = (cx: number, cy: number): boolean =>
  cx >= PRACA.x0 && cx <= PRACA.x1 && cy >= PRACA.y0 && cy <= PRACA.y1
/** Plataforma de laje no meio da clareira; o resto da clareira é terra, que tem transição. */
const naPlataforma = (cx: number, cy: number): boolean =>
  cx >= PRACA.x0 + 1 && cx <= PRACA.x1 - 1 && cy >= PRACA.y0 + 1 && cy <= PRACA.y1 - 1

for (let cy = 0; cy <= H; cy++) {
  for (let cx = 0; cx <= W; cx++) {
    if (naPraca(cx, cy) && corners[cy]![cx] === 'grass') corners[cy]![cx] = 'dirt'
  }
}

/** Tira cantos isolados: um canto cercado pelo material vizinho vira vizinho, e vice-versa. */
function suavizar(alvo: Material, vizinhos: number): void {
  const copia = corners.map((linha) => [...linha])
  for (let cy = 1; cy < H; cy++) {
    for (let cx = 1; cx < W; cx++) {
      let iguais = 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        if (copia[cy + dy]![cx + dx] === alvo) iguais++
      }
      if (copia[cy]![cx] !== alvo && iguais >= 3) corners[cy]![cx] = alvo
      if (copia[cy]![cx] === alvo && iguais <= vizinhos) corners[cy]![cx] = copia[cy]![cx - 1] === alvo ? alvo : copia[cy - 1]![cx]!
    }
  }
}
suavizar('water', 0)
suavizar('water', 0)
suavizar('dirt', 0)

const ground: string[] = []
const detail: (string | null)[] = []
const canopy: (string | null)[] = []
const blocked: boolean[] = []

const CODE = ['a', 'b'] as const
const code4 = (tr: Material, br: Material, bl: Material, tl: Material, from: Material): string =>
  [tr, br, bl, tl].map((m) => CODE[m === from ? 0 : 1]).join('')

const GRASS = ['grass', 'grass', 'grass', 'grass-b', 'grass-c', 'grass-d']
const DIRT = ['dirt', 'dirt', 'dirt-b', 'dirt-c']
const SAND = ['sand', 'sand', 'sand-b', 'beach']

function tileFor(x: number, y: number): string {
  const tl = corners[y]![x]!
  const tr = corners[y]![x + 1]!
  const bl = corners[y + 1]![x]!
  const br = corners[y + 1]![x + 1]!
  const set = new Set([tl, tr, bl, br])
  if (set.size === 1) {
    const m = tl
    if (m === 'water') return 'water'
    if (m === 'sand') return SAND[Math.floor(noise(x, y, 9) * SAND.length)]!
    if (m === 'dirt') return DIRT[Math.floor(noise(x, y, 7) * DIRT.length)]!
    return GRASS[Math.floor(noise(x, y, 3) * GRASS.length)]!
  }
  const so = (a: Material, b: Material): boolean => set.size === 2 && set.has(a) && set.has(b)
  if (so('grass', 'water')) return `grama-agua-${code4(tr, br, bl, tl, 'grass')}`
  if (so('grass', 'dirt')) return `grama-terra-${code4(tr, br, bl, tl, 'grass')}`
  if (so('grass', 'sand')) return `grama-areia-${code4(tr, br, bl, tl, 'grass')}`
  // areia com água é a linha d'água: sem transição própria, vence quem tem mais cantos.
  const agua = [tr, br, bl, tl].filter((m) => m === 'water').length
  if (set.has('water')) return agua >= 3 ? 'water' : SAND[Math.floor(noise(x, y, 9) * SAND.length)]!
  if (set.has('sand')) return SAND[Math.floor(noise(x, y, 9) * SAND.length)]!
  return DIRT[Math.floor(noise(x, y, 7) * DIRT.length)]!
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x
    ground[i] = naPlataforma(x, y) ? 'beach-b' : tileFor(x, y)
    detail[i] = null
    canopy[i] = null
    blocked[i] = ground[i] === 'water'
  }
}

// --- bosque de borda: árvores encostadas formando a moldura do mapa
const TREES = ['tree-oak', 'tree-round', 'tree-pine']
function plantar(x: number, y: number, kind: string, comCopa: boolean): void {
  if (x < 0 || y < 0 || x + 1 >= W || y + 1 >= H) return
  const alvo = [x, x + 1].flatMap((tx) => [y, y + 1].map((ty) => ty * W + tx))
  if (alvo.some((i) => detail[i] !== null || ground[i] === 'water')) return
  const topo = comCopa ? canopy : detail
  topo[y * W + x] = `${kind}-x0-y0`
  topo[y * W + x + 1] = `${kind}-x1-y0`
  detail[(y + 1) * W + x] = `${kind}-x0-y1`
  detail[(y + 1) * W + x + 1] = `${kind}-x1-y1`
  blocked[(y + 1) * W + x] = true
  blocked[(y + 1) * W + x + 1] = true
  if (!comCopa) {
    blocked[y * W + x] = true
    blocked[y * W + x + 1] = true
  }
}

for (let x = 0; x < W; x += 2) {
  plantar(x, 0, TREES[Math.floor(noise(x, 0, 21) * TREES.length)]!, false)
  plantar(x, H - 2, TREES[Math.floor(noise(x, H, 22) * TREES.length)]!, false)
}
for (let y = 2; y < H - 2; y += 2) {
  plantar(0, y, TREES[Math.floor(noise(0, y, 23) * TREES.length)]!, false)
  plantar(W - 2, y, TREES[Math.floor(noise(W, y, 24) * TREES.length)]!, false)
}

// --- bosques internos: grupos de árvores longe do caminho e da praça
const livreParaArvore = (x: number, y: number): boolean => {
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const i = (y + dy) * W + x + dx
      if (ground[i] === 'water' || detail[i] !== null || canopy[i] !== null) return false
      if (naPraca(x + dx, y + dy)) return false
      if (distToPath(x + dx + 0.5, y + dy + 0.5) < 1.9) return false
    }
  }
  return true
}
const CLUSTERS: [number, number][] = [
  [5, 4], [8, 6], [13, 4], [17, 6], [22, 4], [26, 4], [30, 12], [33, 15],
  [6, 12], [4, 9], [24, 19], [28, 21], [33, 22], [16, 26], [11, 27], [21, 25], [6, 21], [19, 9],
  [26, 15], [31, 18], [35, 11], [27, 25], [34, 26], [24, 8], [14, 13], [9, 14], [16, 17], [12, 21],
]
for (const [bx, by] of CLUSTERS) {
  for (let n = 0; n < 4; n++) {
    const x = bx + Math.floor(noise(bx + n, by, 31) * 5) - 2
    const y = by + Math.floor(noise(bx, by + n, 32) * 5) - 2
    if (x % 1 !== 0) continue
    if (livreParaArvore(x, y)) plantar(x, y, TREES[Math.floor(noise(x, y, 33) * TREES.length)]!, true)
  }
}

// --- props espalhados na grama
const PROPS = ['bush-flower', 'bush', 'grass-tuft']
const PROPS1: string[] = ['flowers-pink', 'flowers-white', 'pebbles', 'stones', 'twigs', 'branch']
for (let y = 2; y < H - 2; y++) {
  for (let x = 2; x < W - 2; x++) {
    const i = y * W + x
    if (detail[i] !== null || canopy[i] !== null || blocked[i]) continue
    if (!ground[i]!.startsWith('grass')) continue
    if (naPraca(x, y)) continue
    if (distToPath(x + 0.5, y + 0.5) < 2.2) continue
    const r = noise(x, y, 41)
    if (r < 0.022) {
      detail[i] = PROPS1[Math.floor(noise(x, y, 42) * PROPS1.length)]!
    } else if (r < 0.034 && x + 1 < W - 2 && detail[i + 1] === null && canopy[i + 1] === null) {
      const kind = PROPS[Math.floor(noise(x, y, 43) * PROPS.length)]!
      detail[i] = `${kind}-x0-y0`
      detail[i + 1] = `${kind}-x1-y0`
    }
  }
}

// --- trecho pedregoso: agrupa pedras em vez de espalhar, para ler como afloramento
for (const [rx, ry] of [[29, 17], [30, 18], [31, 17], [30, 16], [33, 20], [34, 21], [35, 24], [34, 25], [26, 22], [27, 23]] as [number, number][]) {
  const i = ry * W + rx
  if (detail[i] !== null || canopy[i] !== null || blocked[i]) continue
  if (!ground[i]!.startsWith('grass')) continue
  detail[i] = noise(rx, ry, 51) < 0.5 ? 'stones' : 'pebbles'
}
for (const [rx, ry] of [[30, 17], [34, 24]] as [number, number][]) {
  const i = ry * W + rx
  if (detail[i] !== null || canopy[i] !== null) continue
  detail[i] = 'cave-rock-x0-y0'
  detail[i + W] = 'cave-rock-x0-y1'
  blocked[i] = true
  blocked[i + W] = true
}

// --- árvores emoldurando a praça, no lugar de cerca (a cerca em linha vira um rabisco branco)
for (const [tx, ty] of [[PRACA.x0 - 3, PRACA.y0 - 1], [PRACA.x0 - 3, PRACA.y1], [PRACA.x1 + 1, PRACA.y0 - 1], [PRACA.x1 + 1, PRACA.y1]] as [number, number][]) {
  if (livreParaArvore(tx, ty)) plantar(tx, ty, 'tree-round', true)
}

const tmj = JSON.parse(readFileSync(TMJ, 'utf8')) as {
  layers: ({ type: string; name: string; data?: number[] } & Record<string, unknown>)[]
}
const layer = (name: string) => tmj.layers.find((l) => l.type === 'tilelayer' && l.name === name)!
layer('ground').data = ground.map((n) => gid(n))
layer('detail').data = detail.map((n) => (n === null ? 0 : gid(n)))
layer('canopy').data = canopy.map((n) => (n === null ? 0 : gid(n)))
layer('blocking').data = blocked.map((b) => (b ? gid('mountain') : 0))
writeFileSync(TMJ, JSON.stringify(tmj, null, 1))

const cont = { arvores: canopy.filter(Boolean).length / 2, props: detail.filter(Boolean).length, bloqueados: blocked.filter(Boolean).length }
process.stdout.write(`rota desenhada: ${JSON.stringify(cont)}\n`)
