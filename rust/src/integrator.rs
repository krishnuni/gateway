//! Original adaptive DP5(4) implementation with the published Shampine
//! quartic continuous extension. Coefficients are numerical method data,
//! references are documented in docs/NUMERICS.md.
use crate::model::{rhs, Augmented};

const A: [[f64; 7]; 7] = [
    [0.; 7],
    [1. / 5., 0., 0., 0., 0., 0., 0.],
    [3. / 40., 9. / 40., 0., 0., 0., 0., 0.],
    [44. / 45., -56. / 15., 32. / 9., 0., 0., 0., 0.],
    [
        19372. / 6561.,
        -25360. / 2187.,
        64448. / 6561.,
        -212. / 729.,
        0.,
        0.,
        0.,
    ],
    [
        9017. / 3168.,
        -355. / 33.,
        46732. / 5247.,
        49. / 176.,
        -5103. / 18656.,
        0.,
        0.,
    ],
    [
        35. / 384.,
        0.,
        500. / 1113.,
        125. / 192.,
        -2187. / 6784.,
        11. / 84.,
        0.,
    ],
];
const E: [f64; 7] = [
    -71. / 57600.,
    0.,
    71. / 16695.,
    -71. / 1920.,
    17253. / 339200.,
    -22. / 525.,
    1. / 40.,
];
const P: [[f64; 4]; 7] = [
    [
        1.,
        -8048581381. / 2820520608.,
        8663915743. / 2820520608.,
        -12715105075. / 11282082432.,
    ],
    [0.; 4],
    [
        0.,
        131558114200. / 32700410799.,
        -68118460800. / 10900136933.,
        87487479700. / 32700410799.,
    ],
    [
        0.,
        -1754552775. / 470086768.,
        14199869525. / 1410260304.,
        -10690763975. / 1880347072.,
    ],
    [
        0.,
        127303824393. / 49829197408.,
        -318862633887. / 49829197408.,
        701980252875. / 199316789632.,
    ],
    [
        0.,
        -282668133. / 205662961.,
        2019193451. / 616988883.,
        -1453857185. / 822651844.,
    ],
    [
        0.,
        40617522. / 29380423.,
        -110615467. / 29380423.,
        69997945. / 29380423.,
    ],
];

pub struct Dense {
    pub t: f64,
    pub h: f64,
    pub start: Augmented,
    pub end: Augmented,
    pub q: [[f64; 4]; 20],
}

impl Dense {
    pub fn eval(&self, theta: f64) -> Augmented {
        let z = theta.clamp(0.0, 1.0);
        std::array::from_fn(|i| {
            self.start[i]
                + self.h
                    * z
                    * (self.q[i][0] + z * (self.q[i][1] + z * (self.q[i][2] + z * self.q[i][3])))
        })
    }
    pub fn root(&self, function: impl Fn(&Augmented) -> f64) -> (f64, Augmented) {
        let mut lo = 0.0;
        let mut hi = 1.0;
        let mut fl = function(&self.start);
        for _ in 0..52 {
            let middle = (lo + hi) * 0.5;
            let fm = function(&self.eval(middle));
            if fm.signum() == fl.signum() {
                lo = middle;
                fl = fm;
            } else {
                hi = middle;
            }
            if (hi - lo) * self.h.abs() < 1e-13 {
                break;
            }
        }
        let z = (lo + hi) * 0.5;
        (self.t + z * self.h, self.eval(z))
    }
}

pub struct Integrator {
    pub mu: f64,
    pub y: Augmented,
    pub t: f64,
    pub end: f64,
    pub h: f64,
    pub rtol: f64,
    pub atol: f64,
    pub variational: bool,
    pub accepted: u64,
    pub rejected: u64,
    pub evaluations: u64,
}

impl Integrator {
    pub fn new(mu: f64, y: Augmented, end: f64, rtol: f64, atol: f64, variational: bool) -> Self {
        Self {
            mu,
            y,
            t: 0.,
            end,
            h: 0.001 * end.signum(),
            rtol,
            atol,
            variational,
            accepted: 0,
            rejected: 0,
            evaluations: 0,
        }
    }
    pub fn finished(&self) -> bool {
        (self.end - self.t).abs() < 2e-13
    }
    pub fn step(&mut self) -> Result<Dense, String> {
        let direction = self.end.signum();
        let speed = (self.y[2] * self.y[2] + self.y[3] * self.y[3])
            .sqrt()
            .max(1e-8);
        let distance = ((self.y[0] + self.mu).powi(2) + self.y[1].powi(2))
            .sqrt()
            .min(((self.y[0] - 1. + self.mu).powi(2) + self.y[1].powi(2)).sqrt());
        let ceiling = 0.02_f64.min(0.15 * distance / speed);
        for _ in 0..35 {
            let h = self.h.abs().min(ceiling).min((self.end - self.t).abs()) * direction;
            if h.abs() < 1e-13 || self.accepted > 500_000 {
                return Err("Integration work or minimum-step limit reached".into());
            }
            let mut k = [[0.; 20]; 7];
            k[0] = rhs(self.mu, &self.y, self.variational);
            let mut next = self.y;
            for stage in 1..7 {
                let mut intermediate = self.y;
                for i in 0..20 {
                    intermediate[i] += h * (0..stage).map(|j| A[stage][j] * k[j][i]).sum::<f64>();
                }
                k[stage] = rhs(self.mu, &intermediate, self.variational);
                if stage == 6 {
                    next = intermediate;
                }
            }
            self.evaluations += 7;
            let mut state_error = 0.;
            let mut stm_error = 0.;
            let n = if self.variational { 20 } else { 4 };
            for i in 0..n {
                let error = h * (0..7).map(|j| E[j] * k[j][i]).sum::<f64>();
                let scale = self.atol + self.rtol * self.y[i].abs().max(next[i].abs());
                let ratio = error / scale;
                if i < 4 {
                    state_error += ratio * ratio;
                } else {
                    stm_error += ratio * ratio;
                }
            }
            let error = (state_error / 4.).sqrt().max(if self.variational {
                (stm_error / 16.).sqrt()
            } else {
                0.
            });
            if !error.is_finite() || next[..n].iter().any(|x| !x.is_finite()) {
                self.rejected += 1;
                self.h = h * 0.2;
                continue;
            }
            let factor = if error < 1e-20 {
                5.
            } else {
                (0.88 * error.powf(-0.2)).clamp(0.15, 5.)
            };
            self.h = h * factor;
            if error <= 1. {
                let mut q = [[0.; 4]; 20];
                for i in 0..n {
                    for power in 0..4 {
                        q[i][power] = (0..7).map(|stage| k[stage][i] * P[stage][power]).sum();
                    }
                }
                let dense = Dense {
                    t: self.t,
                    h,
                    start: self.y,
                    end: next,
                    q,
                };
                self.t += h;
                self.y = next;
                self.accepted += 1;
                return Ok(dense);
            }
            self.rejected += 1;
        }
        Err("Step repeatedly rejected; reduce the horizon or avoid the primary".into())
    }
}
