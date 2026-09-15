/**
 * Script manual (não testado por vitest): registra um treinador aleatório, escolhe o
 * inicial, inicia a Rota 1 e abre o WebSocket com o cookie de sessão — imprime os 20
 * primeiros `hunt.tick` e sai. Serve para checar visualmente o handshake, o ritmo dos
 * ticks e o fechamento gracioso do servidor (Ctrl+C nele deve fechar este socket com
 * 1001 e logar "servidor encerrado").
 *
 * Uso: suba o servidor primeiro (`pnpm --filter @pokeidle/server start`, ou `dev`),
 * depois `pnpm --filter @pokeidle/server smoke:ws` numa outra janela. Respeita
 * `APP_ORIGIN` (padrão `http://localhost:3000`) — precisa bater com o do servidor,
 * senão o handshake do WS é rejeitado (S21).
 */
import WebSocket from 'ws'

const ORIGIN = process.env['APP_ORIGIN'] ?? 'http://localhost:3000'
const MAX_TICKS = 20

interface RegisterResponse { readonly trainer: { readonly id: string } }

function randomName(): string {
  // `RegisterSchema.name`: 3-16 chars, só letras/números/espaço — sem hífen nem uuid cru.
  return `Smoke${Date.now().toString().slice(-8)}`
}

async function postJson(path: string, cookie: string | undefined, body: unknown): Promise<Response> {
  const res = await fetch(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} falhou: ${res.status} ${await res.text()}`)
  return res
}

function cookieFrom(res: Response): string {
  const raw = res.headers.get('set-cookie')
  if (!raw) throw new Error('resposta sem set-cookie')
  return raw.split(';')[0]!
}

async function registerAndStart(): Promise<string> {
  const email = `smoke-${Date.now()}@test.dev`
  const registerRes = await postJson('/auth/register', undefined, { email, password: 'senha-forte-123', name: randomName() })
  const cookie = cookieFrom(registerRes)
  const { trainer } = (await registerRes.json()) as RegisterResponse
  process.stdout.write(`registrado: ${email} (trainerId=${trainer.id})\n`)

  await postJson('/trainer/starter', cookie, { species: 'charmander' })
  process.stdout.write('inicial escolhido: charmander\n')

  await postJson('/hunts/route-1/start', cookie, {})
  process.stdout.write('hunt iniciada: route-1\n')

  return cookie
}

function connect(cookie: string): void {
  const wsUrl = `${ORIGIN.replace(/^http/, 'ws')}/ws`
  const socket = new WebSocket(wsUrl, { headers: { cookie, origin: ORIGIN } })
  let ticks = 0

  socket.on('open', () => process.stdout.write(`conectado: ${wsUrl}\n`))
  socket.on('message', (data) => {
    const msg = JSON.parse(data.toString()) as { readonly t: string }
    process.stdout.write(`${JSON.stringify(msg)}\n`)
    if (msg.t !== 'hunt.tick') return
    ticks++
    if (ticks >= MAX_TICKS) socket.close(1000, 'smoke concluído')
  })
  socket.on('close', (code, reason) => {
    process.stdout.write(`socket fechado: ${code} ${reason.toString()}\n`)
    process.exit(0)
  })
  socket.on('error', (error) => {
    process.stdout.write(`erro no socket: ${error.message}\n`)
    process.exit(1)
  })
}

async function main(): Promise<void> {
  const cookie = await registerAndStart()
  connect(cookie)
}

main().catch((error: unknown) => {
  process.stdout.write(`falha no smoke test: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
