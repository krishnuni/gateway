import test from 'node:test'
import assert from 'node:assert/strict'
import { loadEngine, solve } from '../scripts/engine-host.mjs'

const engine=await loadEngine(),{e,copy}=engine
const mu=.01215058560962404
const evaluate=(m,s)=>copy(e.gw_evaluate(m,...s),11)
const trace=(s,t,tol=1e-12,m=mu)=>{
  const n=e.gw_trace(m,...s,t,tol);assert.ok(n>0)
  const a=copy(e.gw_scratch_ptr(),n)
  return {end:a.slice(-20,-16),matrix:a.slice(-16),samples:a.slice(0,-16)}
}
const near=(a,b,tol)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}, tolerance ${tol}`)

test('equilibrium force residuals and independent Earth–Moon coordinates',()=>{
  assert.equal(e.gw_abi(),1);assert.equal(e.gw_setup(mu),1)
  const p=copy(e.gw_points_ptr(),15)
  near(p[0],.8369151257723572,1e-12);near(p[3],1.155682165444884,1e-12)
  for(let i=0;i<15;i+=3){const f=evaluate(mu,[p[i],p[i+1],0,0]);assert.ok(Math.max(Math.abs(f[4]),Math.abs(f[5]))<1e-12)}
})

test('analytic Hessian agrees with central differences and Jacobi derivative vanishes',()=>{
  const s=[.7,.1,.2,-.3],f=evaluate(mu,s),h=1e-5
  const xp=evaluate(mu,[s[0]+h,...s.slice(1)]),xm=evaluate(mu,[s[0]-h,...s.slice(1)])
  const yp=evaluate(mu,[s[0],s[1]+h,...s.slice(2)]),ym=evaluate(mu,[s[0],s[1]-h,...s.slice(2)])
  near((xp[6]-xm[6])/(2*h),f[8],2e-8)
  near((yp[7]-ym[7])/(2*h),f[9],2e-8)
  near((yp[6]-ym[6])/(2*h),f[10],2e-8)
  near(2*f[6]*s[2]+2*f[7]*s[3]-2*s[2]*f[4]-2*s[3]*f[5],0,1e-14)
})

test('zero-secondary-mass limit matches an analytic rotating circular orbit',()=>{
  const r=.7,n=r**-1.5,w=n-1,t=4
  const result=trace([r,0,0,w*r],t,1e-12,0)
  const expected=[r*Math.cos(w*t),r*Math.sin(w*t),-r*w*Math.sin(w*t),r*w*Math.cos(w*t)]
  result.end.forEach((v,i)=>near(v,expected[i],2e-10))
})

test('STM differentiates the flow and backward integration reverses it',()=>{
  const s=[.7,.1,.2,-.3],base=trace(s,.5),h=2e-6
  for(let j=0;j<4;j++){
    const p=[...s],m=[...s];p[j]+=h;m[j]-=h
    const a=trace(p,.5),b=trace(m,.5)
    for(let i=0;i<4;i++)near((a.end[i]-b.end[i])/(2*h),base.matrix[i*4+j],2e-7)
  }
  trace(base.end,-.5).end.forEach((v,i)=>near(v,s[i],1e-10))
})

test('tolerance refinement reduces common-time trajectory error',()=>{
  const initial=[.7,.1,.2,-.3],ref=trace(initial,2,1e-14).samples
  const errors=[1e-8,1e-10,1e-12].map(tol=>Math.max(...trace(initial,2,tol).samples.map((v,i)=>Math.abs(v-ref[i]))))
  assert.ok(errors[1]<errors[0]/10&&errors[2]<errors[1]/10,JSON.stringify(errors))
})

test('corrected L1/L2 families close and retain a reciprocal hyperbolic pair',()=>{
  for(const m of [mu,.000953881151934512])for(const point of [1,2]){
    const r=solve(engine,{mu:m,point,offset:m===mu?.006:.001,phases:8,horizon:5})
    assert.equal(r.paths.length,32);assert.equal(r.meta[19],0)
    assert.ok(r.meta[5]<1e-8);assert.ok(r.meta[6]<1e-11)
    assert.ok(r.meta[9]<1e-7);assert.ok(r.meta[26]<1e-6)
    assert.ok(r.meta[11]<1e-10&&r.meta[12]<1e-10)
    for(const p of r.paths){
      near(p.description[9],r.meta[2],1e-11)
      assert.ok(p.description[4]<1e-8)
      assert.equal(Math.sign(p.samples.at(-5)),p.description[1]<2?-1:1)
      for(let k=0;k<p.sections.length;k+=5){near(p.sections[k+2],0,1e-10);assert.ok(p.sections[k+4]>0)}
    }
  }
})

test('local stable/unstable seeds approach the periodic orbit in their declared flow direction',()=>{
  const r=solve(engine,{phases:8,horizon:.1}),s=r.orbit.slice(1,5)
  for(const p of [r.paths[0],r.paths[2]]){
    const direction=p.description[1]<2?1:-1
    const seed=p.samples.slice(1,5),a=trace(seed,direction*.5).end,b=trace(s,direction*.5).end
    const before=Math.hypot(...seed.map((v,i)=>v-s[i])),after=Math.hypot(...a.map((v,i)=>v-b[i]))
    assert.ok(after<before*.5,`${before} → ${after}`)
  }
})

test('phase and displacement refinements retain the same orbit and local manifold direction',()=>{
  const a=solve(engine,{phases:8,epsilon:1e-6,horizon:.5}),b=solve(engine,{phases:16,epsilon:3e-6,horizon:.5})
  near(a.meta[4],b.meta[4],1e-12)
  for(let i=0;i<32;i++){
    const pa=a.paths[i],pb=b.paths[Math.floor(i/4)*8+i%4]
    const qa=pa.samples.slice(1,5).map((v,j)=>v-a.orbit[j+1+Math.floor(i/4)*48*5])
    const qb=pb.samples.slice(1,5).map((v,j)=>v-b.orbit[j+1+Math.floor(i/4)*48*5])
    const cosine=qa.reduce((n,v,j)=>n+v*qb[j],0)/Math.hypot(...qa)/Math.hypot(...qb)
    assert.ok(cosine>1-1e-6)
  }
})

test('seeded ensembles reproduce exactly and stay on the requested energy surface',()=>{
  const options={ensemble:16,phases:8,horizon:3,x:.82,spread:1e-5}
  const a=solve(engine,options),b=solve(engine,options),c=solve(engine,{...options,seed:98})
  assert.deepEqual(a.paths,b.paths)
  assert.notDeepEqual(a.paths[0].samples,c.paths[0].samples)
  for(const p of a.paths)near(p.description[9],a.meta[2],1e-12)
})

test('all eight Sun–planet scales compute finite corrected families and resolved contour endpoints',()=>{
  const sun=132712440041.279419
  for(const gm of [22031.868551,324858.592,398600.435507,42828.375816,126712764.1,37940584.8418,5794556.4,6836527.10058]){
    const m=gm/(sun+gm),r=solve(engine,{mu:m,offset:.006*(m/mu)**(2/3),phases:8,horizon:1,guard1:.000001,guard2:.0000001})
    assert.ok(r.meta[5]<1e-7);assert.equal(r.meta[19],0)
    const n=e.gw_contours(m,r.meta[2]),segments=copy(e.gw_scratch_ptr(),n)
    assert.ok(n>0&&n<300000)
    for(let i=0;i<n;i+=26)near(2*evaluate(m,[segments[i],segments[i+1],0,0])[1],r.meta[2],1e-9)
  }
})

test('invalid resources, forbidden ensemble origins and initial primary intersections fail explicitly',()=>{
  assert.throws(()=>solve(engine,{phases:99999}),/limits/)
  assert.throws(()=>solve(engine,{offset:NaN}),/limits/)
  assert.throws(()=>solve(engine,{ensemble:8,x:-mu,y:0}),/outside/)
  assert.throws(()=>solve(engine,{ensemble:8,x:1-mu,y:0}),/outside/)
  assert.throws(()=>solve(engine,{ensemble:8,x:0,y:1}),/forbidden/)
})

test('primary termination is a root-localised physical surface, not a softened force',()=>{
  const r=solve(engine,{ensemble:32,phases:8,horizon:12,x:.82,spread:6.28})
  const impacts=r.paths.filter(p=>p.description[3]===1||p.description[3]===2)
  assert.ok(impacts.length>0)
  for(const p of impacts){const end=p.samples.slice(-4),secondary=p.description[3]===2
    near(Math.hypot(end[0]+mu-(secondary?1:0),end[1]),secondary?.00446:.0164,1e-10)
  }
})

test('solar epochs stay in the published domain and three-dimensional planetary paths close',()=>{
  assert.equal(e.gw_solar(0),0);assert.equal(e.gw_solar(2451545),24)
  const p=copy(e.gw_scratch_ptr(),24)
  assert.ok(Math.abs(p[2])>1e-4)
  for(let i=0;i<8;i++){
    const radius=Math.hypot(...p.slice(i*3,i*3+3));assert.ok(radius>.3&&radius<31)
    const n=e.gw_solar_path(i,2451545,768),a=copy(e.gw_scratch_ptr(),n)
    a.slice(-3).forEach((v,j)=>near(v,a[j],1e-12))
  }
})
