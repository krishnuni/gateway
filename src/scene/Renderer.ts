import * as T from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PLANETS, systemFor } from '../data'
import { loadCore, values, type Api } from '../engine/wasm'
import type { Projection, Recipe, Result, Trajectory, World } from '../types'

export interface Clock { t:number; jd:number; playing:boolean; speed:number }
export interface SceneInput {
  world:World; recipe:Recipe; result:Result|null; projection:Projection
  selected:number|null; planet:number|null; surfaces:boolean; axes:boolean; stale:boolean
}
interface Label { element:HTMLDivElement; position:T.Vector3; solar?:number; kind:'body'|'orbit'; primaryX?:number }
const VERTEX = `
attribute vec4 state;
attribute float stamp;
uniform float phaseMix;
uniform float inertialMix;
uniform float origin;
uniform float field;
uniform float clockTime;
void main(){
  float t=field>0.5?clockTime:stamp;
  vec2 q=state.xy;
  vec2 inertial=vec2(cos(t)*q.x-sin(t)*q.y+origin*(cos(t)-1.0),
    sin(t)*q.x+cos(t)*q.y+origin*sin(t));
  q=mix(q,inertial,inertialMix);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(q,0.45*state.z*phaseMix,1.0);
}`
const FRAGMENT=`
uniform vec3 tint;
uniform float opacity;
void main(){gl_FragColor=vec4(tint,opacity);}
`
const colours=['#a8d8c8','#a8d8c8','#e5ddb0','#e5ddb0','#dbe7e4']
function dispose(group:T.Group){
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>()
  group.traverse(o=>{
    const mesh=o as T.Mesh
    if(mesh.geometry)geometries.add(mesh.geometry)
    if(mesh.material)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m)
  })
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear()
}
function geometry(states:number[],times:number[]){
  const g=new T.BufferGeometry()
  const positions:number[]=[]
  for(let i=0;i<states.length;i+=4)positions.push(states[i],states[i+1],.45*states[i+2])
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3))
  g.setAttribute('state',new T.Float32BufferAttribute(states,4))
  g.setAttribute('stamp',new T.Float32BufferAttribute(times,1))
  g.computeBoundingSphere();return g
}
const smooth=(v:number,target:number,dt:number)=>T.MathUtils.lerp(v,target,1-Math.exp(-dt*2.8))

