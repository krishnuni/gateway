import { loadCore, values, message } from './wasm'
import { systemFor } from '../data'
import type { Diagnostics, EngineRequest, EngineReply, Trajectory } from '../types'

const send = (data: EngineReply, transfer: Transferable[] = []) => self.postMessage(data, { transfer })
let active = 0
const core = loadCore()
core.then(() => send({ type: 'ready' })).catch(e => send({ type: 'error', revision: 0, message: String(e) }))
const diagnostics = (m: Float64Array): Diagnostics => ({
  stage:m[0],progress:m[1],c:m[2],orbitC:m[3],period:m[4],closure:m[5],energyResidual:m[6],
  unstable:m[7],stable:m[8],symplectic:m[9],determinant:m[10],eigenU:m[11],eigenS:m[12],
  accepted:m[13],rejected:m[14],evaluations:m[15],drift:m[16],completed:m[17],total:m[18],
  failures:m[19],iterations:m[23],orbitDrift:m[25],reciprocity:m[26],
})
const yieldThread = () => new Promise<void>(resolve => setTimeout(resolve, 0))
self.onmessage = async ({ data }: MessageEvent<EngineRequest>) => {
  if (data.type==='cancel') { active++; return }
  const token = ++active
  const { recipe:r, revision } = data
  try {
    const api = await core
    if (active!==token) return
    const system = systemFor(r.system)
    const start = performance.now()
    api.gw_setup(system.mu)
    const points = values(api,api.gw_points_ptr(),15)
    const c = points[(r.point-1)*3+2]-r.offset
    api.gw_field(system.mu,c,-1.5,-1.5,4,3,360,270)
    const field = values(api,api.gw_scratch_ptr(),360*270)
    const contourLength=api.gw_contours(system.mu,c)
    const contours=values(api,api.gw_scratch_ptr(),contourLength)
    if (!api.gw_begin(system.mu,r.point,r.offset,r.horizon,r.phases,r.epsilon,r.tolerance,
      system.guard1,system.guard2,r.mode==='ensemble'?r.count:0,r.seed,r.x,r.y,r.angle,r.spread)) {
      throw new Error(message(api,api.gw_input_error_ptr(),api.gw_input_error_len()))
    }
    let uploaded = false, lastSent = start, paths:Trajectory[]=[]
    for (;;) {
      if (token!==active) { send({type:'cancelled',revision}); return }
      // Batch bounded solver calls within an 8 ms time slice. Yielding after
      // every 64 steps would amplify browser timer clamping into long delays.
      const chunkStart=performance.now()
      let status=0
      do {
        status=api.gw_step(256)
        if(status===3)throw new Error(message(api,api.gw_error_ptr(),api.gw_error_len()))
        if(status===1){
          const d=values(api,api.gw_descriptor_ptr(),12)
          paths.push({id:d[0],branch:d[1] as Trajectory['branch'],phase:d[2],reason:d[3],drift:d[4],
            evaluations:d[5],steps:d[6],rejected:d[7],epsilon:d[8],jacobi:d[9],
            samples:values(api,api.gw_path_ptr(),api.gw_path_len()),
            sections:values(api,api.gw_section_ptr(),api.gw_section_len())})
        }
      }while(status<2&&performance.now()-chunkStart<8)
      const m=values(api,api.gw_meta_ptr(),40)
      if (status===2 || performance.now()-lastSent>60 || (!uploaded && m[0]===3)) {
        const reply: Extract<EngineReply,{type:'progress'}> = {type:'progress',revision,diagnostics:diagnostics(m),
          paths,computeMs:performance.now()-start,done:status===2}
        const transfer:Transferable[]=[]
        for(const path of paths) transfer.push(path.samples.buffer,path.sections.buffer)
        if (!uploaded && m[0]>=3) {
          reply.orbit=values(api,api.gw_orbit_ptr(),api.gw_orbit_len())
          reply.matrix=values(api,api.gw_matrix_ptr(),16)
          reply.points=points;reply.field=field;reply.contours=contours;uploaded=true
          transfer.push(reply.orbit.buffer,reply.matrix.buffer,points.buffer,field.buffer,contours.buffer)
        }
        send(reply,transfer);paths=[];lastSent=performance.now()
      }
      if (status===2) return
      await yieldThread()
    }
  } catch(error) {
    send({type:'error',revision,message:error instanceof Error ? error.message : String(error)})
  }
}
