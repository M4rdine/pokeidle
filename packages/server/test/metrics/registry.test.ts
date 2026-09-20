import { describe, expect, it } from 'vitest'
import { createMetrics } from '../../src/metrics/registry.js'

const valorDe = (texto: string, nome: string, rotulos = ''): number | null => {
  const alvo = rotulos === '' ? `${nome} ` : `${nome}{${rotulos}} `
  const linha = texto.split('\n').find((l) => l.startsWith(alvo))
  return linha === undefined ? null : Number(linha.slice(alvo.length))
}

describe('registro de métricas', () => {
  it('exporta no formato Prometheus, com HELP e TYPE em cada família', async () => {
    const m = createMetrics()
    const texto = await m.render()
    for (const nome of ['pokeidle_hunts_active', 'pokeidle_ticks_total', 'pokeidle_errors_total']) {
      expect(texto, nome).toContain(`# HELP ${nome} `)
      expect(texto, nome).toContain(`# TYPE ${nome} `)
    }
  })

  it('inclui as métricas de processo, que respondem metade das perguntas de infraestrutura', async () => {
    const texto = await createMetrics().render()
    expect(texto).toContain('process_resident_memory_bytes')
    expect(texto).toContain('nodejs_eventloop_lag_seconds')
  })

  it('o gancho de tick move duração, atraso e contagem — e nada mais', async () => {
    const m = createMetrics()
    m.hooks.onTick(3, 12, 7)
    const texto = await m.render()
    expect(valorDe(texto, 'pokeidle_ticks_total')).toBe(1)
    expect(valorDe(texto, 'pokeidle_tick_duration_seconds_sum')).toBeCloseTo(0.003, 6)
    expect(valorDe(texto, 'pokeidle_tick_lag_seconds_sum')).toBeCloseTo(0.012, 6)
    // O número de runners é medidor, não vem do contador de ticks.
    expect(valorDe(texto, 'pokeidle_hunts_active')).toBe(7)
  })

  it('caçadas iniciadas e terminadas contam separado, e o motivo vira rótulo', async () => {
    const m = createMetrics()
    m.hooks.onHuntStarted()
    m.hooks.onHuntStarted()
    m.hooks.onHuntFinished('intent')
    m.hooks.onHuntFinished('team-fainted')
    m.hooks.onHuntFinished('team-fainted')
    const texto = await m.render()
    expect(valorDe(texto, 'pokeidle_hunts_started_total')).toBe(2)
    expect(valorDe(texto, 'pokeidle_hunts_finished_total', 'reason="intent"')).toBe(1)
    expect(valorDe(texto, 'pokeidle_hunts_finished_total', 'reason="team-fainted"')).toBe(2)
  })

  it('a persistência mede duração por tipo e conta falha à parte do sucesso', async () => {
    const m = createMetrics()
    m.hooks.onPersistEnd('sync', 't1', 40, true)
    m.hooks.onPersistEnd('sync', 't2', 60, false)
    m.hooks.onPersistEnd('finish', 't3', 10, true)
    const texto = await m.render()
    expect(valorDe(texto, 'pokeidle_persist_duration_seconds_count', 'kind="sync"')).toBe(2)
    expect(valorDe(texto, 'pokeidle_persist_duration_seconds_sum', 'kind="sync"')).toBeCloseTo(0.1, 6)
    expect(valorDe(texto, 'pokeidle_persist_failures_total', 'kind="sync"')).toBe(1)
    // Sem falha registrada, o contador do tipo nem aparece — Prometheus não precisa de zeros.
    expect(valorDe(texto, 'pokeidle_persist_failures_total', 'kind="finish"')).toBeNull()
  })

  it('erro tratado conta por escopo, para o painel dizer onde dói', async () => {
    const m = createMetrics()
    m.hooks.onError('tick')
    m.hooks.onError('tick')
    m.hooks.onError('ws')
    const texto = await m.render()
    expect(valorDe(texto, 'pokeidle_errors_total', 'scope="tick"')).toBe(2)
    expect(valorDe(texto, 'pokeidle_errors_total', 'scope="ws"')).toBe(1)
  })

  it('sockets e catch-up são medidores: sobem, descem e refletem o agora', async () => {
    const m = createMetrics()
    m.hooks.onTick(1, 0, 5)
    m.setCatchingUp(2)
    m.setConnections(3)
    m.setConnections(1)
    const texto = await m.render()
    expect(valorDe(texto, 'pokeidle_hunts_catching_up')).toBe(2)
    expect(valorDe(texto, 'pokeidle_ws_connections')).toBe(1)
  })

  it('dois registros não compartilham estado: um teste não contamina o outro', async () => {
    const a = createMetrics()
    const b = createMetrics()
    a.hooks.onHuntStarted()
    expect(valorDe(await a.render(), 'pokeidle_hunts_started_total')).toBe(1)
    expect(valorDe(await b.render(), 'pokeidle_hunts_started_total')).toBe(0)
  })
})
