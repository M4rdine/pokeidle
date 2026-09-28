import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PixiSpritesheet } from './atlas.js'
import type { Catalog, CatalogItem, CatalogOutfit } from './catalog.js'
import { directionName, loadCatalog } from './extract.js'
import { familiasDe, type Familia, type Genero } from './familias.js'

export interface ContactSheetOptions {
  readonly onlyMultiTileOutfits: boolean
  readonly groundItemsOnly: boolean
}

const STYLE = `
body{font-family:system-ui;background:#222;color:#eee;margin:0;padding:16px}
section{display:flex;flex-wrap:wrap;gap:8px}
figure{margin:0;padding:4px;background:#333;border-radius:4px;text-align:center;min-width:72px}
figure img{image-rendering:pixelated;display:block;margin:0 auto}
figcaption{font-size:12px;margin-top:4px}
input{font-size:16px;padding:6px;margin-bottom:12px;width:200px}
h2{margin:24px 0 8px}
`

const SCRIPT = `const input=document.querySelector('input');
input.addEventListener('input',()=>{const q=input.value.trim();
for(const f of document.querySelectorAll('figure')){f.hidden=q!==''&&!f.dataset.id.startsWith(q)}});`

function outfitFigure(o: CatalogOutfit): string {
  const src = `outfits/${o.id}/${directionName(o.directions, Math.min(2, o.directions - 1))}_0.png`
  return `<figure data-id="${o.id}"><img src="${src}" width="${o.width * 32}" height="${o.height * 32}" loading="lazy"><figcaption>#${o.id} · ${o.phases}f</figcaption></figure>`
}

function itemFigure(i: CatalogItem): string {
  return `<figure data-id="${i.id}"><img src="items/${i.id}_0_0.png" width="${i.width * 32}" height="${i.height * 32}" loading="lazy"><figcaption>#${i.id}</figcaption></figure>`
}

export function renderContactSheet(catalog: Catalog, opts: ContactSheetOptions): string {
  const outfits = catalog.outfits.filter((o) => !opts.onlyMultiTileOutfits || o.width > 1 || o.height > 1)
  const items = catalog.items.filter((i) => !opts.groundItemsOnly || i.isGround)
  return `<!doctype html><meta charset="utf-8"><title>Pokeidle contact sheet</title><style>${STYLE}</style>
<input placeholder="filtrar por id" autofocus>
<h2>Outfits (${outfits.length})</h2><section>${outfits.map(outfitFigure).join('')}</section>
<h2>Itens (${items.length})</h2><section>${items.map(itemFigure).join('')}</section>
<script>${SCRIPT}</script>`
}

/** Folha de aprovação do tileset: cada peça recortada do atlas, com o nome embaixo. */
export function renderTilesetSheet(sheet: PixiSpritesheet): string {
  const cells = Object.entries(sheet.frames).map(([name, f]) => {
    const y = f.frame.y === 0 ? '0px' : `-${f.frame.y}px`
    return `<figure data-id="${name}"><span style="width:${f.frame.w}px;height:${f.frame.h}px;display:block;image-rendering:pixelated;background-image:url(${sheet.meta.image});background-position:-${f.frame.x}px ${y}"></span><figcaption>${name}</figcaption></figure>`
  })
  return `<!doctype html><meta charset="utf-8"><title>Tileset do Pokeidle</title><style>${STYLE}</style>
<input placeholder="filtrar por nome" autofocus>
<h2>Tiles (${cells.length})</h2><section>${cells.join('')}</section>
<script>${SCRIPT}</script>`
}

export async function writeContactSheet(extractedDir: string, opts: ContactSheetOptions): Promise<string> {
  const catalog = await loadCatalog(extractedDir)
  const path = join(extractedDir, 'index.html')
  await writeFile(path, renderContactSheet(catalog, opts))
  return path
}

/**
 * A folha de FAMÍLIAS: cada corrida de ids contíguos vira uma tira, da maior para a menor.
 *
 * É a folha que torna a curadoria possível. A de contato mostra os 18.602 itens numa grade só, e
 * ninguém escolhe olhando isso; aqui as peças de um mesmo terreno aparecem lado a lado, na ordem
 * em que foram autoradas — chão, bordas, cantos —, e a decisão passa a ser por FAMÍLIA.
 *
 * As tiras trazem o intervalo de ids no título, que é o que se copia para o manifest.
 */
function tiraDaFamilia(f: Familia): string {
  const pecas = f.ids.map((id) => `<img src="items/${id}_0_0.png" title="#${id}" loading="lazy">`).join('')
  const faixa = f.primeiro === f.ultimo ? `#${f.primeiro}` : `#${f.primeiro}–${f.ultimo}`
  return `<figure class="familia" data-id="${f.primeiro}" data-n="${f.ids.length}">
<figcaption>${faixa} · ${f.ids.length} peça(s)</figcaption><div class="tira">${pecas}</div></figure>`
}

const ESTILO_FAMILIA = `
.familia{display:block;margin:0 0 14px;padding:8px;background:#2b2b2b;border-radius:6px}
.familia figcaption{font-size:12px;color:#9ab;margin-bottom:6px;font-variant-numeric:tabular-nums}
.tira{display:flex;flex-wrap:wrap;gap:2px}
.tira img{width:32px;height:32px;image-rendering:pixelated;background:#111}
`

export function renderFamilySheet(catalog: Catalog, minimo = 1): string {
  const secao = (rotulo: string, genero: Genero): string => {
    const fam = familiasDe(catalog.items, genero).filter((f) => f.ids.length >= minimo)
    const total = fam.reduce((n, f) => n + f.ids.length, 0)
    return `<h2>${rotulo} — ${fam.length} famílias, ${total} peças</h2>${fam.map(tiraDaFamilia).join('')}`
  }
  return `<!doctype html><meta charset="utf-8"><title>Famílias de tiles</title>
<style>${STYLE}${ESTILO_FAMILIA}</style>
<input placeholder="filtrar pelo id inicial" autofocus>
<p style="color:#9ab">Cada tira é uma corrida de ids contíguos — no Tibia, as peças de um mesmo
terreno foram autoradas juntas. Famílias com menos de ${minimo} peça(s) estão de fora.</p>
${secao('Chão', 'chao')}
${secao('Bloqueante', 'bloqueante')}
<script>${SCRIPT.replace('figure', 'figure.familia')}</script>`
}

export async function writeFamilySheet(extractedDir: string, minimo: number): Promise<string> {
  const catalog = await loadCatalog(extractedDir)
  const path = join(extractedDir, 'familias.html')
  await writeFile(path, renderFamilySheet(catalog, minimo))
  return path
}
