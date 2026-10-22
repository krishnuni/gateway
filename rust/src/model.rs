//! Barycentric rotating PCR3BP. State order: x, y, vx, vy.
pub type State = [f64; 4];
pub type Matrix = [[f64; 4]; 4];
pub type Augmented = [f64; 20];

pub fn potential(mu: f64, x: f64, y: f64) -> f64 {
    0.5 * (x * x + y * y)
        + (1.0 - mu) / ((x + mu).powi(2) + y * y).sqrt()
        + mu / ((x - 1.0 + mu).powi(2) + y * y).sqrt()
}

pub fn jacobi(mu: f64, s: &[f64]) -> f64 {
    2.0 * potential(mu, s[0], s[1]) - s[2] * s[2] - s[3] * s[3]
}

pub fn derivatives(mu: f64, x: f64, y: f64) -> [f64; 5] {
    let mut out = [x, y, 1.0, 1.0, 0.0];
    for (weight, dx) in [(1.0 - mu, x + mu), (mu, x - 1.0 + mu)] {
        let r2 = dx * dx + y * y;
        let r3 = r2 * r2.sqrt();
        let r5 = r3 * r2;
        out[0] -= weight * dx / r3;
        out[1] -= weight * y / r3;
        out[2] += weight * (3.0 * dx * dx / r5 - 1.0 / r3);
        out[3] += weight * (3.0 * y * y / r5 - 1.0 / r3);
        out[4] += 3.0 * weight * dx * y / r5;
    }
    out
}

pub fn augmented(s: State) -> Augmented {
    let mut result = [0.0; 20];
    result[..4].copy_from_slice(&s);
    for i in 0..4 {
        result[4 + i * 4 + i] = 1.0;
    }
    result
}

pub fn rhs(mu: f64, s: &Augmented, variational: bool) -> Augmented {
    let [ox, oy, xx, yy, xy] = derivatives(mu, s[0], s[1]);
    let mut out = [0.0; 20];
    out[..4].copy_from_slice(&[s[2], s[3], 2.0 * s[3] + ox, -2.0 * s[2] + oy]);
    if variational {
        let a = [
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
            [xx, xy, 0.0, 2.0],
            [xy, yy, -2.0, 0.0],
        ];
        for i in 0..4 {
            for j in 0..4 {
                out[4 + i * 4 + j] = (0..4).map(|k| a[i][k] * s[4 + k * 4 + j]).sum();
            }
        }
    }
    out
}

pub fn lagrange(mu: f64) -> [[f64; 3]; 5] {
    let root = |mut a: f64, mut b: f64| {
        let mut fa = derivatives(mu, a, 0.0)[0];
        for _ in 0..110 {
            let m = (a + b) * 0.5;
            let fm = derivatives(mu, m, 0.0)[0];
            if (b - a).abs() < 2e-15 {
                return m;
            }
            if fm.signum() == fa.signum() {
                a = m;
                fa = fm;
            } else {
                b = m;
            }
        }
        (a + b) * 0.5
    };
    let mut points = [[0.0; 3]; 5];
    for (i, (a, b)) in [
        (-mu + 1e-10, 1.0 - mu - 1e-10),
        (1.0 - mu + 1e-10, 4.0),
        (-4.0, -mu - 1e-10),
    ]
    .into_iter()
    .enumerate()
    {
        let x = root(a, b);
        points[i] = [x, 0.0, 2.0 * potential(mu, x, 0.0)];
    }
    for (i, sign) in [(3, 1.0), (4, -1.0)] {
        let x = 0.5 - mu;
        let y = sign * 3.0_f64.sqrt() * 0.5;
        points[i] = [x, y, 2.0 * potential(mu, x, y)];
    }
    points
}

pub fn matrix(s: &Augmented) -> Matrix {
    let mut m = [[0.0; 4]; 4];
    for i in 0..4 {
        for j in 0..4 {
            m[i][j] = s[4 + i * 4 + j];
        }
    }
    m
}

pub fn mat_vec(m: &Matrix, v: State) -> State {
    std::array::from_fn(|i| (0..4).map(|j| m[i][j] * v[j]).sum())
}

pub fn multiply(a: &Matrix, b: &Matrix) -> Matrix {
    std::array::from_fn(|i| std::array::from_fn(|j| (0..4).map(|k| a[i][k] * b[k][j]).sum()))
}

