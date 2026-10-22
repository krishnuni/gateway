export interface Core {
  memory: WebAssembly.Memory
  [key: string]: WebAssembly.ExportValue
}
export type Api = Core & Record<string, (...args: number[]) => number>
let pending: Promise<Api> | undefined
export function loadCore(): Promise<Api> {
  return pending ??= (async () => {
    const response = await fetch(new URL('../../public/engine/gateway_core.wasm', import.meta.url))
    if (!response.ok) throw new Error('The numerical engine could not be downloaded. Retry when the connection is available.')
    const bytes = await response.arrayBuffer()
    const result = await WebAssembly.instantiate(bytes, {})
    return result.instance.exports as Api
  })()
}
export function values(api: Api, pointer: number, length: number): Float64Array {
  return new Float64Array(api.memory.buffer, pointer, length).slice()
}
export function message(api: Api, pointer: number, length: number): string {
  return new TextDecoder().decode(new Uint8Array(api.memory.buffer, pointer, length))
}
