/**
 * Os nomes de quadro do atlas: o CONTRATO entre quem constrói e quem desenha.
 *
 * Mora aqui, e não no cliente nem na ferramenta, porque os dois precisam concordar. Escrito em
 * dois lugares, um nome destes se descola no primeiro renomeio e o efeito some da tela sem erro
 * nenhum — o `textures[nome]` devolve `undefined`, o código cai no caminho de reserva, e ninguém
 * procura o que não quebrou. Neste projeto isso já aconteceu com um token de CSS.
 */

/**
 * O quadro de um projétil, por direção.
 *
 * `px`/`py` são a célula do padrão 3×3 do `.dat`: o sinal do deslocamento mais um. A célula do
 * centro (1,1) existe no formato e não é usada — nada voa para onde já está.
 */
export const projetilFrameName = (id: number, px: number, py: number): string => `projetil-${id}-${px}${py}`

/** A animação de um efeito de impacto; as fases são os quadros dela. */
export const efeitoAnimName = (id: number): string => `efeito-${id}`

/** A célula do padrão 3×3 para um deslocamento. Ver `projetilFrameName`. */
export const direcaoDoProjetil = (dx: number, dy: number): { readonly px: number; readonly py: number } =>
  ({ px: Math.sign(dx) + 1, py: Math.sign(dy) + 1 })
