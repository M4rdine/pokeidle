/**
 * Os Town Maps vendorizados, um por `region.townMap`.
 *
 * São IMPORTADOS, e não montados como `/assets/maps/${id}.png`: assim o bundler carimba o hash no
 * nome, o arquivo entra no cache imutável, e — o que importa mais — um `townMap` apontando para
 * um mapa que não existe quebra o BUILD em vez de virar uma imagem quebrada em produção.
 *
 * Duas regiões podem apontar para o mesmo mapa. As Terras Altas são a Kanto tardia: Túnel Rocha,
 * Zona Safári, Usina, Ilhas Espuma, Estrada da Vitória e Planalto Índigo são todos marcos que já
 * estão no mapa de Kanto.
 */
import kanto from '../../../styles/arte/mapas/kanto.webp'

const MAPAS: Readonly<Record<string, string>> = { kanto }

/** A arte do mapa, ou `null` quando a região aponta para um que ainda não foi vendorizado. */
export const townMap = (id: string): string | null => MAPAS[id] ?? null
