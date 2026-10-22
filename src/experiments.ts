import { defaultRecipe, SYSTEMS } from './data'
import type { Recipe } from './types'

export function validateRecipe(input: unknown): Recipe {
  if (!input || typeof input!=='object') throw new Error('Expected a Gateway experiment object.')
  const record = input as Record<string,unknown>
  const r = (record.recipe ?? record) as Record<string,unknown>
  if (!r || r.schema!==1 || r.model!=='pcr3bp-v1') throw new Error('Unsupported experiment schema or physical model.')
  if (!SYSTEMS.some(s=>s.id===r.system)) throw new Error('Unknown physical system.')
  const checks: [string,number,number][] = [
    ['offset',1e-6,.05],['horizon',.1,30],['phases',8,256],['epsilon',1e-8,1e-3],
    ['tolerance',1e-14,1e-7],['count',1,512],['seed',0,4294967295],
    ['x',-4,4],['y',-4,4],['angle',-20,20],['spread',0,2*Math.PI],
  ]
  for(const [key,min,max] of checks) if(typeof r[key]!=='number' || !Number.isFinite(r[key]) || (r[key] as number)<min || (r[key] as number)>max) {
    throw new Error('Invalid '+key+'; expected a finite value between '+min+' and '+max+'.')
  }
  for(const key of ['phases','count','seed']) if(!Number.isInteger(r[key])) throw new Error(key+' must be an integer.')
  if(r.point!==1 && r.point!==2) throw new Error('Select L1 or L2.')
  if(r.mode!=='manifolds' && r.mode!=='ensemble') throw new Error('Unknown experiment type.')
  if(!['position','phase','inertial','potential','section'].includes(String(r.projection))) throw new Error('Unknown projection.')
  if(typeof r.stable!=='boolean' || typeof r.unstable!=='boolean') throw new Error('Branch visibility must be boolean.')
  // Whitelist fields; never forward arbitrary imported properties to the core.
  const clean=defaultRecipe(r.system as string)
  for(const key of Object.keys(clean) as (keyof Recipe)[]) {
    (clean as unknown as Record<string,unknown>)[key]=r[key]
  }
  return clean
}

export const recipeKey = (r: Recipe) => JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a],[b])=>a.localeCompare(b))))
export async function recipeHash(recipe: Recipe): Promise<string> {
  const bytes=new TextEncoder().encode(recipeKey(recipe))
  const digest=await crypto.subtle.digest('SHA-256',bytes)
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')
}
export function download(content: Blob,filename: string) {
  const url=URL.createObjectURL(content)
  const a=document.createElement('a');a.href=url;a.download=filename;a.click()
  setTimeout(()=>URL.revokeObjectURL(url),5000)
}
export function readInitialRecipe(): Recipe {
  try {
    const encoded=new URLSearchParams(location.hash.slice(1)).get('experiment')
    if(encoded) return validateRecipe(JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/'))))
  } catch { /* A malformed link does not prevent opening the lab. */ }
  return defaultRecipe()
}
export const scientific=(n: number|undefined,digits=3) => n===undefined || !Number.isFinite(n) ? '—' : n===0 ? '0' : Math.abs(n)<.001 || Math.abs(n)>=10000 ? n.toExponential(digits) : n.toFixed(digits)
export const REASONS=['Horizon reached','Primary boundary','Secondary boundary','Domain exit','Numerical work limit']
