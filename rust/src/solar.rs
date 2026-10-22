//! JPL approximate planetary elements, Table 1 (1800–2050).
//! Original Kepler solver; heliocentric J2000 ecliptic, AU and radians.
//! Earth entry is the Earth–Moon barycentre, not a lunar-resolved ephemeris.
const ELEMENTS: [[f64; 12]; 8] = [
    [
        0.38709927,
        0.20563593,
        7.00497902,
        252.25032350,
        77.45779628,
        48.33076593,
        0.00000037,
        0.00001906,
        -0.00594749,
        149472.67411175,
        0.16047689,
        -0.12534081,
    ],
    [
        0.72333566,
        0.00677672,
        3.39467605,
        181.97909950,
        131.60246718,
        76.67984255,
        0.00000390,
        -0.00004107,
        -0.00078890,
        58517.81538729,
        0.00268329,
        -0.27769418,
    ],
    [
        1.00000261,
        0.01671123,
        -0.00001531,
        100.46457166,
        102.93768193,
        0.,
        0.00000562,
        -0.00004392,
        -0.01294668,
        35999.37244981,
        0.32327364,
        0.,
    ],
    [
        1.52371034,
        0.09339410,
        1.84969142,
        -4.55343205,
        -23.94362959,
        49.55953891,
        0.00001847,
        0.00007882,
        -0.00813131,
        19140.30268499,
        0.44441088,
        -0.29257343,
    ],
    [
        5.20288700,
        0.04838624,
        1.30439695,
        34.39644051,
        14.72847983,
        100.47390909,
        -0.00011607,
        -0.00013253,
        -0.00183714,
        3034.74612775,
        0.21252668,
        0.20469106,
    ],
    [
        9.53667594,
        0.05386179,
        2.48599187,
        49.95424423,
        92.59887831,
        113.66242448,
        -0.00125060,
        -0.00050991,
        0.00193609,
        1222.49362201,
        -0.41897216,
        -0.28867794,
    ],
    [
        19.18916464,
        0.04725744,
        0.77263783,
        313.23810451,
        170.95427630,
        74.01692503,
        -0.00196176,
        -0.00004397,
        -0.00242939,
        428.48202785,
        0.40805281,
        0.04240589,
    ],
    [
        30.06992276,
        0.00859048,
        1.77004347,
        -55.12002969,
        44.96476227,
        131.78422574,
        0.00026291,
        0.00005105,
        0.00035372,
        218.45945325,
        -0.32241464,
        -0.00508664,
    ],
];

fn orbit(index: usize, jd: f64, anomaly: Option<f64>) -> [f64; 3] {
    let centuries = (jd - 2451545.) / 36525.;
    let row = ELEMENTS[index];
    let el: [f64; 6] = std::array::from_fn(|i| row[i] + centuries * row[i + 6]);
    let [a, e, inc, longitude, peri, node] = el;
    let mean = anomaly.unwrap_or((longitude - peri).to_radians());
    let mean =
        (mean + std::f64::consts::PI).rem_euclid(std::f64::consts::TAU) - std::f64::consts::PI;
    let mut eccentric = mean;
    for _ in 0..16 {
        let d = (eccentric - e * eccentric.sin() - mean) / (1. - e * eccentric.cos());
        eccentric -= d;
        if d.abs() < 1e-14 {
            break;
        }
    }
    let x = a * (eccentric.cos() - e);
    let y = a * (1. - e * e).sqrt() * eccentric.sin();
    let (so, co) = node.to_radians().sin_cos();
    let (sw, cw) = (peri - node).to_radians().sin_cos();
    let (si, ci) = inc.to_radians().sin_cos();
    [
        (cw * co - sw * so * ci) * x + (-sw * co - cw * so * ci) * y,
        (cw * so + sw * co * ci) * x + (-sw * so + cw * co * ci) * y,
        sw * si * x + cw * si * y,
    ]
}

pub fn positions(jd: f64) -> Vec<f64> {
    (0..8).flat_map(|i| orbit(i, jd, None)).collect()
}

pub fn path(index: usize, jd: f64, count: usize) -> Vec<f64> {
    (0..=count)
        .flat_map(|i| {
            orbit(
                index,
                jd,
                Some(i as f64 / count as f64 * std::f64::consts::TAU),
            )
        })
        .collect()
}
