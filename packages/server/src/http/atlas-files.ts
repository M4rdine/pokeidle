/**
 * Os únicos arquivos do atlas servidos ao navegador.
 *
 * ALLOWLIST, e não listagem da pasta: o nome vem da URL, e servir o que estiver em `ASSETS_DIR`
 * transformaria um arquivo esquecido ali numa porta aberta. O preço é este — atlas novo só chega
 * ao navegador depois de ser declarado aqui —, e ele já se pagou: o atlas de golpes voltou 404 no
 * primeiro teste, que é onde se descobre, em vez de em produção.
 */
export const ATLAS_FILES: Readonly<Record<string, string>> = {
  'tiles.png': 'image/png',
  'tiles.json': 'application/json',
  'pokemon.png': 'image/png',
  'pokemon.json': 'application/json',
  'golpes.png': 'image/png',
  'golpes.json': 'application/json',
}
