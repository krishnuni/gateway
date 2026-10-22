import { useMemo } from 'react'
import type { Result, Trajectory } from '../types'
import { scientific } from '../experiments'

export function SectionPlot({result,selected,onSelect}:{result:Result|null;selected:number|null;onSelect:(id:number)=>void}){
  const points=useMemo(()=>result?.paths.flatMap(path=>{
    const p:{x:number;v:number;time:number;path:Trajectory}[]=[]
    for(let i=0;i<path.sections.length;i+=5)p.push({time:path.sections[i],x:path.sections[i+1],v:path.sections[i+3],path})
    return p
  })??[],[result])
  const xs=points.map(p=>p.x),ys=points.map(p=>p.v)
  const xmin=Math.min(...xs,0.75),xmax=Math.max(...xs,1.15)
  const ymin=Math.min(...ys,-.2),ymax=Math.max(...ys,.2)
  const px=(x:number)=>90+(x-xmin)/(xmax-xmin)*1000
  const py=(y:number)=>650-(y-ymin)/(ymax-ymin)*540
  return <section className="section-view" aria-label="Poincaré section">
    <svg viewBox="0 0 1200 760" role="img" aria-label="Poincaré crossings plotted as x versus vx at y zero with positive vy">
      <line x1="90" y1="650" x2="1100" y2="650" className="plot-axis"/>
      <line x1="90" y1="90" x2="90" y2="650" className="plot-axis"/>
      <text x="1110" y="680">x</text><text x="58" y="85">vₓ</text>
      {[0,.25,.5,.75,1].map(q=><g key={q}>
        <text x={90+q*1000} y="678" className="tick">{scientific(xmin+q*(xmax-xmin),2)}</text>
        <text x="70" y={654-q*540} textAnchor="end" className="tick">{scientific(ymin+q*(ymax-ymin),2)}</text>
      </g>)}
      {points.map((p,i)=><circle key={i} cx={px(p.x)} cy={py(p.v)}
        r={selected===p.path.id?4.6:2.2} fill={p.path.branch<2?'#a8d8c8':'#e5ddb0'}
        opacity={selected===null||selected===p.path.id?.85:.25}
        onClick={()=>onSelect(p.path.id)} tabIndex={0} role="button"
        aria-label={'Trajectory '+p.path.id+', x '+p.x.toFixed(5)+', vx '+p.v.toFixed(5)}
        onKeyDown={e=>{if(e.key==='Enter')onSelect(p.path.id)}}>
        <title>{'Trajectory '+p.path.id+' · t='+p.time.toFixed(3)}</title>
      </circle>)}
      {!points.length&&<text x="600" y="380" textAnchor="middle" className="empty-chart">No positive-direction section crossings in this time window.</text>}
    </svg>
    <div className="section-caption">y = 0 · vᵧ &gt; 0 · fixed C<br/>{points.length.toLocaleString()} root-localised crossings</div>
  </section>
}
