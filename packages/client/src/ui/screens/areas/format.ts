/** Formatação dos números do analisador. Separado para a tabela e a linha falarem igual. */

const MIL = 1000

/** 1240 vira "1,2k": numa lista de oito áreas o que importa é comparar, não somar. */
export function compact(valor: number): string {
  if (valor < MIL) return String(Math.round(valor))
  const milhares = valor / MIL
  return `${milhares.toFixed(milhares < 10 ? 1 : 0).replace('.', ',')}k`
}

/** O confronto vira texto porque cor sozinha não é informação para quem não a distingue. */
export function matchupLabel(multiplicador: number): string {
  if (multiplicador === 0) return 'não fere'
  if (multiplicador >= 2) return 'arrasa'
  if (multiplicador > 1) return 'vantagem'
  if (multiplicador < 1) return 'desvantagem'
  return 'neutro'
}

export const matchupClass = (multiplicador: number): string =>
  multiplicador === 0 ? 'matchup-none' : multiplicador > 1 ? 'matchup-good' : multiplicador < 1 ? 'matchup-bad' : 'matchup-even'

export const percent = (fracao: number): string => `${Math.round(fracao * 100)}%`

