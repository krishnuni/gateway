export type Projection = 'position' | 'phase' | 'inertial' | 'potential' | 'section'
export type World = 'solar' | 'gateway'
export type Branch = 0 | 1 | 2 | 3 | 4
export interface System {
  id: string; name: string; primary: string; secondary: string
  mu: number; lengthKm: number; timeSeconds: number; guard1: number; guard2: number
  offset: number; planet?: number
}
export interface Recipe {
  schema: 1; model: 'pcr3bp-v1'; system: string; point: 1 | 2
  offset: number; horizon: number; phases: number; epsilon: number; tolerance: number
  mode: 'manifolds' | 'ensemble'; count: number; seed: number
  x: number; y: number; angle: number; spread: number
  projection: Projection; stable: boolean; unstable: boolean
}
export interface Trajectory {
  id: number; branch: Branch; phase: number; reason: number; drift: number; evaluations: number
  steps: number; rejected: number; epsilon: number; jacobi: number
  samples: Float64Array; sections: Float64Array
}
export interface Diagnostics {
  stage: number; progress: number; c: number; orbitC: number; period: number
  closure: number; energyResidual: number; unstable: number; stable: number
  symplectic: number; determinant: number; eigenU: number; eigenS: number
  accepted: number; rejected: number; evaluations: number; drift: number
  completed: number; total: number; failures: number; iterations: number; orbitDrift: number; reciprocity: number
}
export interface Result {
  revision: number; recipe: Recipe; points: Float64Array; orbit: Float64Array
  matrix: Float64Array; paths: Trajectory[]; diagnostics: Diagnostics
  field: Float64Array; contours:Float64Array; computeMs: number; complete: boolean
}
export type EngineReply =
  | { type: 'ready' }
  | { type: 'progress'; revision: number; diagnostics: Diagnostics; paths: Trajectory[]; orbit?: Float64Array; matrix?: Float64Array; points?: Float64Array; field?: Float64Array; contours?:Float64Array; computeMs: number; done: boolean }
  | { type: 'error'; revision: number; message: string }
  | { type: 'cancelled'; revision: number }
export type EngineRequest = { type: 'compute'; revision: number; recipe: Recipe } | { type: 'cancel' }
