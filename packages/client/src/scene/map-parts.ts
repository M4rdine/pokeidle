/** Uma posição de tile na camada, em unidades de tile (não em pixels). */
export interface TilePlacement {
  readonly name: string
  readonly col: number
  readonly row: number
}

export interface LayerParts {
  readonly baked: readonly TilePlacement[]
  readonly animated: readonly TilePlacement[]
}

/**
 * Separa uma camada do mapa entre o que entra na textura assada e o que vira sprite animado.
 * Anima quem tem mais de um quadro declarado no atlas; o resto é assado, inclusive o tile de
 * uma fase só, que não teria o que animar.
 */
export function splitLayer(
  names: readonly (string | null)[],
  width: number,
  animations: Readonly<Record<string, readonly string[]>>,
): LayerParts {
  const baked: TilePlacement[] = []
  const animated: TilePlacement[] = []
  names.forEach((name, i) => {
    if (name === null) return
    const placement: TilePlacement = { name, col: i % width, row: Math.floor(i / width) }
    const frames = animations[name]
    if (frames && frames.length > 1) animated.push(placement)
    else baked.push(placement)
  })
  return { baked, animated }
}
