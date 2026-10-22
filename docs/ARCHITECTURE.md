# Architecture and decisions

## Scientific authority

Rust owns equations, analytic derivatives, integration, event roots, orbit correction, variational propagation, monodromy diagnostics, manifold seeding and fitted planetary motion. It has no external crate dependencies. The same compiled WASM module is exercised in Node tests and the browser.

The raw ABI exposes bounded calls and owned numeric buffers. A worker owns a mutable instance. Callers copy outputs before any later mutating call or memory growth. The scene owns a separate instance for read-only field/planet calculations; it never advances the worker's job.

## Responsive computation

The job is a resumable state machine: correct orbit → reintegrate/verify → generate trajectories → finish. Each ABI step has a bounded integration budget. The worker batches calls into approximately 8-ms time slices and yields to receive cancellation. It streams complete trajectories using transferable typed arrays.

Requests carry increasing revisions. Obsolete replies cannot replace newer results. Parameters are whitelisted and finite/resource checked before reaching the core, which validates them again. Changing an energy setting leaves the previous result labelled until recomputation. Failures retain an explanation rather than fabricated replacement geometry.

## Rendering and interaction

React owns recipes, modes, selection and panels. OrbitControls owns rotation, pan and zoom. The persistent scene uses typed line batches, actual-state shaders and finite-time patch interpolation; the UI does not rerun integration per frame. Display conversion to f32 occurs only after local rebasing.

Time is held outside React's frame loop; textual controls refresh at a lower rate. Reduced-motion preferences remove camera transitions and the app opens paused. Labels are projected into HTML and decluttered near the Sun. All planets remain selectable in the labelled menu.

Scientific sections and diagnostic tables provide alternatives to inspecting the canvas. Camera buttons and keyboard controls complement pointer/touch gestures. The 3D scene itself is not fully expressible to a screen reader; the labelled controls, numeric summaries and sample table are the accessible evidence.

## Decision records

1. **DP5(4), not a symplectic fixed-step solver.** It supports adaptive encounter control, accurate dense events and the augmented STM with a small implementation. It does not conserve Jacobi exactly. We measure conservation and convergence, and avoid presenting it as a long-horizon geometric integrator.
2. **Power/inverse-power pair instead of a general Schur solver.** The supported small planar Lyapunov windows have separated real hyperbolic directions. Independent residual, reciprocity and canonical defects make this choice auditable without a large linear-algebra dependency. It cannot generalise to complex/degenerate stability spectra or bifurcation tracking; those require a different solver.
3. **Small raw WASM ABI.** Typed f64 arrays avoid serialising large trajectories and keep Rust independent of a binding framework. The cost is explicit pointer-lifetime discipline, centralised in one adapter and tested against the actual compiled binary.
4. **Two declared scales.** JPL fitted Keplerian orbits provide the navigable eight-planet overview. Local PCR3BP models provide the rigorous manifold chain. A combined static “Solar System tube network” would imply a different, time-dependent dynamical model and is excluded.
5. **Browser-local notebook.** Recipes and SHA-256 hashes reproduce experiments without accounts, remote storage or credentials. Results are recomputed rather than treating a screenshot as scientific output.

## Deployment

Vite emits a static build with relative asset URLs. CI builds the original WASM source and tests the compiled site mounted at `/gateway/` before uploading the Pages artifact. Deployment depends on all checks. Pull-request builds have read-only repository permissions; only a main-branch deploy job receives Pages and OIDC permissions. No runtime secrets are required.
