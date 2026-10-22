//! Gateway's small raw WASM ABI. A worker owns one instance.
//! Rust retains buffers until the next mutating call. JS must copy outputs
//! before another call or memory growth; pointers are never held by the UI.
pub mod contour;
pub mod engine;
pub mod integrator;
pub mod model;
pub mod solar;

use engine::{Job, Options};
use std::cell::RefCell;
thread_local! {
    static JOB:RefCell<Option<Job>>=const{RefCell::new(None)};
    static POINTS:RefCell<Vec<f64>>=const{RefCell::new(Vec::new())};
    static SCRATCH:RefCell<Vec<f64>>=const{RefCell::new(Vec::new())};
    static ERROR:RefCell<String>=const{RefCell::new(String::new())};
}

#[no_mangle]
pub extern "C" fn gw_abi() -> u32 {
    1
}
#[no_mangle]
pub extern "C" fn gw_setup(mu: f64) -> u32 {
    if !mu.is_finite() || !(1e-7..=0.5).contains(&mu) {
        return 0;
    }
    POINTS.with(|p| *p.borrow_mut() = model::lagrange(mu).into_iter().flatten().collect());
    1
}
#[no_mangle]
pub extern "C" fn gw_points_ptr() -> *const f64 {
    POINTS.with(|p| p.borrow().as_ptr())
}
#[no_mangle]
pub extern "C" fn gw_begin(
    mu: f64,
    point: u32,
    offset: f64,
    horizon: f64,
    phases: u32,
    epsilon: f64,
    rtol: f64,
    guard1: f64,
    guard2: f64,
    ensemble: u32,
    seed: u32,
    x: f64,
    y: f64,
    angle: f64,
    spread: f64,
) -> u32 {
    let options = Options {
        mu,
        point: point as usize,
        offset,
        horizon,
        phases: phases as usize,
        epsilon,
        rtol,
        atol: rtol * 0.01,
        guard1,
        guard2,
        ensemble: ensemble as usize,
        seed,
        x,
        y,
        angle,
        spread,
    };
    match Job::new(options) {
        Ok(job) => {
            JOB.with(|j| *j.borrow_mut() = Some(job));
            ERROR.with(|e| e.borrow_mut().clear());
            1
        }
        Err(message) => {
            ERROR.with(|e| *e.borrow_mut() = message);
            0
        }
    }
}
#[no_mangle]
pub extern "C" fn gw_step(budget: u32) -> u32 {
    JOB.with(|j| match j.borrow_mut().as_mut() {
        Some(job) => job.step((budget as usize).clamp(1, 512)),
        None => 3,
    })
}
#[no_mangle]
pub extern "C" fn gw_meta_ptr() -> *const f64 {
    JOB.with(|j| {
        j.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |j| j.meta.as_ptr())
    })
}
#[no_mangle]
pub extern "C" fn gw_orbit_ptr() -> *const f64 {
    JOB.with(|j| {
        j.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |j| j.orbit.as_ptr())
    })
}
#[no_mangle]
pub extern "C" fn gw_orbit_len() -> usize {
    JOB.with(|j| j.borrow().as_ref().map_or(0, |j| j.orbit.len()))
}
#[no_mangle]
pub extern "C" fn gw_path_ptr() -> *const f64 {
    JOB.with(|j| {
        j.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |j| j.last.as_ptr())
    })
}
#[no_mangle]
pub extern "C" fn gw_path_len() -> usize {
    JOB.with(|j| j.borrow().as_ref().map_or(0, |j| j.last.len()))
}
#[no_mangle]
pub extern "C" fn gw_section_ptr() -> *const f64 {
    JOB.with(|j| {
        j.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |j| j.sections.as_ptr())
    })
}
#[no_mangle]
pub extern "C" fn gw_section_len() -> usize {
    JOB.with(|j| j.borrow().as_ref().map_or(0, |j| j.sections.len()))
}
#[no_mangle]
pub extern "C" fn gw_descriptor_ptr() -> *const f64 {
    JOB.with(|j| {
        j.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |j| j.descriptor.as_ptr())
    })
}
#[no_mangle]
pub extern "C" fn gw_matrix_ptr() -> *const f64 {
    JOB.with(|j| {
        j.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |j| j.monodromy.as_ptr())
    })
}
#[no_mangle]
pub extern "C" fn gw_error_ptr() -> *const u8 {
    JOB.with(|j| {
        if let Some(job) = j.borrow().as_ref() {
            if !job.error.is_empty() {
                return job.error.as_ptr();
            }
            std::ptr::null()
        } else {
            std::ptr::null()
        }
    })
}
#[no_mangle]
pub extern "C" fn gw_error_len() -> usize {
    JOB.with(|j| j.borrow().as_ref().map_or(0, |j| j.error.len()))
}
#[no_mangle]
pub extern "C" fn gw_input_error_ptr() -> *const u8 {
    ERROR.with(|e| e.borrow().as_ptr())
}
#[no_mangle]
pub extern "C" fn gw_input_error_len() -> usize {
    ERROR.with(|e| e.borrow().len())
}
#[no_mangle]
pub extern "C" fn gw_evaluate(mu: f64, x: f64, y: f64, vx: f64, vy: f64) -> *const f64 {
    SCRATCH.with(|v| {
        let s = model::augmented([x, y, vx, vy]);
        let f = model::rhs(mu, &s, false);
        let mut out = vec![model::jacobi(mu, &s), model::potential(mu, x, y)];
        out.extend_from_slice(&f[..4]);
        out.extend_from_slice(&model::derivatives(mu, x, y));
        *v.borrow_mut() = out;
        v.borrow().as_ptr()
    })
}
#[no_mangle]
pub extern "C" fn gw_field(
    mu: f64,
    c: f64,
    x0: f64,
    y0: f64,
    width: f64,
    height: f64,
    nx: u32,
    ny: u32,
) -> usize {
    if nx < 2 || ny < 2 || nx > 1024 || ny > 1024 {
        return 0;
    }
    SCRATCH.with(|v| {
        let mut out = Vec::with_capacity(nx as usize * ny as usize);
        for j in 0..ny {
            for i in 0..nx {
                let x = x0 + width * i as f64 / (nx - 1) as f64;
                let y = y0 + height * j as f64 / (ny - 1) as f64;
                out.push(2. * model::potential(mu, x, y) - c);
            }
        }
        let n = out.len();
        *v.borrow_mut() = out;
        n
    })
}
#[no_mangle]
pub extern "C" fn gw_trace(
    mu: f64,
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
    horizon: f64,
    rtol: f64,
) -> usize {
    match engine::trace(mu, [x, y, vx, vy], horizon, rtol) {
        Ok(data) => SCRATCH.with(|v| {
            let n = data.len();
            *v.borrow_mut() = data;
            n
        }),
        Err(e) => {
            ERROR.with(|error| *error.borrow_mut() = e);
            0
        }
    }
}
#[no_mangle]
pub extern "C" fn gw_scratch_ptr() -> *const f64 {
    SCRATCH.with(|v| v.borrow().as_ptr())
}
#[no_mangle]
pub extern "C" fn gw_contours(mu: f64, c: f64) -> usize {
    if !(1e-7..=0.5).contains(&mu) || !c.is_finite() {
        return 0;
    }
    SCRATCH.with(|v| {
        let data = contour::segments(mu, c);
        let n = data.len();
        *v.borrow_mut() = data;
        n
    })
}
#[no_mangle]
pub extern "C" fn gw_solar(jd: f64) -> usize {
    if !jd.is_finite() || !(2378496.5..=2469807.5).contains(&jd) {
        return 0;
    }
    SCRATCH.with(|v| {
        *v.borrow_mut() = solar::positions(jd);
        24
    })
}
#[no_mangle]
pub extern "C" fn gw_solar_path(index: u32, jd: f64, count: u32) -> usize {
    if index > 7 || !(32..=2048).contains(&count) || !jd.is_finite() {
        return 0;
    }
    SCRATCH.with(|v| {
        let data = solar::path(index as usize, jd, count as usize);
        let n = data.len();
        *v.borrow_mut() = data;
        n
    })
}
