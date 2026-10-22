import type { Trajectory } from '../types'

/** Matched stored times only: no interpolation across termination or missing data. */
export function SeparationPlot({paths}:{paths:Trajectory[]}){
  const a=paths[0]?.samples,b=paths[1]?.samples
  if(!a||!b)return null
  const points:{t:number;d:number}[]=[]
  for(let k=0;k<Math.min(a.length,b.length);k+=5){
    if(Math.abs(a[k]-b[k])>1e-10)break
    points.push({t:a[k],d:Math.hypot(a[k+1]-b[k+1],a[k+2]-b[k+2])})
  }
  const positive=points.filter(p=>p.d>0)
  if(positive.length<2)return <p className="field-help">The first two particles have identical stored positions.</p>
  const min=Math.floor(Math.min(...positive.map(p=>Math.log10(p.d)))),max=Math.max(min+1,Math.ceil(Math.max(...positive.map(p=>Math.log10(p.d)))))
  const end=points.at(-1)!.t
  const path=positive.map((p,i)=>(i?'L':'M')+(30+p.t/end*260).toFixed(2)+','+(104-(Math.log10(p.d)-min)/(max-min)*86).toFixed(2)).join(' ')
  return <div className="drift-plot" role="img" aria-label="Position separation of the first two ensemble particles over their common time interval">
    <h3>How nearby paths separate</h3>
    <svg viewBox="0 0 310 132"><path d="M30 12V104H290" fill="none" stroke="#536575"/>
      <path d={path} fill="none" stroke="#e5ddb0" strokeWidth="1.3"/>
      <text x="2" y="19">10<tspan dy="-4" fontSize="8">{max}</tspan></text>
      <text x="2" y="104">10<tspan dy="-4" fontSize="8">{min}</tspan></text>
      <text x="30" y="125">0</text><text x="245" y="125">{end.toFixed(1)} TU</text>
    </svg>
    <p className="field-help">Position distance in normalised length units, particles #0 and #1. Log scale; common stored times only. This finite-time comparison is not a Lyapunov exponent.</p>
  </div>
}
