import { useEffect, useState } from 'react'
import { loadCore } from '../engine/wasm'
import type { Trajectory } from '../types'
import { systemFor } from '../data'

export function DriftPlot({path,system}:{path:Trajectory;system:string}){
  const [points,setPoints]=useState<{t:number;d:number}[]>([])
  useEffect(()=>{
    let cancelled=false
    loadCore().then(api=>{
      const result:{t:number;d:number}[]=[]
      const data=path.samples
      const stride=Math.max(5,Math.floor(data.length/800)*5)
      for(let i=0;i<data.length;i+=stride){
        const ptr=api.gw_evaluate(systemFor(system).mu,data[i+1],data[i+2],data[i+3],data[i+4])
        const c=new Float64Array(api.memory.buffer,ptr,1)[0]
        result.push({t:data[i],d:Math.max(1e-16,Math.abs(c-path.jacobi))})
      }
      if(!cancelled)setPoints(result)
    }).catch(()=>{if(!cancelled)setPoints([])})
    return()=>{cancelled=true}
  },[path,system])
  const minimum=Math.min(-16,...points.map(p=>Math.log10(p.d)))
  const maximum=Math.max(-10,...points.map(p=>Math.log10(p.d)))
  const end=Math.max(1e-8,...points.map(p=>Math.abs(p.t)))
  const line=points.map(p=>(24+Math.abs(p.t)/end*270)+','+(105-(Math.log10(p.d)-minimum)/(maximum-minimum)*80)).join(' ')
  return <figure className="drift-plot">
    <figcaption>Jacobi drift · logarithmic magnitude</figcaption>
    <svg viewBox="0 0 320 140" role="img" aria-label="Magnitude of Jacobi conservation error along the selected trajectory">
      <path d="M24 15V107H302" fill="none" stroke="#536271"/>
      <polyline points={line} fill="none" stroke="#a8d8c8" strokeWidth="1.2"/>
      <text x="24" y="130">0</text><text x="264" y="130">{end.toFixed(1)} TU</text>
      <text x="30" y="20">{'10^'+maximum.toFixed(0)}</text>
    </svg>
  </figure>
}
