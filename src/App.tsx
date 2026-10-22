import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Scene, type Navigation } from './scene/Scene'
import type { Clock } from './scene/Renderer'
import { INITIAL_JD, PLANETS, SYSTEMS, defaultRecipe, systemFor } from './data'
import { useEngine } from './engine/useEngine'
import { SectionPlot } from './components/SectionPlot'
import { DriftPlot } from './components/DriftPlot'
import { SeparationPlot } from './components/SeparationPlot'
import { SCENARIOS } from './scenarios'
import { download, readInitialRecipe, recipeHash, recipeKey, REASONS, scientific, validateRecipe } from './experiments'
import type { Projection, Recipe, World } from './types'

type Panel='experiment'|'inspect'|'notebook'|'about'|null
const projections:{value:Projection;label:string;description:string}[]=[
  {value:'phase',label:'Phase space · x, y, vₓ',description:'Velocity unfolds the hidden geometry.'},
  {value:'position',label:'Position · x, y',description:'The rotating orbital plane.'},
  {value:'inertial',label:'Inertial · X, Y',description:'Every history sample uses its own time.'},
  {value:'potential',label:'Potential relief · Ω(x, y)',description:'Height represents effective potential.'},
  {value:'section',label:'Poincaré section · x, vₓ',description:'y = 0 · vᵧ > 0 · fixed Jacobi constant.'},
]
const dynamicsKey=(r:Recipe)=>recipeKey({...r,projection:'position',stable:true,unstable:true})
const jdDate=(jd:number)=>new Date((jd-2440587.5)*86400000).toISOString().slice(0,10)

