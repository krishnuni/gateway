import { cpus, platform, release } from 'node:os'
import { writeFile } from 'node:fs/promises'
import { loadEngine, solve } from './engine-host.mjs'
const engine=await loadEngine()
const options={phases:64,horizon:8}
for(let i=0;i<3;i++)solve(engine,options)
const times=[];let result
for(let i=0;i<20;i++){
  const t=performance.now();result=solve(engine,options);times.push(performance.now()-t)
}
const sorted=[...times].sort((a,b)=>a-b)
const report={recorded:new Date().toISOString(),runtime:process.version,platform:platform()+' '+release(),cpu:cpus()[0].model,
  fixture:result.options,warmup:3,repetitions:20,milliseconds:times,median:sorted[10],p95:sorted[18],
  accepted:result.meta[13],rejected:result.meta[14],rhs:result.meta[15],paths:result.paths.length,
  samples:result.paths.reduce((n,p)=>n+p.samples.length/5,0),maxJacobiDrift:result.meta[16],
  scope:'WASM compute and owned output copying in Node; excludes UI, worker scheduling, contours and rendering.'}
await writeFile(new URL('../docs/compute-benchmark.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({median:report.median,p95:report.p95,paths:report.paths,samples:report.samples}))
