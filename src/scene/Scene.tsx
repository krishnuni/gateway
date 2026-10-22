import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { WorldRenderer, type Clock, type SceneInput } from './Renderer'
export interface Navigation {
  reset:()=>void;zoom:(d:number)=>void;rotate:(d:number)=>void;pan:(d:number)=>void;image:()=>string|undefined
}
interface Props {
  input:SceneInput;clock:MutableRefObject<Clock>;onPlanet:(p:number|null)=>void;onPath:(p:number)=>void
  onTick:()=>void;onFrame:(ms:number)=>void;onError:(s:string)=>void
}
export const Scene=forwardRef<Navigation,Props>(function Scene(props,ref){
  const host=useRef<HTMLDivElement>(null),engine=useRef<WorldRenderer|null>(null),current=useRef(props)
  current.current=props
  useImperativeHandle(ref,()=>({reset:()=>engine.current?.reset(),zoom:d=>engine.current?.zoom(d),
    rotate:d=>engine.current?.rotate(d),pan:d=>engine.current?.pan(d),image:()=>engine.current?.image()}),[])
  useEffect(()=>{
    if(!host.current)return
    let scene:WorldRenderer
    try{scene=new WorldRenderer(host.current,p=>current.current.onPlanet(p),p=>current.current.onPath(p),
      ms=>current.current.onFrame(ms),s=>current.current.onError(s))}
    catch(e){current.current.onError('WebGL2 is required for the scene. '+String(e));return}
    engine.current=scene;scene.updateInput(current.current.input)
    let frame=0,last=performance.now(),lastTick=last
    const loop=(now:number)=>{
      const elapsed=(now-last)/1000,dt=Math.min(elapsed,.07);last=now
      const {clock,input}=current.current
      if(clock.current.playing&&!document.hidden){
        if(input.world==='solar'){
          clock.current.jd+=dt*clock.current.speed*10
          if(clock.current.jd>2469807.5){clock.current.jd=2469807.5;clock.current.playing=false}
        }else{clock.current.t+=dt*clock.current.speed*.5;if(clock.current.t>input.recipe.horizon)clock.current.t= -input.recipe.horizon}
      }
      scene.render(dt,clock.current,elapsed*1000)
      if(now-lastTick>160){current.current.onTick();lastTick=now}
      frame=requestAnimationFrame(loop)
    }
    frame=requestAnimationFrame(loop)
    return()=>{cancelAnimationFrame(frame);scene.destroy();engine.current=null}
  },[])
  useEffect(()=>engine.current?.updateInput(props.input),[props.input])
  return <div className="scene" ref={host} data-testid="scene"/>
})
