import type { Recipe, System } from './types'
export const AU_KM = 149597870.7
export const SUN_GM = 132712440041.279419
export const PLANETS = [
  { name: 'Mercury', a: .38709927, gm: 22031.868551, radius: 2439.7, colour: '#c0bab0' },
  { name: 'Venus', a: .72333566, gm: 324858.592, radius: 6051.8, colour: '#ded0ab' },
  { name: 'Earth', a: 1.00000261, gm: 398600.435507, radius: 6378.137, colour: '#a8c9d3' },
  { name: 'Mars', a: 1.52371034, gm: 42828.375816, radius: 3396.2, colour: '#ce9d85' },
  { name: 'Jupiter', a: 5.202887, gm: 126712764.1, radius: 71492, colour: '#d9c3a4' },
  { name: 'Saturn', a: 9.53667594, gm: 37940584.8418, radius: 60268, colour: '#dfd2af' },
  { name: 'Uranus', a: 19.18916464, gm: 5794556.4, radius: 25559, colour: '#a8d4d5' },
  { name: 'Neptune', a: 30.06992276, gm: 6836527.10058, radius: 24764, colour: '#9aafda' },
]
export const SYSTEMS: System[] = [
  { id: 'earth-moon', name: 'Earth–Moon', primary: 'Earth', secondary: 'Moon',
    mu: .01215058560962404, lengthKm: 389703.2648292776, timeSeconds: 382981.2891290545,
    guard1: 6378.137/389703.2648292776, guard2: 1737.1/389703.2648292776, offset: .006 },
  ...PLANETS.map((p, planet) => {
    const mu = p.gm/(SUN_GM+p.gm)
    const lengthKm = p.a*AU_KM
    return { id: 'sun-'+p.name.toLowerCase(), name: 'Sun–'+p.name, primary: 'Sun', secondary: p.name,
      mu, lengthKm, timeSeconds: Math.sqrt(lengthKm**3/(SUN_GM+p.gm)),
      guard1: 695700/lengthKm, guard2: p.radius/lengthKm,
      offset: .006*(mu/.01215058560962404)**(2/3), planet }
  }),
]
export const systemFor = (id: string) => SYSTEMS.find(s => s.id===id) ?? SYSTEMS[0]
export function defaultRecipe(system = 'earth-moon'): Recipe {
  const s = systemFor(system)
  return { schema: 1, model: 'pcr3bp-v1', system: s.id, point: 1, offset: s.offset,
    horizon: 8, phases: 64, epsilon: 1e-6, tolerance: 1e-11, mode: 'manifolds',
    count: 96, seed: 1729, x: 1-s.mu-2*(s.mu/3)**(1/3), y: 0,
    angle: Math.PI/2, spread: .7, projection: 'phase', stable: true, unstable: true }
}
export const INITIAL_JD = Date.UTC(2026,9,22)/86400000+2440587.5
export const LIMIT_JD = 2469807.5