export class WorldRenderer {
  readonly canvas:HTMLCanvasElement
  private renderer:T.WebGLRenderer
  private scene=new T.Scene()
  private camera=new T.PerspectiveCamera(40,1,.0001,4000)
  private controls:OrbitControls
  private solar=new T.Group()
  private lab=new T.Group()
  private selection=new T.Group()
  private materials:T.ShaderMaterial[]=[]
  private surfaces:T.Object3D[]=[]
  private labels:Label[]=[]
  private bodies:T.Mesh[]=[]
  private paths:T.LineSegments[]=[]
  private rawPaths:Trajectory[]=[]
  private core:Api|null=null
  private input:SceneInput|null=null
  private source:Result|null=null
  private origin=0
  private heads:T.Points
  private headData=new Float32Array(3)
  private resizeObserver:ResizeObserver
  private axis:T.AxesHelper
  private targetPosition:T.Vector3|null=null
  private targetLook:T.Vector3|null=null
  private followed:T.Vector3|null=null
  private pointerStart={x:0,y:0}
  private stopped=false
  private currentClock:Clock={t:0,jd:2451545,playing:false,speed:1}
  private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
  private solarEpoch=0
  private projected=new T.Vector3()
  private samples:number[]=[]
  private profile=new URLSearchParams(location.search).has('profile')
  constructor(private host:HTMLDivElement,private onPlanet:(p:number|null)=>void,
    private onPath:(p:number)=>void,private onFrame:(ms:number)=>void,private onError:(s:string)=>void){
    this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'})
    this.renderer.setClearColor('#101e2d');this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6))
    this.renderer.outputColorSpace=T.SRGBColorSpace
    this.canvas=this.renderer.domElement;this.canvas.tabIndex=0
    this.canvas.setAttribute('aria-label','Interactive 3D scene. Drag to rotate, scroll to zoom, right-drag to pan. The Navigation menu provides keyboard controls.')
    host.prepend(this.canvas)
    this.camera.up.set(0,0,1)
    this.controls=new OrbitControls(this.camera,this.canvas)
    this.controls.enableDamping=true;this.controls.dampingFactor=.065
    this.controls.minDistance=.0005;this.controls.maxDistance=500
    this.controls.zoomSpeed=.8;this.controls.rotateSpeed=.55;this.controls.panSpeed=.65
    this.controls.addEventListener('start',()=>{this.targetPosition=null;this.targetLook=null})
    this.scene.add(this.solar,this.lab,this.selection)
    this.scene.add(new T.AmbientLight('#a9c3d4',1.4))
    const light=new T.PointLight('#fff3db',150,0,1);this.scene.add(light)
    const headGeometry=new T.BufferGeometry();headGeometry.setAttribute('position',new T.BufferAttribute(this.headData,3))
    this.heads=new T.Points(headGeometry,new T.PointsMaterial({color:'#eff6ee',size:2.3,sizeAttenuation:false,transparent:true,opacity:.9,depthWrite:false}))
    this.scene.add(this.heads)
    this.axis=new T.AxesHelper(.3);this.scene.add(this.axis)
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host)
    this.canvas.addEventListener('pointerdown',e=>{this.pointerStart={x:e.clientX,y:e.clientY}})
    this.canvas.addEventListener('pointerup',this.pick)
    this.canvas.addEventListener('webglcontextlost',this.contextLost)
    this.resize();this.reset('solar',true)
    loadCore().then(core=>{if(this.stopped)return;this.core=core;this.buildSolar()}).catch(e=>this.onError(String(e)))
  }
  private contextLost=(e:Event)=>{e.preventDefault();this.onError('The graphics context was lost. Your experiment is preserved. Reload to restore the scene.')}
  private resize(){
    this.renderer.setSize(this.host.clientWidth,this.host.clientHeight)
    this.camera.aspect=this.host.clientWidth/Math.max(1,this.host.clientHeight);this.camera.updateProjectionMatrix()
  }
  private material(colour:string,opacity:number,field=false){
    const m=new T.ShaderMaterial({vertexShader:VERTEX,fragmentShader:FRAGMENT,
      uniforms:{tint:{value:new T.Color(colour)},opacity:{value:opacity},phaseMix:{value:this.input?.projection==='phase'?1:0},
        inertialMix:{value:0},origin:{value:this.origin},field:{value:field?1:0},clockTime:{value:0}},
      transparent:true,depthWrite:false,depthTest:false,side:T.DoubleSide})
    this.materials.push(m);return m
  }
  private label(text:string,position:T.Vector3,kind:Label['kind'],solar?:number){
    const element=document.createElement('div');element.className='scene-label '+kind
    element.textContent=text;this.host.append(element);this.labels.push({element,position,kind,solar})
  }
  private clearLabels(kind:'solar'|'lab'){
    this.labels=this.labels.filter(l=>{
      const remove=kind==='solar'?l.solar!==undefined:l.solar===undefined
      if(remove)l.element.remove()
      return !remove
    })
  }
  private buildSolar(){
    if(!this.core)return
    dispose(this.solar);this.clearLabels('solar');this.bodies=[]
    const sun=new T.Mesh(new T.SphereGeometry(.22,32,20),new T.MeshBasicMaterial({color:'#f1e6c9'}))
    this.solar.add(sun);this.label('Sun',new T.Vector3(),'body',-1)
    for(let i=0;i<8;i++){
      const p=PLANETS[i],marker=.055+.075*Math.log(1+p.radius/2400)/Math.log(31)
      const body=new T.Mesh(new T.SphereGeometry(marker,24,16),new T.MeshStandardMaterial({color:p.colour,roughness:.83,metalness:0}))
      body.userData.planet=i;this.solar.add(body);this.bodies.push(body)
      this.label(p.name,new T.Vector3(),'body',i)
      if(i===5){
        const ring=new T.Mesh(new T.RingGeometry(marker*1.4,marker*2.3,64),new T.MeshBasicMaterial({color:'#d8cfb5',transparent:true,opacity:.35,side:T.DoubleSide,depthWrite:false}))
        ring.rotation.x=.48;body.add(ring)
      }
    }
    this.updateSolarOrbits(this.currentClock.jd)
  }
  private updateSolarOrbits(jd:number){
    if(!this.core)return
    for(const o of this.solar.children.filter(o=>o.userData.orbit)){
      this.solar.remove(o);(o as T.Line).geometry.dispose();((o as T.Line).material as T.Material).dispose()
    }
    for(let i=0;i<8;i++){
      const n=this.core.gw_solar_path(i,jd,768),raw=values(this.core,this.core.gw_scratch_ptr(),n)
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(raw,3))
      const focused=i===this.input?.planet
      const line=new T.Line(g,new T.LineBasicMaterial({color:focused?'#d8d5b7':'#9dafbd',transparent:true,opacity:focused?.55:.19,depthWrite:false}))
      line.userData.orbit=true;this.solar.add(line)
    }
    this.solarEpoch=jd
  }
  updateInput(input:SceneInput){
    const previous=this.input;this.input=input
    this.solar.visible=input.world==='solar';this.lab.visible=input.world==='gateway'
    this.selection.visible=input.world==='gateway';this.heads.visible=input.world==='gateway'
    this.axis.visible=input.world==='gateway'&&input.axes
    if(previous?.world!==input.world||previous?.recipe.system!==input.recipe.system)this.reset(input.world)
    if(previous?.planet!==input.planet&&input.world==='solar'){
      this.followed=null
      if(input.planet!==null&&this.bodies[input.planet]){
        const pos=this.bodies[input.planet].position
        this.targetLook=pos.clone();this.targetPosition=pos.clone().add(new T.Vector3(.4,-.9,.65).multiplyScalar(Math.max(.8,PLANETS[input.planet].a*.35)))
      }else this.reset('solar')
      this.updateSolarOrbits(this.currentClock.jd)
    }
    if(input.world==='gateway'&&input.result!==this.source&&input.result?.orbit.length){this.source=input.result;this.buildLab(input.result)}
    if(previous?.selected!==input.selected)this.highlight()
    this.surfaces.forEach(m=>m.visible=input.surfaces&&input.projection==='phase'&&(m.userData.branch<2?input.recipe.stable:input.recipe.unstable))
    for(const path of this.paths){const b=path.userData.branch as number;path.visible=b===4||(b<2?input.recipe.stable:input.recipe.unstable)}
  }
  private buildLab(result:Result){
    dispose(this.lab);dispose(this.selection);this.clearLabels('lab')
    this.materials=[];this.surfaces=[];this.paths=[];this.rawPaths=result.paths
    this.origin=result.points[(result.recipe.point-1)*3]||.84
    const system=systemFor(result.recipe.system),states:number[]=[],times:number[]=[]
    for(let k=0;k<result.orbit.length;k+=5){states.push(result.orbit[k+1]-this.origin,result.orbit[k+2],result.orbit[k+3],result.orbit[k+4]);times.push(result.orbit[k])}
    this.lab.add(new T.Line(geometry(states,times),this.material('#edf2e6',.94)))
    for(const branch of [0,1,2,3,4]){
      const selected=result.paths.filter(p=>p.branch===branch)
      if(!selected.length)continue
      const s:number[]=[],t:number[]=[],mapping:number[]=[]
      for(const path of selected){
        const d=path.samples
        for(let k=0;k<d.length-5;k+=5){
          for(const j of [k,k+5]){s.push(d[j+1]-this.origin,d[j+2],d[j+3],d[j+4]);t.push(d[j])}
          mapping.push(path.id)
        }
      }
      const line=new T.LineSegments(geometry(s,t),this.material(colours[branch],.22))
      line.userData={branch,mapping};line.frustumCulled=false;this.lab.add(line);this.paths.push(line)
      if(branch<4&&selected.length>=2)this.buildSurface(selected,branch)
    }
    this.buildBoundary(result)
    for(const [x,size,name] of [[-system.mu,.016,system.primary],[1-system.mu,.010,system.secondary]] as const){
      const displaySize=Math.max(x<0?system.guard1:system.guard2,size*Math.cbrt(system.mu/.01215058560962404))
      const marker=new T.Mesh(new T.SphereGeometry(displaySize,20,12),new T.MeshBasicMaterial({color:'#dbe4e3'}))
      marker.position.set(x-this.origin,0,0);this.lab.add(marker)
      marker.userData.primaryX=x
      this.label(name,new T.Vector3(x-this.origin,0,0),'body')
      this.labels[this.labels.length-1].primaryX=x
    }
    this.label('L'+result.recipe.point,new T.Vector3(0,0,0),'orbit')
    this.axis.position.set(-.1,-.1,0);this.highlight()
    this.surfaces.forEach(m=>m.visible=!!this.input?.surfaces&&this.input?.projection==='phase'&&(m.userData.branch<2?!!this.input?.recipe.stable:!!this.input?.recipe.unstable))
  }
  private buildSurface(paths:Trajectory[],branch:number){
    const states:number[]=[],times:number[]=[]
    const push=(p:Trajectory,k:number)=>{const d=p.samples;states.push(d[k+1]-this.origin,d[k+2],d[k+3],d[k+4]);times.push(d[k])}
    for(let row=0;row<paths.length-1;row++){
      const a=paths[row],b=paths[row+1]
      for(let k=0;k<Math.min(a.samples.length,b.samples.length)-10;k+=10){
        if(Math.abs(a.samples[k]-b.samples[k])>1e-8||Math.abs(a.samples[k+10]-b.samples[k+10])>1e-8)continue
        let edge=0
        for(const offset of [1,2,3])edge+=(a.samples[k+offset]-b.samples[k+offset])**2
        if(edge>.018)continue
        push(a,k);push(b,k);push(a,k+10);push(a,k+10);push(b,k);push(b,k+10)
      }
    }
    if(!states.length)return
    const mesh=new T.Mesh(geometry(states,times),this.material(colours[branch],.035))
    mesh.userData.branch=branch;mesh.frustumCulled=false;this.lab.add(mesh);this.surfaces.push(mesh)
  }
  private buildBoundary(result:Result){
    const f=result.field;if(f.length!==360*270)return
    const points:number[]=[],times:number[]=[],nx=360,ny=270
    const xy=(i:number,j:number):[number,number]=>[-1.5+4*i/(nx-1),-1.5+3*j/(ny-1)]
    for(let i=0;i<result.contours.length;i+=2){points.push(result.contours[i]-this.origin,result.contours[i+1],0,0);times.push(0)}
    this.lab.add(new T.LineSegments(geometry(points,times),this.material('#b0a0cb',.28,true)))
    const positions:number[]=[],indices:number[]=[],stride=3
    for(let j=0;j<ny;j+=stride)for(let i=0;i<nx;i+=stride){
      const [x,y]=xy(i,j),omega=(f[j*nx+i]+result.diagnostics.c)/2
      positions.push(x-this.origin,y,Math.min(.9,Math.max(-.25,(omega-1.5)*.7)))
    }
    const w=Math.ceil(nx/stride),h=Math.ceil(ny/stride)
    for(let j=0;j<h-1;j++)for(let i=0;i<w-1;i++){const a=j*w+i;indices.push(a,a+1,a+w,a+1,a+w+1,a+w)}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices)
    const mesh=new T.Mesh(g,new T.MeshBasicMaterial({color:'#8c9cac',transparent:true,opacity:.23,side:T.DoubleSide,wireframe:true,depthWrite:false}))
    mesh.userData.relief=true;mesh.visible=this.input?.projection==='potential';this.lab.add(mesh)
  }
  private highlight(){
    dispose(this.selection)
    const path=this.rawPaths.find(p=>p.id===this.input?.selected)
    if(!path)return
    const states:number[]=[],times:number[]=[]
    for(let k=0;k<path.samples.length;k+=5){states.push(path.samples[k+1]-this.origin,path.samples[k+2],path.samples[k+3],path.samples[k+4]);times.push(path.samples[k])}
    this.selection.add(new T.Line(geometry(states,times),this.material('#ffffff',.95)))
  }
  reset(world:World=this.input?.world??'solar',immediate=false){
    const scale=world==='gateway'?Math.cbrt(systemFor(this.input?.recipe.system??'earth-moon').mu/.01215058560962404):1
    this.followed=null;this.targetLook=new T.Vector3(world==='solar'?0:.15*scale,0,0)
    this.targetPosition=world==='solar'?new T.Vector3(26,-56,48):new T.Vector3(1.8,-3.3,2.5).multiplyScalar(scale)
    if(immediate||this.reduced){this.camera.position.copy(this.targetPosition);this.controls.target.copy(this.targetLook);this.targetPosition=null;this.targetLook=null;this.controls.update()}
  }
  zoom(d:number){const q=this.camera.position.clone().sub(this.controls.target);this.camera.position.copy(this.controls.target).add(q.multiplyScalar(d>0?.78:1.28))}
  rotate(d:number){const q=this.camera.position.clone().sub(this.controls.target);q.applyAxisAngle(new T.Vector3(0,0,1),d*.18);this.camera.position.copy(this.controls.target).add(q)}
  pan(d:number){const q=new T.Vector3(d*this.camera.position.distanceTo(this.controls.target)*.07,0,0);this.camera.position.add(q);this.controls.target.add(q)}
  image(){return this.canvas.toDataURL('image/png')}
  private pick=(event:PointerEvent)=>{
    if(Math.hypot(event.clientX-this.pointerStart.x,event.clientY-this.pointerStart.y)>5)return
    const rect=this.canvas.getBoundingClientRect()
    if(this.input?.world==='solar'){
      const pointer=new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1)
      const ray=new T.Raycaster();ray.setFromCamera(pointer,this.camera)
      const hit=ray.intersectObjects(this.bodies,false)[0];if(hit)this.onPlanet(hit.object.userData.planet)
    }else{
      let best=14,id:number|undefined
      for(const path of this.rawPaths){
        if(path.branch<2&&!this.input?.recipe.stable||path.branch>=2&&path.branch<4&&!this.input?.recipe.unstable)continue
        const d=path.samples,step=Math.max(5,Math.floor(d.length/640)*5)
        for(let k=0;k<d.length;k+=step){
          let x=d[k+1],y=d[k+2]
          if(this.input?.projection==='inertial'){const t=d[k],a=x;x=Math.cos(t)*x-Math.sin(t)*y;y=Math.sin(t)*a+Math.cos(t)*y}
          const p=this.projected.set(x-this.origin,y,this.input?.projection==='phase'?.45*d[k+3]:0).project(this.camera)
          const distance=Math.hypot((p.x*.5+.5)*rect.width-(event.clientX-rect.left),(-p.y*.5+.5)*rect.height-(event.clientY-rect.top))
          if(distance<best){best=distance;id=path.id}
        }
      }
      if(id!==undefined)this.onPath(id)
    }
  }
  render(dt:number,clock:Clock,frameMs=dt*1000){
    if(this.stopped||!this.input)return
    this.currentClock=clock;const input=this.input
    if(this.targetPosition&&this.targetLook){
      const a=this.reduced?1:1-Math.exp(-dt*3.4)
      this.camera.position.lerp(this.targetPosition,a);this.controls.target.lerp(this.targetLook,a)
      if(this.camera.position.distanceTo(this.targetPosition)<.001){this.targetPosition=null;this.targetLook=null}
    }
    if(input.world==='solar'&&this.core){
      if(this.core.gw_solar(clock.jd)){
        const p=new Float64Array(this.core.memory.buffer,this.core.gw_scratch_ptr(),24)
        this.bodies.forEach((b,i)=>b.position.set(p[i*3],p[i*3+1],p[i*3+2]))
        if(input.planet!==null&&!this.targetPosition){
          const point=this.bodies[input.planet]?.position
          if(point){if(this.followed){const delta=point.clone().sub(this.followed);this.controls.target.add(delta);this.camera.position.add(delta)}this.followed=point.clone()}
        }
      }
      if(Math.abs(clock.jd-this.solarEpoch)>365)this.updateSolarOrbits(clock.jd)
    }
    for(const m of this.materials){
      m.uniforms.phaseMix.value=smooth(m.uniforms.phaseMix.value,input.projection==='phase'?1:0,dt)
      m.uniforms.inertialMix.value=smooth(m.uniforms.inertialMix.value,input.projection==='inertial'?1:0,dt)
      m.uniforms.clockTime.value=clock.t
    }
    this.lab.children.forEach(o=>{
      if(o.userData.relief)o.visible=input.projection==='potential'
      if(o.userData.primaryX!==undefined){const x=o.userData.primaryX as number,t=input.projection==='inertial'?clock.t:0;o.position.set(Math.cos(t)*x-this.origin,Math.sin(t)*x,0)}
    })
    this.controls.update();this.updateHeads(clock.t)
    const occupied:{x:number;y:number}[]=[]
    const sunPoint=new T.Vector3().project(this.camera)
    for(const label of this.labels){
      const visible=label.solar!==undefined?input.world==='solar':input.world==='gateway'
      label.element.style.display=visible?'':'none';if(!visible)continue
      if(label.solar!==undefined&&label.solar>=0)label.position.copy(this.bodies[label.solar].position)
      if(label.primaryX!==undefined){const t=input.projection==='inertial'?clock.t:0;label.position.set(Math.cos(t)*label.primaryX-this.origin,Math.sin(t)*label.primaryX,0)}
      if(label.kind==='orbit'){const t=input.projection==='inertial'?clock.t:0;label.position.set((Math.cos(t)-1)*this.origin,Math.sin(t)*this.origin,0)}
      const p=this.projected.copy(label.position).project(this.camera)
      const x=(p.x*.5+.5)*this.host.clientWidth,y=(-p.y*.5+.5)*this.host.clientHeight
      if(label.solar!==undefined&&label.solar>=0){
        const nearSun=Math.hypot((p.x-sunPoint.x)*this.host.clientWidth/2,(p.y-sunPoint.y)*this.host.clientHeight/2)<22
        if((nearSun||occupied.some(q=>Math.hypot(q.x-x,q.y-y)<32))&&label.solar!==input.planet){label.element.style.opacity='0';continue}
        occupied.push({x,y})
      }
      label.element.style.opacity=p.z>1||p.z< -1?'0':'.85'
      label.element.style.transform='translate('+((p.x*.5+.5)*this.host.clientWidth+10)+'px,'+((-p.y*.5+.5)*this.host.clientHeight-12)+'px)'
    }
    const submitStart=this.profile?performance.now():0
    this.renderer.render(this.scene,this.camera)
    if(this.profile)performance.measure('gateway.render.submit',{start:submitStart,end:performance.now()})
    this.samples.push(frameMs);if(this.samples.length>180)this.samples.shift()
    if(this.samples.length===180){const s=[...this.samples].sort((a,b)=>a-b);this.onFrame(s[Math.floor(s.length*.95)])}
  }
  private updateHeads(time:number){
    if(this.input?.world!=='gateway')return
    const selected=this.input.selected
    const paths=this.rawPaths.filter(p=>(p.branch===4||(p.branch<2?this.input!.recipe.stable:this.input!.recipe.unstable))&&(selected===null||p.id===selected))
    const positions:number[]=[]
    for(const path of paths){
      const d=path.samples,n=d.length/5
      if(n<2||(d[d.length-5]<0?time>0||time<d[d.length-5]:time<0||time>d[d.length-5]))continue
      const direction=d[d.length-5]<0?-1:1;let lo=0,hi=n-1
      while(hi-lo>1){const m=(lo+hi)>>1;if(d[m*5]*direction<time*direction)lo=m;else hi=m}
      const a=lo*5,b=hi*5,u=(time-d[a])/(d[b]-d[a])
      const x=T.MathUtils.lerp(d[a+1],d[b+1],u),y=T.MathUtils.lerp(d[a+2],d[b+2],u),vx=T.MathUtils.lerp(d[a+3],d[b+3],u)
      if(this.input.projection==='inertial')positions.push(Math.cos(time)*x-Math.sin(time)*y-this.origin,Math.sin(time)*x+Math.cos(time)*y,0)
      else positions.push(x-this.origin,y,this.input.projection==='phase'?.45*vx:0)
    }
    if(positions.length!==this.headData.length){this.headData=new Float32Array(positions);this.heads.geometry.setAttribute('position',new T.BufferAttribute(this.headData,3))}
    else{this.headData.set(positions);this.heads.geometry.attributes.position.needsUpdate=true}
    this.heads.frustumCulled=false
  }
  destroy(){
    this.stopped=true;this.resizeObserver.disconnect();this.controls.dispose()
    this.canvas.removeEventListener('pointerup',this.pick);this.canvas.removeEventListener('webglcontextlost',this.contextLost)
    dispose(this.solar);dispose(this.lab);dispose(this.selection)
    this.heads.geometry.dispose();(this.heads.material as T.Material).dispose();this.axis.dispose()
    this.labels.forEach(l=>l.element.remove());this.renderer.dispose();this.canvas.remove()
  }
}
