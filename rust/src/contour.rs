//! Display-only adaptive zero-velocity contours. Endpoints solve 2 Omega-C=0
//! by bisection; straight chords between them remain a spatial approximation.
use crate::model::{lagrange, potential};

pub fn segments(mu: f64, c: f64) -> Vec<f64> {
    let mut critical: Vec<[f64; 2]> = lagrange(mu).iter().map(|p| [p[0], p[1]]).collect();
    critical.extend([[-mu, 0.], [1. - mu, 0.]]);
    let mut output = Vec::new();
    cell(mu, c, -1.5, -1.5, 4., 3., 0, &critical, &mut output);
    output
}

#[allow(clippy::too_many_arguments)]
fn cell(
    mu: f64,
    c: f64,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    depth: u32,
    critical: &[[f64; 2]],
    output: &mut Vec<f64>,
) {
    let p = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x + w / 2., y + h / 2.],
    ];
    let f = p.map(|p| 2. * potential(mu, p[0], p[1]) - c);
    let crossing = f.iter().any(|v| *v < 0.) && f.iter().any(|v| *v >= 0.);
    let near = critical
        .iter()
        .any(|p| p[0] >= x - w && p[0] <= x + 2. * w && p[1] >= y - h && p[1] <= y + 2. * h);
    let fine = (mu / 3.).cbrt() * 0.004;
    if depth < 5 || depth < 18 && ((crossing && w > 0.003) || (near && w > fine)) {
        for (dx, dy) in [(0., 0.), (0.5, 0.), (0., 0.5), (0.5, 0.5)] {
            cell(
                mu,
                c,
                x + dx * w,
                y + dy * h,
                w / 2.,
                h / 2.,
                depth + 1,
                critical,
                output,
            );
        }
        return;
    }
    if !crossing {
        return;
    }
    for i in 0..4 {
        let triangle = [i, (i + 1) % 4, 4];
        let mut endpoints = Vec::new();
        for j in 0..3 {
            let a = triangle[j];
            let b = triangle[(j + 1) % 3];
            if (f[a] < 0.) == (f[b] < 0.) {
                continue;
            }
            let mut lo = p[a];
            let mut hi = p[b];
            let sign = f[a] < 0.;
            for _ in 0..42 {
                let mid = [(lo[0] + hi[0]) / 2., (lo[1] + hi[1]) / 2.];
                if (2. * potential(mu, mid[0], mid[1]) - c < 0.) == sign {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            endpoints.push([(lo[0] + hi[0]) / 2., (lo[1] + hi[1]) / 2.]);
        }
        if endpoints.len() == 2 {
            for p in endpoints {
                output.extend(p);
            }
        }
    }
}
