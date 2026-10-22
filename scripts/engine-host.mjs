import { readFile } from 'node:fs/promises'
export async function loadEngine() {
  const binary = await readFile(new URL('../public/engine/gateway_core.wasm', import.meta.url))
  const { instance } = await WebAssembly.instantiate(binary, {})
  const e = instance.exports
  const copy = (ptr, len) => Array.from(new Float64Array(e.memory.buffer, ptr, len))
  const text = (ptr, len) => new TextDecoder().decode(new Uint8Array(e.memory.buffer, ptr, len))
  return { e, copy, text }
}

export function solve(engine, options = {}) {
  const { e, copy, text } = engine
  const o = { mu: .01215058560962404, point: 1, offset: .006, horizon: 5, phases: 16,
    epsilon: 1e-6, rtol: 1e-11, guard1: .0164, guard2: .00446, ensemble: 0,
    seed: 1729, x: .82, y: 0, angle: 1.2, spread: .5, ...options }
  if (!e.gw_begin(o.mu, o.point, o.offset, o.horizon, o.phases, o.epsilon, o.rtol,
    o.guard1, o.guard2, o.ensemble, o.seed, o.x, o.y, o.angle, o.spread)) {
    throw new Error(text(e.gw_input_error_ptr(), e.gw_input_error_len()))
  }
  const paths = []; let status; let calls = 0
  do {
    status = e.gw_step(128)
    if (status === 1) paths.push({
      description: copy(e.gw_descriptor_ptr(), 12),
      samples: copy(e.gw_path_ptr(), e.gw_path_len()),
      sections: copy(e.gw_section_ptr(), e.gw_section_len()),
    })
    if (++calls > 200000) throw new Error('Job work limit')
  } while (status < 2)
  if (status === 3) throw new Error(text(e.gw_error_ptr(), e.gw_error_len()))
  return {
    options: o, meta: copy(e.gw_meta_ptr(), 40),
    orbit: copy(e.gw_orbit_ptr(), e.gw_orbit_len()),
    matrix: copy(e.gw_matrix_ptr(), 16), paths,
  }
}