pub fn inverse(m: &Matrix) -> Result<Matrix, String> {
    let mut a = [[0.0; 8]; 4];
    for i in 0..4 {
        for j in 0..4 {
            a[i][j] = m[i][j];
        }
        a[i][4 + i] = 1.0;
    }
    for j in 0..4 {
        let p = (j..4)
            .max_by(|&a_i, &b_i| a[a_i][j].abs().total_cmp(&a[b_i][j].abs()))
            .unwrap();
        if a[p][j].abs() < 1e-14 {
            return Err("Singular monodromy matrix".into());
        }
        a.swap(j, p);
        let pivot = a[j][j];
        for k in 0..8 {
            a[j][k] /= pivot;
        }
        for i in 0..4 {
            if i != j {
                let v = a[i][j];
                for k in 0..8 {
                    a[i][k] -= v * a[j][k];
                }
            }
        }
    }
    Ok(std::array::from_fn(|i| {
        std::array::from_fn(|j| a[i][j + 4])
    }))
}

pub fn determinant(m: &Matrix) -> f64 {
    let mut a = *m;
    let mut det = 1.0;
    for j in 0..4 {
        let p = (j..4)
            .max_by(|&i, &k| a[i][j].abs().total_cmp(&a[k][j].abs()))
            .unwrap();
        if a[p][j].abs() < 1e-18 {
            return 0.0;
        }
        if p != j {
            a.swap(p, j);
            det = -det;
        }
        let pivot = a[j][j];
        det *= pivot;
        for i in j + 1..4 {
            let factor = a[i][j] / pivot;
            for k in j + 1..4 {
                a[i][k] -= factor * a[j][k];
            }
        }
    }
    det
}

/// Independent power/inverse-power estimates of the separated real pair.
/// Their reciprocity is measured, never imposed. Degenerate pairs are rejected.
pub fn hyperbolic_pair(m: &Matrix) -> Result<[(f64, State, f64); 2], String> {
    let inv = inverse(m)?;
    let eig = |operator: &Matrix| {
        let mut v = [0.37, 0.51, 0.23, 0.73];
        for _ in 0..160 {
            let mut w = mat_vec(operator, v);
            let norm = w.iter().map(|x| x * x).sum::<f64>().sqrt();
            if !norm.is_finite() || norm < 1e-30 {
                break;
            }
            for x in &mut w {
                *x /= norm;
            }
            if (0..4).map(|i| w[i] * v[i]).sum::<f64>() < 0.0 {
                for x in &mut w {
                    *x = -*x;
                }
            }
            let error = (0..4).map(|i| (w[i] - v[i]).abs()).fold(0.0, f64::max);
            v = w;
            if error < 2e-15 {
                break;
            }
        }
        let w = mat_vec(m, v);
        let lambda = (0..4).map(|i| w[i] * v[i]).sum::<f64>();
        let mn = m.iter().flatten().map(|x| x * x).sum::<f64>().sqrt();
        let residual = (0..4)
            .map(|i| (w[i] - lambda * v[i]).powi(2))
            .sum::<f64>()
            .sqrt()
            / (mn + lambda.abs());
        (lambda, v, residual)
    };
    let u = eig(m);
    let s = eig(&inv);
    if u.0.abs() < 1.02 || s.0.abs() > 0.98 || u.2 > 1e-8 || s.2 > 1e-8 {
        return Err("No numerically resolved hyperbolic pair at this energy".into());
    }
    Ok([s, u])
}

pub fn symplectic_defect(m: &Matrix) -> f64 {
    let b = [
        [1., 0., 0., 0.],
        [0., 1., 0., 0.],
        [0., -1., 1., 0.],
        [1., 0., 0., 1.],
    ];
    let bi = [
        [1., 0., 0., 0.],
        [0., 1., 0., 0.],
        [0., 1., 1., 0.],
        [-1., 0., 0., 1.],
    ];
    let j = [
        [0., 0., 1., 0.],
        [0., 0., 0., 1.],
        [-1., 0., 0., 0.],
        [0., -1., 0., 0.],
    ];
    let canonical = multiply(&multiply(&b, m), &bi);
    let transpose = std::array::from_fn(|i| std::array::from_fn(|k| canonical[k][i]));
    let test = multiply(&multiply(&transpose, &j), &canonical);
    (0..4)
        .flat_map(|i| (0..4).map(move |k| (test[i][k] - j[i][k]).powi(2)))
        .sum::<f64>()
        .sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn earth_moon_points() {
        let p = lagrange(0.01215058560962404);
        assert!((p[0][0] - 0.8369151257723572).abs() < 1e-12);
        assert!((p[1][0] - 1.155682165444884).abs() < 1e-12);
    }
    #[test]
    fn jacobi_gradient_annihilates_flow() {
        let mu = 0.01215058560962404;
        let s = augmented([0.7, 0.1, 0.2, -0.3]);
        let d = derivatives(mu, s[0], s[1]);
        let f = rhs(mu, &s, false);
        assert!(
            (2.0 * d[0] * f[0] + 2.0 * d[1] * f[1] - 2.0 * s[2] * f[2] - 2.0 * s[3] * f[3]).abs()
                < 1e-14
        );
    }
}
