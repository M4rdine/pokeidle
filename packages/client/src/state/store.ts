export interface SubscribeOptions<S> { readonly immediate?: boolean; readonly equals?: (a: S, b: S) => boolean }
export interface Store<T> {
  get(): T
  set(next: T): void
  update(fn: (current: T) => T): void
  subscribe<S>(selector: (state: T) => S, fn: (value: S, prev: S | undefined) => void, opts?: SubscribeOptions<S>): () => void
}

/** Store imutável: `set`/`update` trocam o objeto inteiro; cada assinante vê só a fatia do seu selector. */
export function createStore<T>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<(next: T, prev: T) => void>()
  const set = (next: T): void => {
    const prev = state
    state = next
    for (const l of [...listeners]) l(next, prev)
  }
  return {
    get: () => state,
    set,
    update: (fn) => set(fn(state)),
    subscribe: (selector, fn, opts = {}) => {
      const equals = opts.equals ?? Object.is
      let last = selector(state)
      if (opts.immediate ?? true) fn(last, undefined)
      const listener = (next: T): void => {
        const value = selector(next)
        if (equals(value, last)) return
        const prev = last
        last = value
        fn(value, prev)
      }
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
