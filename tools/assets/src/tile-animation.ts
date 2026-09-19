/** A fase 0 mantém o nome simples do tile: é o nome que o mapa, o Tiled e a prévia usam. */
export function phaseFrameName(tile: string, phase: number): string {
  return phase === 0 ? tile : `${tile}_${phase}`
}

/** Todos os quadros de um tile, em ordem de fase. Um tile de fase única devolve só o nome simples. */
export function phaseFrameNames(tile: string, phases: number): string[] {
  return Array.from({ length: phases }, (_unused, phase) => phaseFrameName(tile, phase))
}

const PHASE_SUFFIX = /_\d+$/

/** Quadro de fase maior que zero: não entra no tileset do Tiled nem pode ser nome de entrada do manifesto. */
export function isPhaseFrame(name: string): boolean {
  return PHASE_SUFFIX.test(name)
}
