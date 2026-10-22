import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const local = resolve(root, '..', '.gateway-tools')
const executable = process.platform === 'win32' ? 'cargo.exe' : 'cargo'
const localCargo = resolve(local, 'cargo', 'bin', executable)
const env = { ...process.env }
if (existsSync(localCargo)) {
  env.CARGO_HOME = resolve(local, 'cargo')
  env.RUSTUP_HOME = resolve(local, 'rustup')
}
const result = spawnSync(existsSync(localCargo) ? localCargo : 'cargo',
  ['build', '--manifest-path', 'rust/Cargo.toml', '--target', 'wasm32-unknown-unknown', '--release'],
  { cwd: root, env, stdio: 'inherit' })
if (result.error) throw new Error('Rust is required. Install rustup and run rustup target add wasm32-unknown-unknown.', { cause: result.error })
if (result.status !== 0) process.exit(result.status ?? 1)
mkdirSync(resolve(root, 'public/engine'), { recursive: true })
copyFileSync(resolve(root, 'rust/target/wasm32-unknown-unknown/release/gateway_core.wasm'), resolve(root, 'public/engine/gateway_core.wasm'))
writeFileSync(resolve(root, 'public/engine/build.json'), JSON.stringify({ model: 'pcr3bp-v1', abi: 1, built: new Date().toISOString() }))
console.log('Built original Rust dynamics engine → public/engine/gateway_core.wasm')
