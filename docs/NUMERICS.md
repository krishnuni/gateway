# Model and numerical contract

## Units and equations

State order is `s=(x,y,vx,vy)` in the rotating barycentric frame. Primary masses are `1−μ` and `μ` at `(−μ,0)` and `(1−μ,0)`. Separation, total gravitational parameter and angular rate are one. One revolution is `2π TU`.

`Ω=(x²+y²)/2+(1−μ)/r1+μ/r2`.

`xdot=vx; ydot=vy; vxdot=2vy+Ωx; vydot=−2vx+Ωy`.

`C=2Ω−vx²−vy²`. A position is allowed at fixed C when `2Ω−C≥0`. The UI specifies `C=C(Li)−ΔC`, with a positive offset for the supported Lyapunov family. It does not compute periodic orbits below the opening threshold.

All five Lagrange points are computed: bisection on the collinear force equation and analytic equilateral positions. System μ, separation, time unit and physical stopping radii are frozen in `src/data.ts`. Sun–planet GM values for the giant planets refer to their planetary systems, as identified by the JPL parameter table. This is an idealisation of the selected primary, not moon-resolved dynamics. Local separations use J2000 semimajor axes, not instantaneous ephemeris separation.

## Integration

The original f64 implementation uses Dormand–Prince 5(4), with the published embedded coefficients and Shampine quartic continuous extension. It advances the 4-state flow and, when needed, the 16 entries of `Φdot=A(s)Φ`. The analytic Jacobian includes the full effective-potential Hessian. Φ starts as the identity.

State and STM local errors use separate RMS blocks; their maximum controls acceptance. Scales are `atol+rtol max(|old|,|new|)`, with `atol=0.01 rtol`. The step ceiling is 0.02 TU and additionally 0.15 times distance to the nearer primary divided by speed. There is no force softening and no invariant projection during integration.

Dense-output roots locate symmetric returns, section crossings and physical boundary stops. The primary event logic brackets endpoint sign changes. The encounter step cap reduces missed-event risk; grazing/tangential contacts and multiple crossings within a step are not guaranteed to be detected. Close encounters may reach an explicit minimum-step/work limit rather than returning a misleading trajectory.

Regular history samples are 0.0125 TU apart, plus a localised terminal sample. Sampling interval does not set the adaptive integration step. Section samples solve `y=0` and retain `vy>0` in physical forward-flow orientation, including branches integrated backward.

## Periodic orbits and stability

An initial linear centre-mode guess near L₁ or L₂ is corrected with two unknowns, `x0` and `vy0`, while `y0=vx0=0`. At the first descending y=0 return, Newton shooting solves the crossing vx residual and requested energy. The derivative includes the event-time sensitivity. A small-offset orbit is continued toward the target offset with multiplicative energy steps.

The full period is reintegrated with Φ. The matrix is `M=Φ(T)` in velocity coordinates. The real, separated unstable direction uses power iteration; the stable direction uses inverse power iteration and an independently computed eigenvalue. Reciprocity is measured rather than imposed. Near-degenerate/complex hyperbolic pairs are unsupported and rejected by residual and separation gates.

Canonical diagnostics transform with `px=vx−y`, `py=vy+x` before evaluating `||Mcᵀ J Mc−J||F`. Applying the standard canonical J directly to velocity coordinates would be incorrect.

The accepted orbit must meet closure, symplectic and reciprocity gates. These are safeguards, not proofs of global accuracy. See the tighter measured fixture results in [VALIDATION.md](VALIDATION.md).

## Manifolds

Stable/unstable eigenvectors at the reference phase are transported by Φ to uniform time phases around the corrected orbit. Each direction is scaled to a requested position displacement ε. Positive/negative signs yield four branches. A small normal correction puts each **initial seed** on the orbit's Jacobi surface. This correction is not applied to later integration states.

Stable branches are integrated backward and unstable branches forward. At ε>0 the seeds approximate invariant manifolds; they are not points proven to lie on exact nonlinear manifolds. Tests cover local forward/backward contraction and a phase/ε refinement comparison. Long chaotic arcs require separate convergence assessment.

## Ensembles and outcomes

An ensemble fixes x, y and C; the resulting nonnegative speed is resolved into a direction. A deterministic 32-bit integer mixing function maps `(seed,index)` to a uniform-angle fan sample. It is not PCG or a cryptographic generator. Identical builds and parameters produce identical sample arrays. Recipes promise numerical reproducibility within tolerances across builds.

The first two particles' position-distance plot uses only matched stored times, a logarithmic distance axis and normalised length units. It is a finite-time sensitivity illustration, not an FTLE calculation.

Termination codes are horizon, primary boundary, secondary boundary, radius-4 observation-domain exit and numerical work limit. The application does not claim permanent capture or asymptotic escape from those finite observations.

## Solar System

An original Newton solver evaluates Kepler's equation using JPL Table 1's six orbital elements and secular rates for all eight planets. It rotates orbital-plane coordinates into heliocentric J2000 ecliptic coordinates in AU. Epochs are limited to 1800–2050. Displayed paths hold the fitted elements at the selected epoch while sweeping the anomaly.

This is a prescribed approximate model, not a mass-coupled N-body solver. The Earth entry is the Earth–Moon barycentre. Local gateway models are explicitly separate circular approximations; there is no claimed invariant manifold network for the complete evolving Solar System.

## What rendering means

Scientific output stays f64. Drawing buffers are f32, rebased near the selected L point for small μ. The phase embedding is `(x,y,0.45 vx)`; the height is velocity, not a third spatial coordinate. Inertial histories rotate each sample using its own relative timestamp; primary markers show the current playback time.

Transparent patches connect adjacent sampled phases at matched integration times, skipping large gaps. These are finite-resolution visual interpolants, not additional integrated particles or exact surfaces. Brightness is not probability.

Zero-velocity contours use adaptive cells refined around critical points and primaries. Their edge endpoints solve `2Ω−C=0` by bisection; the straight chords remain approximations. The base potential field is 360×270. Potential relief clips its vertical display range to avoid singular peaks filling the screen. Neither contour chords nor the relief grid are used to decide dynamical accessibility; the analytic potential is the authority.

## Sources

- [JPL periodic-orbit conventions](https://ssd-api.jpl.nasa.gov/doc/periodic_orbits.html).
- [Koon, Lo, Marsden & Ross, *Dynamical Systems, the Three-Body Problem and Space Mission Design*](https://ross.aoe.vt.edu/books/).
- Dormand & Prince (1980), *A family of embedded Runge–Kutta formulae*, JCAM 6(1), 19–26, DOI 10.1016/0771-050X(80)90013-3.
- Shampine (1986), *Some practical Runge–Kutta formulas*, Mathematics of Computation 46, 135–150, DOI 10.1090/S0025-5718-1986-0815836-3.
- [JPL fitted elements and validity](https://ssd.jpl.nasa.gov/planets/approx_pos.html), [GM values and units](https://ssd.jpl.nasa.gov/astro_par.html).
