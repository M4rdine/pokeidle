// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
// O painel é servido como arquivo estático, não passa pelo build do cliente; o teste importa o
// mesmo arquivo que o navegador recebe.
import { parseMetrics, quantilDeBuckets } from '../../public/metrics/painel.js'

const EXEMPLO = `# HELP pokeidle_hunts_active Caçadas simuladas no tick mais recente.
# TYPE pokeidle_hunts_active gauge
pokeidle_hunts_active 12
# HELP pokeidle_hunts_finished_total Caçadas terminadas desde o boot, por motivo.
# TYPE pokeidle_hunts_finished_total counter
pokeidle_hunts_finished_total{reason="intent"} 3
pokeidle_hunts_finished_total{reason="team-fainted"} 1
# TYPE pokeidle_tick_duration_seconds histogram
pokeidle_tick_duration_seconds_bucket{le="0.001"} 10
pokeidle_tick_duration_seconds_bucket{le="0.005"} 80
pokeidle_tick_duration_seconds_bucket{le="0.01"} 95
pokeidle_tick_duration_seconds_bucket{le="+Inf"} 100
pokeidle_tick_duration_seconds_sum 0.42
pokeidle_tick_duration_seconds_count 100
`

describe('leitura do formato Prometheus', () => {
  it('lê métrica sem rótulo, com rótulo e ignora comentário', () => {
    const amostras = parseMetrics(EXEMPLO)
    expect(amostras.find((a) => a.nome === 'pokeidle_hunts_active')).toEqual({
      nome: 'pokeidle_hunts_active', rotulos: {}, valor: 12,
    })
    expect(amostras.filter((a) => a.nome === 'pokeidle_hunts_finished_total')).toEqual([
      { nome: 'pokeidle_hunts_finished_total', rotulos: { reason: 'intent' }, valor: 3 },
      { nome: 'pokeidle_hunts_finished_total', rotulos: { reason: 'team-fainted' }, valor: 1 },
    ])
    expect(amostras.some((a) => a.nome.startsWith('#'))).toBe(false)
  })

  it('não confunde vírgula dentro de aspas com separador de rótulo', () => {
    const [amostra] = parseMetrics('pokeidle_http_requests_total{route="/a,b",method="GET"} 7\n')
    expect(amostra?.rotulos).toEqual({ route: '/a,b', method: 'GET' })
  })

  it('linha malformada é ignorada em vez de derrubar o painel', () => {
    expect(parseMetrics('lixo sem valor numerico\n\npokeidle_x 1\n')).toEqual([
      { nome: 'pokeidle_x', rotulos: {}, valor: 1 },
    ])
  })
})

describe('quantil a partir dos buckets', () => {
  it('devolve o teto do primeiro bucket que cobre o quantil', () => {
    const amostras = parseMetrics(EXEMPLO)
    // 50 % de 100 amostras cai no bucket le="0.005" (cumulativo 80).
    expect(quantilDeBuckets(amostras, 'pokeidle_tick_duration_seconds', 0.5)).toBe(0.005)
    // 95 % cai exatamente no le="0.01".
    expect(quantilDeBuckets(amostras, 'pokeidle_tick_duration_seconds', 0.95)).toBe(0.01)
  })

  it('devolve null quando o quantil só é coberto pelo bucket infinito', () => {
    // 99 % de 100 = 99, acima do cumulativo 95 do último bucket finito.
    expect(quantilDeBuckets(parseMetrics(EXEMPLO), 'pokeidle_tick_duration_seconds', 0.99)).toBeNull()
  })

  it('devolve null sem amostra nenhuma, em vez de fingir um número', () => {
    expect(quantilDeBuckets(parseMetrics(''), 'pokeidle_tick_duration_seconds', 0.5)).toBeNull()
  })
})
