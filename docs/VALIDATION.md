# Verification and measured limits

Recorded on 22 October 2026. Reports contain actual runs of the compiled WASM module. They are not target numbers or fabricated fixtures.

## Independent numerical reference

`npm run verify` exports the actual WASM samples. `reference/validate.py` implements independent equations and variational dynamics in NumPy and integrates them with SciPy DOP853 (rtol 3e-14, atol 2e-15, maximum step 0.01 TU). It imports no application dynamics code.

The four cases use 8 phases, horizon 5 TU, ε=1e-6, engine rtol=1e-11, Earth–Moon ΔC=.006 and Sun–Jupiter ΔC=.001. Comparisons use common stored timestamps. Short manifold comparisons use the first eight paths and |t|≤0.5 TU; they do not certify long chaotic arcs.

| Fixture | One-period max state difference | Closure infinity norm | Relative STM difference |
|---|---:|---:|---:|
| Earth–Moon L₁ | 5.48e-12 | 7.62e-13 | 2.56e-11 |
| Earth–Moon L₂ | 1.65e-12 | 9.80e-13 | 1.69e-11 |
| Sun–Jupiter L₁ | 2.13e-12 | 3.05e-11 | 2.73e-11 |
| Sun–Jupiter L₂ | 1.18e-12 | 7.23e-13 | 2.22e-11 |

Maximum short-manifold state difference is 3.78e-13; maximum section y residual is 3.32e-14. Canonical symplectic defects are 1.30e-9 to 2.39e-9. Independently computed reciprocal-pair defects are below 9.70e-10.

On the declared 2-TU ordinary trace, tightening rtol from 1e-8 to 1e-10 to 1e-12 reduces max state error against DOP853 from 1.79e-8 to 1.71e-10 to 1.57e-12. [Raw reference report](validation.json).

## Automated checks

The 13 Node/WASM tests cover equilibrium force residuals, reference L coordinates, Hessian finite differences, the analytic μ=0 rotating circular-orbit limit, STM finite differences, backward reversibility, tolerance refinement, four periodic-orbit fixtures, independently estimated stability diagnostics, local manifold contraction, phase/ε refinement, deterministic fixed-C ensembles, all eight Sun–planet scales, contour endpoint residuals, invalid resources, forbidden origins, physical-surface events and Solar System path closure.

Two native Rust tests additionally check equilibrium coordinates and the invariant derivative. The native and WASM test suites both pass locally.

Four browser checks exercise the actual production build under `/gateway/`: navigation through Solar System and Jupiter, energy/family recomputation and sections, export/local notebook, sensitivity scenarios and malformed import, cancellation followed by successful recomputation, phone focus/import, and a separate rendering measurement. Actual screenshots in `docs/screenshots/` are captured by these journeys.

CI repeats native/WASM checks, regenerates reference inputs, runs independent SciPy comparisons, builds the app and runs production browser tests. Reports from each CI run are uploaded as artifacts. This document records the local run; CI status should be read from the actual workflow run.

## Compute measurement

[Raw 20-run compute report](compute-benchmark.json): Node 24.19.0, Windows 11, AMD Ryzen 7 5800X; three warm-up runs; Earth–Moon L₁, 64 phases, 256 branches and horizon 8 TU.

Median **231.45 ms**, p95 **244.60 ms**. The run contains 388,636 accepted steps, 42 rejected steps, 2,720,746 RHS evaluations and 162,196 stored samples. Maximum branch Jacobi drift is 1.19e-10.

This measures WASM computation plus owned output copying in Node. It excludes contours, worker scheduling, React and rendering. UI wall time includes those worker-side tasks and varies with the browser. These figures are observations on one machine.

## Rendering measurement

[Raw browser rendering report](render-benchmark.json): Microsoft Edge 155, Windows, 1440×900 viewport, Sun–Jupiter default 64 phases and horizon 8, paused after geometry upload, 180 observed frames. Automated QA explicitly uses **SwiftShader software WebGL**.

Measured frame interval median **69.4 ms**, p95 **76.4 ms**. CPU render submission median **0.4 ms**, p95 **0.5 ms**. Submission time is not GPU completion time. The software-rendered run does not meet a 60 fps goal and is not a hardware-GPU benchmark. Hardware GPU and physical-phone performance remain unmeasured; a responsive phone viewport is not evidence of physical-device performance.

## Limits of this release

- Small, supported L₁/L₂ planar Lyapunov windows; extreme energy settings can fail continuation or stability gates with an explicit error.
- Scientific comparisons concentrate on Earth–Moon and Sun–Jupiter. The other seven Sun–planet presets pass scale, closure, residual and finite-output regressions; they do not each have an independent ephemeris/manifold reference study.
- There is no force regularisation. Endpoint-bracketed events can miss tangencies or multiple crossings within one step.
- Dense output and finite phase/ε sampling introduce errors distinct from integrator local error.
- Finite-time manifold contraction and sampling refinement are evidence, not a proof of exact nonlinear invariance.
- Default recipes are validated examples, not mission-design recommendations. Long chaotic trajectories may diverge while preserving energy accurately.
- No claim of full Solar System N-body accuracy, halo orbits, FTLEs, permanent capture or optimised transfers.

Original design proposals remain local historical records. Passing the checks above does not imply every proposed stretch target or hardware performance target has been achieved.
