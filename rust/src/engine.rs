use crate::integrator::{Dense, Integrator};
use crate::model::*;

pub const META: usize = 40;
pub struct Options {
    pub mu: f64,
    pub point: usize,
    pub offset: f64,
    pub horizon: f64,
    pub phases: usize,
    pub epsilon: f64,
    pub rtol: f64,
    pub atol: f64,
    pub guard1: f64,
    pub guard2: f64,
    pub ensemble: usize,
    pub seed: u32,
    pub x: f64,
    pub y: f64,
    pub angle: f64,
    pub spread: f64,
}

pub struct Job {
    pub options: Options,
    pub meta: [f64; META],
    pub error: String,
    pub orbit: Vec<f64>,
    pub last: Vec<f64>,
    pub sections: Vec<f64>,
    pub descriptor: [f64; 12],
    pub monodromy: Vec<f64>,
    stage: usize,
    initial: State,
    period: f64,
    flight: Option<Integrator>,
    orbit_samples: Vec<Augmented>,
    sample_index: usize,
    sample_count: usize,
    vectors: [State; 2],
    trajectory_index: usize,
    drift: f64,
    c_initial: f64,
    correction_offset: f64,
    correction_iterations: usize,
}

fn append(buffer: &mut Vec<f64>, t: f64, s: &Augmented) {
    buffer.extend_from_slice(&[t, s[0], s[1], s[2], s[3]]);
}

