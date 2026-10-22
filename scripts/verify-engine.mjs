import { loadEngine, solve } from './engine-host.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const engine = await loadEngine()
const output = { engine: 'gateway-pcr3bp-v1', generated: new Date().toISOString(), cases: [], traces: [] }
const jupiterMu = 126712764.1 / (132712440041.279419 + 126712764.1)
for (const mu of [.01215058560962404, jupiterMu]) {
  for (const point of [1, 2]) {
    const start = performance.now()
    const result = solve(engine, { mu, point, phases: 8, offset: mu < .001 ? .001 : .006,
      guard1: mu < .001 ? .0009 : .0164, guard2: mu < .001 ? .00009 : .00446 })
    result.milliseconds = performance.now() - start
    output.cases.push(result)
    console.log(JSON.stringify({ mu, point, ms: result.milliseconds, period: result.meta[4],
      closure: result.meta[5], drift: result.meta[16], symplectic: result.meta[9], reciprocity: result.meta[26] }))
  }
}
for (const rtol of [1e-8, 1e-10, 1e-12]) {
  const initial = [.7, .12, .08, .15]
  const n = engine.e.gw_trace(.01215058560962404, ...initial, 2, rtol)
  if (!n) throw new Error('Trace failed')
  output.traces.push({ mu: .01215058560962404, initial, rtol, horizon: 2,
    data: engine.copy(engine.e.gw_scratch_ptr(), n) })
}
await mkdir(new URL('../docs/', import.meta.url), { recursive: true })
await writeFile(new URL('../docs/verification-input.json', import.meta.url), JSON.stringify(output))
console.log('Wrote reproducible WASM output for independent SciPy checks.')
