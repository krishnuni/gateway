import { useCallback, useEffect, useRef, useState } from 'react'
import type { EngineReply, Recipe, Result } from '../types'
import { validateRecipe } from '../experiments'

export function useEngine() {
  const worker=useRef<Worker|null>(null)
  const revision=useRef(0)
  const requested=useRef<Recipe|null>(null)
  const [result,setResult]=useState<Result|null>(null)
  const [busy,setBusy]=useState(false)
  const [ready,setReady]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    const w=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'})
    worker.current=w
    w.onmessage=({data}:MessageEvent<EngineReply>)=>{
      if(data.type==='ready'){setReady(true);return}
      if(data.type==='error'){
        if(data.revision===revision.current || data.revision===0){setBusy(false);setError(data.message)}
        return
      }
      if(data.revision!==revision.current)return
      if(data.type==='cancelled'){setBusy(false);return}
      if(data.type==='progress'){
        setResult(previous=>{
          const same=previous?.revision===data.revision
          return {revision:data.revision,recipe:requested.current!,
            diagnostics:data.diagnostics,orbit:data.orbit ?? (same?previous.orbit:new Float64Array()),
            matrix:data.matrix ?? (same?previous.matrix:new Float64Array()),
            points:data.points ?? (same?previous.points:new Float64Array()),
            field:data.field ?? (same?previous.field:new Float64Array()),
            contours:data.contours ?? (same?previous.contours:new Float64Array()),
            paths:[...(same?previous.paths:[]),...data.paths],computeMs:data.computeMs,complete:data.done}
        })
        if(data.done)setBusy(false)
      }
    }
    w.onerror=()=>{setBusy(false);setError('The numerical worker stopped unexpectedly. Reload to restart the engine.')}
    return()=>{w.terminate();worker.current=null}
  },[])
  const compute=useCallback((input:Recipe)=>{
    try{
      const recipe=validateRecipe(input)
      requested.current={...recipe};revision.current++
      setBusy(true);setError('')
      worker.current?.postMessage({type:'compute',revision:revision.current,recipe})
    }catch(e){setError(e instanceof Error?e.message:String(e))}
  },[])
  const cancel=useCallback(()=>{
    revision.current++;worker.current?.postMessage({type:'cancel'});setBusy(false)
  },[])
  return {result,busy,ready,error,compute,cancel}
}
