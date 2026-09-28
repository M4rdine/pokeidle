/**
 * Importa famílias inteiras do dump para o manifest de curadoria.
 *
 * O PORQUÊ. O dump tem 18.602 itens e o manifest curava 70 peças: dezesseis mapas construídos com
 * 0,4% da paleta, que é a causa de eles parecerem pobres. `pnpm assets familias` já mostrava as
 * famílias — corridas de ids contíguos, que é como o Tibia autorou cada terreno —, mas passar
 * oitocentas peças para o manifest à mão é onde a curadoria morreria de novo.
 *
 * O QUE ELE FAZ. Para cada faixa de ids aprovada, escreve uma entrada por peça, já tratando o que
 * o esquema exige: item de mais de um tile ganha `slice`, item com variações de padrão vira uma
 * entrada por padrão. Os nomes saem do apelido da família mais um número, então a folha de
 * aprovação do tileset continua legível.
 *
 * Ele é IDEMPOTENTE: rodar de novo não duplica: as entradas cujo nome já existe são substituídas.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { loadCatalog } from '../src/extract.js'

/** Uma faixa aprovada: o intervalo fechado de ids e o apelido que nomeia as peças. */
interface Faixa { readonly de: number; readonly ate: number; readonly apelido: string }

/*
 * As famílias aprovadas, por bioma. São as que atendem os DEZESSEIS MAPAS QUE EXISTEM — lama,
 * terreno vulcânico e cristal ficaram de fora até haver mapa que os use, que é a mesma regra que
 * tirou seis ícones deste repositório.
 */
const APROVADAS: readonly Faixa[] = [
  // ── chão ──
  { de: 4680, ate: 4701, apelido: 'grama-clara' },
  { de: 4515, ate: 4530, apelido: 'grama-escura' },
  { de: 15917, ate: 15928, apelido: 'grama-florida' },
  { de: 19231, ate: 19283, apelido: 'pedra-trilha' },
  { de: 4394, ate: 4410, apelido: 'rocha-chao' },
  { de: 16060, ate: 16083, apelido: 'caverna-chao' },
  { de: 537, ate: 564, apelido: 'pedra-lavrada' },
  { de: 13946, ate: 13997, apelido: 'areia-pedra' },
  { de: 14434, ate: 14447, apelido: 'praia' },
  { de: 880, ate: 891, apelido: 'costa' },
  { de: 16515, ate: 16528, apelido: 'agua' },
  { de: 6580, ate: 6608, apelido: 'neve' },
  { de: 6612, ate: 6626, apelido: 'neve-fenda' },
  { de: 4621, ate: 4632, apelido: 'costa-gelada' },
  { de: 8952, ate: 8966, apelido: 'chapa-metal' },
  { de: 13503, ate: 13518, apelido: 'cascalho' },
  // ── bloqueante ──
  { de: 4457, ate: 4502, apelido: 'penhasco' },
  { de: 8588, ate: 8624, apelido: 'entulho-caverna' },
  { de: 3613, ate: 3650, apelido: 'arvore' },
  { de: 17561, ate: 17610, apelido: 'conifera' },
  { de: 3750, ate: 3873, apelido: 'folhagem' },
  { de: 14038, ate: 14061, apelido: 'arbusto' },
  { de: 6719, ate: 6753, apelido: 'parede-gelo' },
  { de: 6810, ate: 6837, apelido: 'gelo-espinho' },
  { de: 9502, ate: 9557, apelido: 'pedregulho' },
  { de: 1914, ate: 1946, apelido: 'bloco-rocha' },
  { de: 6159, ate: 6170, apelido: 'grama-alta' },
]

const CAMINHO = 'tools/assets/manifest.json'
const LADO_DE_UM_TILE = 1

async function main(): Promise<void> {
  const gravar = process.argv.includes('--gravar')
  const catalogo = await loadCatalog('assets/extracted-otp2019')
  const manifest = JSON.parse(await readFile(CAMINHO, 'utf8')) as { tiles: Record<string, unknown>[] }
  const porId = new Map(catalogo.items.map((i) => [i.id, i]))

  const novas: Record<string, unknown>[] = []
  const faltando: number[] = []
  for (const { de, ate, apelido } of APROVADAS) {
    let n = 0
    for (let id = de; id <= ate; id++) {
      const item = porId.get(id)
      if (!item) { faltando.push(id); continue }
      const grande = item.width !== LADO_DE_UM_TILE || item.height !== LADO_DE_UM_TILE
      // Uma entrada por VARIAÇÃO: o Tibia guarda as variantes de um chão no mesmo item, em
      // padrões. Sem isto, importar a família traria só a primeira de cada.
      for (let py = 0; py < item.patternY; py++) {
        for (let px = 0; px < item.patternX; px++) {
          n += 1
          novas.push({
            name: `${apelido}-${n}`,
            itemId: id,
            ...(px > 0 && { patternX: px }),
            ...(py > 0 && { patternY: py }),
            ...(grande && { slice: { cols: item.width, rows: item.height } }),
          })
        }
      }
    }
  }

  const existentes = new Set(novas.map((t) => t.name as string))
  const mantidas = manifest.tiles.filter((t) => !existentes.has(t.name as string))
  manifest.tiles = [...mantidas, ...novas]

  console.log(`${APROVADAS.length} famílias -> ${novas.length} peças`)
  console.log(`tiles no manifest: ${mantidas.length} mantidas + ${novas.length} novas = ${manifest.tiles.length}`)
  if (faltando.length > 0) console.log(`ids sem item no catálogo: ${faltando.length} (${faltando.slice(0, 6).join(', ')}…)`)
  if (!gravar) { console.log('\nnada gravado; rode com --gravar'); return }
  await writeFile(CAMINHO, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`\ngravado em ${CAMINHO}`)
}

await main()