impl Job {
    pub fn new(options: Options) -> Result<Self, String> {
        if !(1e-7..=0.5).contains(&options.mu)
            || !(1e-6..=0.05).contains(&options.offset)
            || !(0.1..=30.).contains(&options.horizon)
            || !(8..=256).contains(&options.phases)
            || !(1e-8..=1e-3).contains(&options.epsilon)
            || !(1..=2).contains(&options.point)
            || !(1e-14..=1e-7).contains(&options.rtol)
            || options.ensemble > 512
            || [
                options.x,
                options.y,
                options.angle,
                options.spread,
                options.guard1,
                options.guard2,
                options.atol,
            ]
            .iter()
            .any(|x| !x.is_finite())
            || options.guard1 <= 0.
            || options.guard2 <= 0.
            || options.atol <= 0.
        {
            return Err("Parameters are outside the supported scientific/resource limits".into());
        }
        if options.ensemble > 0
            && (((options.x + options.mu).powi(2) + options.y * options.y).sqrt() <= options.guard1
                || ((options.x - 1. + options.mu).powi(2) + options.y * options.y).sqrt()
                    <= options.guard2
                || options.x.hypot(options.y) >= 4.)
        {
            return Err(
                "Place the ensemble outside both physical bodies and inside the observation domain"
                    .into(),
            );
        }
        let p = lagrange(options.mu)[options.point - 1];
        let d = derivatives(options.mu, p[0], 0.);
        let b = 4. - d[2] - d[3];
        let c = d[2] * d[3];
        let omega2 = (b + (b * b - 4. * c).sqrt()) * 0.5;
        let beta = (omega2 + d[2]) * 0.5;
        let correction_offset = options
            .offset
            .min(0.0002 * (options.mu / 0.01215058560962404).powf(2. / 3.));
        let amplitude = (correction_offset / (beta * beta - d[2])).sqrt();
        let initial = [p[0] - amplitude, 0., 0., beta * amplitude];
        let mut meta = [0.; META];
        meta[0] = 1.;
        meta[2] = p[2] - options.offset;
        meta[17] = 0.;
        meta[18] = if options.ensemble > 0 {
            options.ensemble as f64
        } else {
            (options.phases * 4) as f64
        };
        meta[21] = options.point as f64;
        meta[22] = p[0];
        meta[24] = options.mu;
        let sample_count = options.phases * ((384 + options.phases - 1) / options.phases);
        Ok(Self {
            options,
            meta,
            error: String::new(),
            orbit: vec![],
            last: vec![],
            sections: vec![],
            descriptor: [0.; 12],
            monodromy: vec![],
            stage: 1,
            initial,
            period: 0.,
            flight: None,
            orbit_samples: vec![],
            sample_index: 0,
            sample_count,
            vectors: [[0.; 4]; 2],
            trajectory_index: 0,
            drift: 0.,
            c_initial: 0.,
            correction_offset,
            correction_iterations: 0,
        })
    }
    fn fail(&mut self, message: String) -> u32 {
        self.error = message;
        self.stage = 4;
        self.meta[0] = 4.;
        3
    }
    fn account(&mut self, f: &Integrator) {
        self.meta[13] += f.accepted as f64;
        self.meta[14] += f.rejected as f64;
        self.meta[15] += f.evaluations as f64;
    }
    fn integrator(&self, s: State, end: f64, variational: bool) -> Integrator {
        Integrator::new(
            self.options.mu,
            augmented(s),
            end,
            self.options.rtol,
            self.options.atol,
            variational,
        )
    }
    pub fn step(&mut self, budget: usize) -> u32 {
        match self.stage {
            1 => self.correct(budget),
            2 => self.full_orbit(budget),
            3 => self.trajectory(budget),
            4 => 3,
            _ => 2,
        }
    }
    fn correct(&mut self, budget: usize) -> u32 {
        if self.flight.is_none() {
            self.flight = Some(self.integrator(self.initial, 12., true));
        }
        let mut flight = self.flight.take().unwrap();
        for _ in 0..budget {
            let dense = match flight.step() {
                Ok(x) => x,
                Err(e) => return self.fail(e),
            };
            if dense.t > 0.03 && dense.start[1] > 0. && dense.end[1] <= 0. {
                let (half, s) = dense.root(|s| s[1]);
                self.account(&flight);
                self.meta[23] += 1.;
                self.correction_iterations += 1;
                let working_c = self.meta[2] + self.options.offset - self.correction_offset;
                let r0 = s[2];
                let r1 = jacobi(self.options.mu, &self.initial) - working_c;
                self.meta[27] = r0;
                self.meta[30] = self.initial[0];
                self.meta[31] = self.initial[3];
                self.meta[32] = half;
                self.meta[33] = r1;
                if r0.abs() < 2e-12 && r1.abs() < 2e-12 {
                    if self.correction_offset < self.options.offset - 1e-12 {
                        let next = (self.correction_offset * 1.4).min(self.options.offset);
                        let scale = (next / self.correction_offset).sqrt();
                        self.initial[0] = self.meta[22] + (self.initial[0] - self.meta[22]) * scale;
                        self.initial[3] *= scale;
                        self.correction_offset = next;
                        self.correction_iterations = 0;
                        return 0;
                    }
                    self.period = 2. * half;
                    self.meta[4] = self.period;
                    self.stage = 2;
                    self.meta[0] = 2.;
                    self.sample_index = 0;
                    return 0;
                }
                if self.correction_iterations > 25 || self.meta[23] > 300. || s[3].abs() < 1e-9 {
                    return self.fail("Periodic orbit correction did not converge; choose a smaller energy offset".into());
                }
                let f = rhs(self.options.mu, &s, false);
                let a = s[4 + 2 * 4] - f[2] * s[4 + 1 * 4] / s[3];
                let b = s[4 + 2 * 4 + 3] - f[2] * s[4 + 1 * 4 + 3] / s[3];
                let c = 2. * derivatives(self.options.mu, self.initial[0], 0.)[0];
                let d = -2. * self.initial[3];
                let det = a * d - b * c;
                if !det.is_finite() || det.abs() < 1e-12 {
                    return self.fail("Ill-conditioned periodic orbit correction".into());
                }
                let dx = (-r0 * d + b * r1) / det;
                let dv = (-a * r1 + r0 * c) / det;
                let damping = (0.025 / dx.abs().max(dv.abs())).min(1.);
                self.initial[0] += damping * dx;
                self.initial[3] += damping * dv;
                if self.initial[3] <= 0. || (self.initial[0] - self.meta[22]).abs() > 0.25 {
                    return self
                        .fail("Correction left the supported Lyapunov family window".into());
                }
                return 0;
            }
            if flight.finished() {
                return self.fail("No non-grazing symmetric return found".into());
            }
        }
        self.flight = Some(flight);
        0
    }
    fn full_orbit(&mut self, budget: usize) -> u32 {
        if self.flight.is_none() {
            self.flight = Some(self.integrator(self.initial, self.period, true));
        }
        let mut flight = self.flight.take().unwrap();
        for _ in 0..budget {
            let dense = match flight.step() {
                Ok(x) => x,
                Err(e) => return self.fail(e),
            };
            while self.sample_index <= self.sample_count {
                let t = self.period * self.sample_index as f64 / self.sample_count as f64;
                if t > flight.t + 1e-13 {
                    break;
                }
                let s = dense.eval((t - dense.t) / dense.h);
                append(&mut self.orbit, t, &s);
                self.orbit_samples.push(s);
                self.sample_index += 1;
            }
            self.meta[25] =
                self.meta[25].max((jacobi(self.options.mu, &flight.y) - self.meta[2]).abs());
            if flight.finished() {
                self.account(&flight);
                self.meta[3] = jacobi(self.options.mu, &self.initial);
                self.meta[5] = (0..4)
                    .map(|i| (flight.y[i] - self.initial[i]).abs())
                    .fold(0., f64::max);
                self.meta[6] = (self.meta[3] - self.meta[2]).abs();
                let m = matrix(&flight.y);
                let pair = match hyperbolic_pair(&m) {
                    Ok(p) => p,
                    Err(e) => return self.fail(e),
                };
                self.vectors = [pair[0].1, pair[1].1];
                self.meta[7] = pair[1].0;
                self.meta[8] = pair[0].0;
                self.meta[9] = symplectic_defect(&m);
                self.meta[10] = (determinant(&m) - 1.).abs();
                self.meta[11] = pair[1].2;
                self.meta[12] = pair[0].2;
                self.meta[26] = (pair[0].0 * pair[1].0 - 1.).abs();
                self.monodromy = m.into_iter().flatten().collect();
                if self.meta[5] > 1e-7 || self.meta[9] > 5e-5 || self.meta[26] > 1e-4 {
                    return self.fail(
                        "Orbit/stability accuracy gate failed; reduce energy or tighten tolerance"
                            .into(),
                    );
                }
                self.stage = 3;
                self.meta[0] = 3.;
                return 0;
            }
        }
        self.flight = Some(flight);
        0
    }
    fn seed(&self, index: usize) -> Result<(State, f64, usize, f64), String> {
        let o = &self.options;
        if o.ensemble > 0 {
            let mut random = o
                .seed
                .wrapping_add((index as u32).wrapping_mul(747796405))
                .wrapping_add(2891336453);
            random ^= random >> 16;
            random = random.wrapping_mul(2246822519);
            random ^= random >> 13;
            let u = random as f64 / u32::MAX as f64;
            let angle = o.angle + (u - 0.5) * o.spread;
            let speed2 = 2. * potential(o.mu, o.x, o.y) - self.meta[2];
            if speed2 < 0. {
                return Err("The ensemble origin is forbidden at this Jacobi constant".into());
            }
            let speed = speed2.sqrt();
            return Ok((
                [o.x, o.y, speed * angle.cos(), speed * angle.sin()],
                o.horizon,
                4,
                0.,
            ));
        }
        let phase = index / 4;
        let branch = index % 4;
        let s = self.orbit_samples[phase * self.sample_count / o.phases];
        let mut v = mat_vec(&matrix(&s), self.vectors[if branch < 2 { 0 } else { 1 }]);
        let norm = (v[0] * v[0] + v[1] * v[1]).sqrt();
        if norm < 1e-12 {
            return Err("Unresolved position component of manifold eigenvector".into());
        }
        let sign = if branch % 2 == 0 { 1. } else { -1. };
        for x in &mut v {
            *x *= o.epsilon * sign / norm;
        }
        let mut seeded = std::array::from_fn(|i| s[i] + v[i]);
        for _ in 0..4 {
            let residual = jacobi(o.mu, &seeded) - self.meta[2];
            if residual.abs() < 2e-14 {
                break;
            }
            let d = derivatives(o.mu, seeded[0], seeded[1]);
            let gradient = [2. * d[0], 2. * d[1], -2. * seeded[2], -2. * seeded[3]];
            let norm2 = gradient.iter().map(|x| x * x).sum::<f64>();
            if norm2 < 1e-18 {
                return Err("Degenerate energy surface at manifold seed".into());
            }
            let correction = residual / norm2;
            for i in 0..4 {
                seeded[i] -= correction * gradient[i];
            }
        }
        Ok((
            seeded,
            if branch < 2 { -o.horizon } else { o.horizon },
            branch,
            phase as f64 / o.phases as f64,
        ))
    }
    fn finish_trajectory(&mut self, flight: &Integrator, reason: usize) -> u32 {
        self.account(flight);
        self.descriptor[3] = reason as f64;
        self.descriptor[4] = self.drift;
        self.descriptor[5] = flight.evaluations as f64;
        self.descriptor[6] = flight.accepted as f64;
        self.descriptor[7] = flight.rejected as f64;
        self.descriptor[9] = self.c_initial;
        self.meta[16] = self.meta[16].max(self.drift);
        if reason >= 4 {
            self.meta[19] += 1.;
        }
        self.trajectory_index += 1;
        self.meta[17] = self.trajectory_index as f64;
        self.meta[1] = self.meta[17] / self.meta[18];
        1
    }
    fn trajectory(&mut self, budget: usize) -> u32 {
        if self.trajectory_index >= self.meta[18] as usize {
            self.stage = 5;
            self.meta[0] = 5.;
            self.meta[1] = 1.;
            return 2;
        }
        if self.flight.is_none() {
            let (seed, end, branch, phase) = match self.seed(self.trajectory_index) {
                Ok(s) => s,
                Err(e) => return self.fail(e),
            };
            self.last.clear();
            self.sections.clear();
            self.c_initial = jacobi(self.options.mu, &seed);
            self.drift = 0.;
            self.sample_index = 1;
            self.descriptor = [
                self.trajectory_index as f64,
                branch as f64,
                phase,
                0.,
                0.,
                0.,
                0.,
                0.,
                self.options.epsilon,
                self.c_initial,
                0.,
                0.,
            ];
            let initial = augmented(seed);
            append(&mut self.last, 0., &initial);
            self.flight = Some(self.integrator(seed, end, false));
        }
        let mut flight = self.flight.take().unwrap();
        for _ in 0..budget {
            let dense = match flight.step() {
                Ok(x) => x,
                Err(_) => return self.finish_trajectory(&flight, 4),
            };
            let (terminal, reason, final_state) = self.boundary(&dense);
            let direction = flight.end.signum();
            while self.sample_index as f64 * 0.0125 <= terminal.abs() + 1e-12 {
                let t = direction * self.sample_index as f64 * 0.0125;
                let s = dense.eval((t - dense.t) / dense.h);
                self.drift = self
                    .drift
                    .max((jacobi(self.options.mu, &s) - self.c_initial).abs());
                append(&mut self.last, t, &s);
                self.sample_index += 1;
            }
            if dense.start[1] * dense.end[1] < 0. && dense.t.abs() > 1e-8 {
                let (t, s) = dense.root(|s| s[1]);
                if s[3] > 1e-10 && t.abs() <= terminal.abs() + 1e-12 {
                    append(&mut self.sections, t, &s);
                }
            }
            self.drift = self
                .drift
                .max((jacobi(self.options.mu, &final_state) - self.c_initial).abs());
            if reason > 0 || flight.finished() {
                let prev = self.last[self.last.len() - 5];
                if (prev - terminal).abs() > 1e-10 {
                    append(&mut self.last, terminal, &final_state);
                }
                return self.finish_trajectory(&flight, reason);
            }
        }
        self.flight = Some(flight);
        0
    }
    fn boundary(&self, d: &Dense) -> (f64, usize, Augmented) {
        let mut result = (d.t + d.h, 0, d.end);
        let o = &self.options;
        for code in 1..=3 {
            let value = |s: &Augmented| match code {
                1 => ((s[0] + o.mu).powi(2) + s[1] * s[1]).sqrt() - o.guard1,
                2 => ((s[0] - 1. + o.mu).powi(2) + s[1] * s[1]).sqrt() - o.guard2,
                _ => 4. - (s[0] * s[0] + s[1] * s[1]).sqrt(),
            };
            if value(&d.start) > 0. && value(&d.end) <= 0. {
                let (t, s) = d.root(value);
                if t.abs() < result.0.abs() {
                    result = (t, code, s);
                }
            }
        }
        result
    }
}

/// Offline/reference endpoint uses the identical browser solver, not a second implementation.
pub fn trace(mu: f64, initial: State, horizon: f64, rtol: f64) -> Result<Vec<f64>, String> {
    if !mu.is_finite()
        || !(0.0..=0.5).contains(&mu)
        || !horizon.is_finite()
        || horizon.abs() > 100.
        || horizon == 0.
        || !(1e-14..=1e-6).contains(&rtol)
        || initial.iter().any(|x| !x.is_finite())
    {
        return Err("Invalid reference trace input".into());
    }
    let mut f = Integrator::new(mu, augmented(initial), horizon, rtol, rtol * 0.01, true);
    let mut data = vec![];
    append(&mut data, 0., &f.y);
    let mut index = 1;
    while !f.finished() {
        let dense = f.step()?;
        while index <= 1000 {
            let t = horizon * index as f64 / 1000.;
            if t.abs() > f.t.abs() + 1e-13 {
                break;
            }
            append(&mut data, t, &dense.eval((t - dense.t) / dense.h));
            index += 1;
        }
    }
    data.extend_from_slice(&f.y[4..]);
    Ok(data)
}