export default function App(){
  const initial=useRef(readInitialRecipe())
  const [recipe,setRecipe]=useState<Recipe>(initial.current)
  const [world,setWorld]=useState<World>(location.hash.includes('experiment=')?'gateway':'solar')
  const [planet,setPlanet]=useState<number|null>(null)
  const [panel,setPanel]=useState<Panel>(null)
  const [views,setViews]=useState(false),[navigation,setNavigation]=useState(false)
  const [selected,setSelected]=useState<number|null>(null)
  const [surfaces,setSurfaces]=useState(true),[axes,setAxes]=useState(false)
  const [tick,setTick]=useState(0)
  const [toast,setToast]=useState(''),[graphicsError,setGraphicsError]=useState('')
  const [saved,setSaved]=useState<{name:string;recipe:Recipe}[]>(()=>{
    try{const value=JSON.parse(localStorage.getItem('gateway-notebook-v1')??'[]');return Array.isArray(value)?value.slice(0,30).filter(s=>{try{validateRecipe(s.recipe);return typeof s.name==='string'}catch{return false}}):[]}catch{return[]}
  })
  const [name,setName]=useState('Opening L₁'),[showTable,setShowTable]=useState(false)
  const [p95,setP95]=useState(0)
  const clock=useRef<Clock>({t:-initial.current.horizon,jd:INITIAL_JD,playing:false,speed:1})
  const scene=useRef<Navigation>(null),file=useRef<HTMLInputElement>(null),started=useRef(false)
  const {result,busy,ready,error,compute,cancel}=useEngine()
  const system=systemFor(recipe.system)
  const stale=!!result&&dynamicsKey(result.recipe)!==dynamicsKey(recipe)
  const selectedPath=result?.paths.find(p=>p.id===selected)
  const currentProjection=projections.find(p=>p.value===recipe.projection)!
  const notify=useCallback((s:string)=>{setToast(s)},[])
  useEffect(()=>{if(toast){const id=setTimeout(()=>setToast(''),4200);return()=>clearTimeout(id)}},[toast])
  useEffect(()=>{if(ready&&!started.current){started.current=true;compute(initial.current)}},[ready,compute])
  const edit=useCallback((values:Partial<Recipe>)=>setRecipe(r=>({...r,...values})),[])
  const enterGateway=useCallback((id:string)=>{
    const next=defaultRecipe(id);setRecipe(next);setWorld('gateway');setSelected(null)
    clock.current.t=-next.horizon;clock.current.playing=false
    if(ready)compute(next)
  },[ready,compute])
  const run=()=>{clock.current.t=-recipe.horizon;setSelected(null);compute(recipe)}
  const selectPath=useCallback((id:number)=>{setSelected(id);setPanel('inspect')},[])
  const togglePlay=()=>{clock.current.playing=!clock.current.playing;setTick(t=>t+1)}
  const onTick=useCallback(()=>setTick(t=>t+1),[])
  const onFrame=useCallback((ms:number)=>setP95(prev=>Math.abs(prev-ms)>.8?ms:prev),[])
  const input=useMemo(()=>({world,recipe,result,projection:recipe.projection,selected,planet,surfaces,axes,stale}),
    [world,recipe,result,selected,planet,surfaces,axes,stale])
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if((e.target as HTMLElement)?.matches('input,select,textarea'))return
      if(e.key==='Escape'){setPanel(null);setViews(false);setNavigation(false)}
      if(e.code==='Space'){e.preventDefault();clock.current.playing=!clock.current.playing;setTick(t=>t+1)}
      if(e.key.toLowerCase()==='r')scene.current?.reset()
      if(e.key==='+'||e.key==='=')scene.current?.zoom(1)
      if(e.key==='-')scene.current?.zoom(-1)
    }
    addEventListener('keydown',handler);return()=>removeEventListener('keydown',handler)
  },[])
  const save=()=>{
    const next=[{name:name.trim()||'Untitled experiment',recipe:{...recipe}},...saved].slice(0,30)
    try{localStorage.setItem('gateway-notebook-v1',JSON.stringify(next));setSaved(next);notify('Experiment saved on this device.')}
    catch{notify('Device storage is unavailable. Export the recipe instead.')}
  }
  const exportRecipe=async()=>{
    const hash=await recipeHash(recipe)
    const payload={schema:1,model:'pcr3bp-v1',recipe,hash,
      system,engine:'gateway-core 1.0.0',created:new Date().toISOString(),
      diagnostics:result&&!stale?result.diagnostics:null,
      sources:['https://ssd.jpl.nasa.gov/astro_par.html','https://ssd-api.jpl.nasa.gov/doc/periodic_orbits.html']}
    download(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'gateway-'+recipe.system+'-l'+recipe.point+'.json')
  }
  const importRecipe=async(file:File)=>{
    try{
      if(file.size>1_000_000)throw new Error('This file is too large for an experiment recipe.')
      const r=validateRecipe(JSON.parse(await file.text()))
      setRecipe(r);setWorld('gateway');setSelected(null);clock.current.t=-r.horizon
      compute(r);notify('Recipe imported. Recomputing its scientific output.')
    }catch(e){notify(e instanceof Error?e.message:String(e))}
  }
  const share=async()=>{
    const encoded=btoa(recipeKey(recipe)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
    const url=new URL(location.href);url.hash='experiment='+encoded
    try{await navigator.clipboard.writeText(url.href);notify('Reproducible experiment link copied.')}catch{notify('Clipboard unavailable. Export the recipe file instead.')}
  }
  const screenshot=()=>{
    const image=scene.current?.image();if(!image)return
    fetch(image).then(r=>r.blob()).then(blob=>download(blob,'gateway-'+world+'.png'))
    notify('Scene image exported. The experiment recipe records its numerical context.')
  }
  const count=result?.paths.reduce((n,p)=>n+p.samples.length/5,0)??0
  const stage=result?.diagnostics.stage
  const busyText=stage===1?'Correcting periodic orbit…':stage===2?'Checking orbit and stability…':'Integrating manifold trajectories…'
  const validOffset=recipe.offset>0
  return <main className={'app '+(panel?'has-panel ':'')+(world==='gateway'&&recipe.projection==='section'?'section-mode':'')} data-tick={tick} data-complete={result?.complete&&!busy&&!stale?'true':'false'}>
    <Scene ref={scene} input={input} clock={clock} onPlanet={setPlanet} onPath={selectPath}
      onTick={onTick} onFrame={onFrame} onError={setGraphicsError}/>
    {world==='gateway'&&recipe.projection==='section'&&<SectionPlot result={result} selected={selected} onSelect={selectPath}/>}
    <header className="masthead">
      <div className="identity">
        <button className="wordmark" onClick={()=>{setWorld('solar');setPlanet(null);scene.current?.reset()}}>gateway</button>
        <label className="system-label"><span className="sr-only">System</span>
          <select aria-label="System" value={world==='solar'?'solar':recipe.system} onChange={e=>{
            if(e.target.value==='solar'){setWorld('solar');setPlanet(null)}
            else enterGateway(e.target.value)
          }}>
            <option value="solar">Solar System</option>
            {SYSTEMS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <div className="top-actions">
        <div className="view-context">
          <span>{world==='solar'?'J2000 ecliptic · AU':currentProjection.label}</span>
          <small>{world==='solar'?'JPL approximate orbital model':'PCR3BP · rotating-frame dynamics'}</small>
        </div>
        {world==='gateway'&&<div className="dropdown-anchor">
          <button onClick={()=>{setViews(!views);setNavigation(false)}} aria-expanded={views}>Views</button>
          {views&&<div className="view-menu" role="menu">
            {projections.map(p=><button key={p.value} role="menuitemradio" aria-checked={recipe.projection===p.value}
              onClick={()=>{edit({projection:p.value});setViews(false)}}>{p.label}<small>{p.description}</small></button>)}
            <label><input type="checkbox" checked={surfaces} onChange={e=>setSurfaces(e.target.checked)}/> Transparent manifold patches</label>
            <label><input type="checkbox" checked={axes} onChange={e=>setAxes(e.target.checked)}/> Coordinate axes</label>
          </div>}
        </div>}
        <button className={panel==='experiment'?'active':''} onClick={()=>setPanel(panel==='experiment'?null:'experiment')}>Experiment</button>
        <button className="more-button" aria-label="Open notebook and methods" onClick={()=>setPanel(panel==='about'?null:'about')}>⋯</button>
      </div>
    </header>
    <section className="story" aria-label="Current scene">
      {world==='solar'?<>
        <div className="quiet-overline">{planet===null?'A view from our neighbourhood':'Planetary focus'}</div>
        <h1>{planet===null?'Our Solar System':PLANETS[planet].name}</h1>
        <p>{planet===null?'Follow a world into its gravitational gateway.':
          PLANETS[planet].a.toFixed(3)+' AU from the Sun · select a gateway to explore transport.'}</p>
        <div className="story-actions">
          <button onClick={()=>enterGateway('sun-'+PLANETS[planet??4].name.toLowerCase())}>Explore {PLANETS[planet??4].name}’s gateway <span aria-hidden="true">↗</span></button>
          {planet===null?<button onClick={()=>setPanel('experiment')}>Choose a planet</button>:<button onClick={()=>{setPlanet(null);scene.current?.reset()}}>Whole system</button>}
        </div>
      </>:<>
        <div className="quiet-overline">{stale?'Parameters changed · previous result shown':recipe.mode==='ensemble'?'Deterministic trajectory ensemble':'The geometry of gravitational transport'}</div>
        <h1>{recipe.mode==='ensemble'?'Same energy, different futures':'Through L'+(recipe.point===1?'₁':'₂')}</h1>
        <p>{recipe.projection==='phase'?'An orbit organises the paths around it.':currentProjection.description}</p>
        <div className="story-actions">
          <button onClick={()=>setPanel('experiment')}>Change energy</button>
          <button onClick={()=>setPanel('inspect')}>Inspect the mathematics</button>
          {selected!==null&&<button onClick={()=>setSelected(null)}>Show all trajectories</button>}
        </div>
      </>}
    </section>
    <div className="transport" aria-label="Playback controls">
      <button className="play" onClick={togglePlay} aria-label={clock.current.playing?'Pause':'Play'}>{clock.current.playing?'Ⅱ':'▷'}</button>
      <input aria-label="Simulation time" type="range"
        min={world==='solar'?2451545:-recipe.horizon} max={world==='solar'?2469807.5:recipe.horizon}
        step={world==='solar'?.1:.005} value={world==='solar'?clock.current.jd:clock.current.t}
        onChange={e=>{if(world==='solar')clock.current.jd=+e.target.value;else clock.current.t=+e.target.value;setTick(t=>t+1)}}/>
      <output>{world==='solar'?jdDate(clock.current.jd):clock.current.t.toFixed(2)+' TU'}</output>
      <select aria-label="Playback speed" value={clock.current.speed} onChange={e=>{clock.current.speed=+e.target.value;setTick(t=>t+1)}}>
        {[.25,1,4,16].map(s=><option key={s} value={s}>{s}×</option>)}
      </select>
    </div>
    <div className="navigation">
      <span className="navigation-hint">Drag to rotate · scroll to zoom</span>
      <button onClick={()=>scene.current?.reset()}>Reset view</button>
      <button onClick={()=>{setNavigation(!navigation);setViews(false)}} aria-expanded={navigation}>Navigate</button>
      {navigation&&<div className="navigation-menu">
        <button onClick={()=>scene.current?.zoom(1)}>Zoom in +</button><button onClick={()=>scene.current?.zoom(-1)}>Zoom out −</button>
        <button onClick={()=>scene.current?.rotate(-1)}>Rotate left</button><button onClick={()=>scene.current?.rotate(1)}>Rotate right</button>
        <button onClick={()=>scene.current?.pan(-1)}>Pan left</button><button onClick={()=>scene.current?.pan(1)}>Pan right</button>
        <button onClick={screenshot}>Save scene image</button>
      </div>}
    </div>
    <div className="model-note">{world==='solar'?'Orbital distances to scale · body markers enlarged':recipe.projection==='phase'?'Phase-space embedding · velocity axis scaled ×0.45':'Normalised units · physical body markers enlarged'}</div>
    {(busy&&world==='gateway')&&<div className="computation" role="status">{busyText}<span>{Math.round((result?.diagnostics.progress??0)*100)}%</span><button onClick={cancel}>Cancel</button></div>}
    {(error||graphicsError)&&<div className="notice error" role="alert">{error||graphicsError}<button onClick={()=>{if(error)run();else location.reload()}}>Retry</button></div>}
    {toast&&<div className="notice" role="status">{toast}</div>}
    <input className="sr-only" ref={file} type="file" accept=".json,application/json" aria-label="Import experiment file" onChange={e=>{const f=e.target.files?.[0];if(f)void importRecipe(f);e.target.value=''}}/>
    {panel&&<aside className="sheet" aria-label={panel==='experiment'?'Experiment settings':panel==='inspect'?'Scientific diagnostics':panel==='notebook'?'Experiment notebook':'Methods and navigation'}>
      <div className="sheet-heading"><h2>{panel==='experiment'?'Experiment':panel==='inspect'?'Inspect':panel==='notebook'?'Notebook':'Behind the geometry'}</h2><button onClick={()=>setPanel(null)} aria-label="Close panel">Close</button></div>
      {panel==='experiment'&&world==='solar'?<>
        <p className="sheet-intro">Navigate the Solar System, then enter a local gateway experiment.</p>
        <label>Focus on a planet<select value={planet??''} onChange={e=>setPlanet(e.target.value===''?null:+e.target.value)}>
          <option value="">Whole system</option>{PLANETS.map((p,i)=><option key={p.name} value={i}>{p.name}</option>)}
        </select></label>
        <label>Epoch<input type="date" value={jdDate(clock.current.jd)} min="1800-01-01" max="2050-01-01"
          onChange={e=>{if(e.target.value){clock.current.jd=Date.parse(e.target.value)/86400000+2440587.5;setTick(t=>t+1)}}}/></label>
        <p className="supporting">JPL fitted Keplerian elements, valid 1800–2050. This overview is an orbital approximation, not a coupled N-body ephemeris. The Earth marker uses the Earth–Moon barycentre.</p>
        <button className="compute-button" onClick={()=>enterGateway('sun-'+PLANETS[planet??4].name.toLowerCase())}>Explore this gateway</button>
        <button className="text-action" onClick={()=>enterGateway('earth-moon')}>Open the Earth–Moon laboratory</button>
      </>:panel==='experiment'?<>
        <label>System<select value={recipe.system} onChange={e=>enterGateway(e.target.value)}>{SYSTEMS.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Jacobi energy offset ΔC<input type="number" min="0.000001" max=".05" step={system.offset/20} value={recipe.offset} onChange={e=>edit({offset:+e.target.value})}/></label>
        <input type="range" aria-label="Jacobi energy offset" min={Math.max(1e-6,system.offset*.08)} max={system.offset*3} step={system.offset/100}
          value={recipe.offset} onChange={e=>edit({offset:+e.target.value})}/>
        <p className="field-help">C = C{recipe.point===1?'₁':'₂'} − ΔC. Increasing ΔC opens the neck further.</p>
        <label>Orbit family<select aria-label="Orbit family" value={recipe.point} onChange={e=>edit({point:+e.target.value as 1|2})}><option value={1}>L₁ Lyapunov</option><option value={2}>L₂ Lyapunov</option></select></label>
        <label>Experiment type<select value={recipe.mode} onChange={e=>edit({mode:e.target.value as Recipe['mode']})}><option value="manifolds">Stable and unstable manifolds</option><option value="ensemble">Release an ensemble</option></select></label>
        <div className="branch-toggles"><label><input type="checkbox" checked={recipe.stable} onChange={e=>edit({stable:e.target.checked})}/> Stable</label><label><input type="checkbox" checked={recipe.unstable} onChange={e=>edit({unstable:e.target.checked})}/> Unstable</label></div>
        <label>Horizon <span>TU</span><input type="number" min=".1" max="30" step=".5" value={recipe.horizon} onChange={e=>edit({horizon:+e.target.value})}/></label>
        {recipe.mode==='ensemble'&&<fieldset className="ensemble-fields"><legend>Initial conditions</legend>
          <label>x<input type="number" value={recipe.x} step=".001" onChange={e=>edit({x:+e.target.value})}/></label>
          <label>y<input type="number" value={recipe.y} step=".001" onChange={e=>edit({y:+e.target.value})}/></label>
          <label>Direction <span>radians</span><input type="number" value={recipe.angle} step=".1" onChange={e=>edit({angle:+e.target.value})}/></label>
          <label>Angular spread<input type="number" min="0" max="6.28" step=".1" value={recipe.spread} onChange={e=>edit({spread:+e.target.value})}/></label>
          <label>Particle count<input type="number" min="1" max="512" value={recipe.count} onChange={e=>edit({count:+e.target.value})}/></label>
          <label>Seed<input type="number" min="0" max="4294967295" value={recipe.seed} onChange={e=>edit({seed:+e.target.value})}/></label>
          <p className="field-help">Fixed C determines speed. A deterministic uniform-angle fan is sampled at this position.</p>
        </fieldset>}
        <details><summary>Numerical settings</summary>
          <label>Orbit phases<select value={recipe.phases} onChange={e=>edit({phases:+e.target.value})}>{[16,32,64,96,128].map(n=><option key={n} value={n}>{n} ({n*4} branches)</option>)}</select></label>
          <label>Seed displacement ε<select value={recipe.epsilon} onChange={e=>edit({epsilon:+e.target.value})}>{[1e-5,3e-6,1e-6].map(n=><option key={n} value={n}>{n.toExponential()}</option>)}</select></label>
          <label>Relative tolerance<select value={recipe.tolerance} onChange={e=>edit({tolerance:+e.target.value})}>{[1e-9,1e-11,1e-12].map(n=><option key={n} value={n}>{n.toExponential()}</option>)}</select></label>
          <p className="field-help">Adaptive DP5(4), double precision. Absolute tolerance is 0.01 × relative tolerance. Accuracy is measured separately from visual sampling.</p>
        </details>
        <button className="compute-button" disabled={!ready||busy||!validOffset} onClick={run}>{busy?'Computing…':'Compute'}</button>
        {busy&&<button className="text-action" onClick={cancel}>Cancel computation</button>}
        <p className="field-help">{stale?'Previous geometry is shown until this experiment is recomputed.':'Changes start a new computation.'}</p>
        <button className="text-action" onClick={()=>setPanel('notebook')}>Save or reproduce this experiment</button>
      </>:panel==='inspect'?<>
        {!result?.orbit.length?<p className="sheet-intro">Open a gateway and compute an experiment to inspect its numerical evidence.</p>:<>
          <div className="result-state">{busy?'Computing':result.complete?'Computation complete':'Partial results'}{stale?' · previous parameters':''}</div>
          <h3>Periodic orbit</h3>
          <dl className="measurements">
            <dt>Jacobi C</dt><dd>{scientific(result.diagnostics.orbitC,8)}</dd>
            <dt>Period</dt><dd>{scientific(result.diagnostics.period,6)} TU</dd>
            <dt>Closure residual</dt><dd>{scientific(result.diagnostics.closure)}</dd>
            <dt>Orbit Jacobi drift</dt><dd>{scientific(result.diagnostics.orbitDrift)}</dd>
            <dt>Unstable multiplier</dt><dd>{scientific(result.diagnostics.unstable,5)}</dd>
            <dt>Stable multiplier</dt><dd>{scientific(result.diagnostics.stable,5)}</dd>
            <dt>Reciprocal-pair defect</dt><dd>{scientific(result.diagnostics.reciprocity)}</dd>
            <dt>Symplectic defect</dt><dd>{scientific(result.diagnostics.symplectic)}</dd>
          </dl>
          <h3>Trajectory family</h3>
          <dl className="measurements"><dt>Computed paths</dt><dd>{result.paths.length} / {result.diagnostics.total}</dd>
            <dt>Scientific samples</dt><dd>{count.toLocaleString()}</dd><dt>Maximum Jacobi drift</dt><dd>{scientific(result.diagnostics.drift)}</dd>
            <dt>Core RHS evaluations</dt><dd>{result.diagnostics.evaluations.toLocaleString()}</dd>
            <dt>Compute wall time</dt><dd>{result.computeMs.toFixed(0)} ms</dd><dt>Current frame p95</dt><dd>{p95>0?p95.toFixed(1)+' ms':'Collecting…'}</dd>
          </dl>
          <p className="field-help">Wall time includes worker scheduling and output transfer. Frame timing is a rolling browser observation, not a hardware-independent benchmark.</p>
          {result.recipe.mode==='ensemble'&&<SeparationPlot paths={result.paths}/>}
          <label>Select a trajectory<select value={selected??''} onChange={e=>setSelected(e.target.value===''?null:+e.target.value)}>
            <option value="">All trajectories</option>{result.paths.map(p=><option key={p.id} value={p.id}>{'#'+p.id+' · '+(p.branch<2?'stable':p.branch<4?'unstable':'ensemble')+' · '+REASONS[p.reason]}</option>)}
          </select></label>
          {selectedPath&&<>
            <dl className="measurements"><dt>Termination</dt><dd>{REASONS[selectedPath.reason]}</dd><dt>Jacobi drift</dt><dd>{scientific(selectedPath.drift)}</dd>
              <dt>Orbit phase</dt><dd>{selectedPath.phase.toFixed(4)}</dd><dt>Seed displacement</dt><dd>{scientific(selectedPath.epsilon)}</dd>
              <dt>Forward flow</dt><dd>{selectedPath.branch<2?'Toward the orbit':'Away from the seed'}</dd>
            </dl>
            <DriftPlot path={selectedPath} system={result.recipe.system}/>
            <button className="text-action" onClick={()=>setShowTable(!showTable)}>{showTable?'Hide':'Show'} scientific sample table</button>
            {showTable&&<div className="sample-table" tabIndex={0}><table><caption>Stored f64 samples, every {Math.max(1,Math.floor(selectedPath.samples.length/5/40))} steps</caption><thead><tr><th>t</th><th>x</th><th>y</th><th>vₓ</th><th>vᵧ</th></tr></thead><tbody>
              {Array.from({length:Math.min(40,selectedPath.samples.length/5)},(_,j)=>{
                const k=j*Math.max(1,Math.floor(selectedPath.samples.length/5/40))*5
                return <tr key={j}>{Array.from(selectedPath.samples.slice(k,k+5), (v,i)=><td key={i}>{v.toFixed(6)}</td>)}</tr>
              })}
            </tbody></table></div>}
          </>}
          <div className="outcomes"><h3>Finite-time outcomes</h3>{REASONS.map((reason,i)=><div key={reason}><span>{reason}</span><span>{result.paths.filter(p=>p.reason===i).length}</span></div>)}</div>
          <p className="supporting">An observation-domain exit is not proof of asymptotic escape. A primary boundary stops integration without softening the force. Manifold seeds and finite-time surfaces are numerical approximations.</p>
        </>}
      </>:panel==='notebook'?<>
        <p className="sheet-intro">Keep the parameters, seed and model that produced an experiment.</p>
        <label>Experiment name<input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label>
        <button className="compute-button" onClick={save}>Save on this device</button>
        <div className="notebook-actions"><button onClick={()=>void exportRecipe()}>Export recipe</button><button onClick={()=>file.current?.click()}>Import recipe</button><button onClick={()=>void share()}>Copy experiment link</button></div>
        <h3>Field notes</h3>
        {SCENARIOS.map(s=><div className="saved-experiment" key={s.name}><button onClick={()=>{const r=s.recipe();setRecipe(r);setWorld('gateway');setSelected(null);clock.current.t=-r.horizon;compute(r);setPanel(null)}}>{s.name}<small>{s.description}</small></button></div>)}
        <h3>Saved experiments</h3>
        {!saved.length&&<p className="supporting">Your saved experiments will appear here. No account is needed.</p>}
        {saved.map((s,i)=><div className="saved-experiment" key={i}><button onClick={()=>{
          try{const r=validateRecipe(s.recipe);setRecipe(r);setWorld('gateway');compute(r);clock.current.t=-r.horizon;notify('Recomputing saved experiment.')}catch{notify('This stored recipe is invalid. Export a new recipe.')}
        }}>{s.name}<small>{systemFor(s.recipe.system).name} · L{s.recipe.point}</small></button>
          <button aria-label={'Remove '+s.name} onClick={()=>{const next=saved.filter((_,j)=>j!==i);setSaved(next);try{localStorage.setItem('gateway-notebook-v1',JSON.stringify(next))}catch{/* Device storage can be unavailable. */}}}>×</button>
        </div>)}
        <p className="supporting">A recipe reproduces results within numerical tolerances. Exact floating-point identity across different browser builds is not promised.</p>
      </>:<>
        <p className="sheet-intro">A numerical instrument for exploring the geometry that organises gravitational motion.</p>
        <h3>Two scales of exploration</h3>
        <p>The Solar System uses JPL fitted orbital elements. Each local gateway uses a planar circular restricted three-body model: two circular primaries and a massless particle.</p>
        <p>The local stable and unstable manifolds belong to that declared model. They are not exact tubes in the evolving, eight-planet Solar System.</p>
        <h3>Built from the equations</h3>
        <p>Rust and WebAssembly integrate trajectories and their variational equations. Corrected Lyapunov orbits anchor the manifold families. The interface renders actual computed samples; no concept artwork supplies the geometry.</p>
        <h3>Navigation</h3>
        <p>Drag to orbit. Scroll or pinch to zoom. Right-drag or two-finger drag to pan. Space pauses. R resets the camera. + and − zoom. The Navigate menu provides labelled alternatives.</p>
        <h3>Reading the scene</h3>
        <p>Pearl marks the periodic orbit; mineral aqua emphasises stable branches, pale gold unstable ones. A phase-space view includes velocity. Potential relief is a scalar graph. Brightness is not probability.</p>
        <div className="method-links"><a href="https://ssd.jpl.nasa.gov/planets/approx_pos.html" target="_blank" rel="noreferrer">JPL orbital model ↗</a><a href="https://ssd-api.jpl.nasa.gov/doc/periodic_orbits.html" target="_blank" rel="noreferrer">Periodic-orbit reference ↗</a><a href="https://github.com/krishnuni/gateway" target="_blank" rel="noreferrer">Source and verification ↗</a></div>
        <button className="text-action" onClick={()=>setPanel('notebook')}>Open experiment notebook</button>
      </>}
    </aside>}
    <div className="sr-only" role="status" aria-live="polite">{busy?busyText:result?.complete?'Numerical experiment complete. '+result.paths.length+' trajectories available.':''}</div>
  </main>
}
