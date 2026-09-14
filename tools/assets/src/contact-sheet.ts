import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Catalog, CatalogItem, CatalogOutfit } from './catalog.js'
import { directionName, loadCatalog } from './extract.js'

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

export async function writeContactSheet(extractedDir: string, opts: ContactSheetOptions): Promise<string> {
  const catalog = await loadCatalog(extractedDir)
  const path = join(extractedDir, 'index.html')
  await writeFile(path, renderContactSheet(catalog, opts))
  return path
}
