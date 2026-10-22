"""Independent reference equations and DOP853 integration.

Runs against the actual compiled browser WASM output. No dynamics code is
imported from the application. Output is measured evidence, never a fixture
invented to match the solver.
"""
import json
import platform
from pathlib import Path
import numpy as np
import scipy
from scipy.integrate import solve_ivp

ROOT = Path(__file__).resolve().parents[1]

def flow(mu, s):
    x, y, vx, vy = s
    q1 = np.array([x + mu, y])
    q2 = np.array([x - 1 + mu, y])
    grav = -(1-mu)*q1/np.linalg.norm(q1)**3 - mu*q2/np.linalg.norm(q2)**3
    return np.array([vx, vy, x + 2*vy + grav[0], y - 2*vx + grav[1]])

def jacobi(mu, s):
    x, y, vx, vy = np.asarray(s).T
    return x*x + y*y + 2*(1-mu)/np.hypot(x+mu, y) + 2*mu/np.hypot(x-1+mu, y) - vx*vx - vy*vy

def jacobian(mu, s):
    x, y = s[:2]
    h = np.eye(2)
    for w, q in [(1-mu, np.array([x+mu, y])), (mu, np.array([x-1+mu, y]))]:
        r = np.linalg.norm(q)
        h += w*(3*np.outer(q, q)/r**5 - np.eye(2)/r**3)
    return np.block([[np.zeros((2, 2)), np.eye(2)], [h, np.array([[0., 2.], [-2., 0.]])]])

def reference(mu, initial, end, times=None):
    def augmented(t, s):
        return np.r_[flow(mu, s[:4]), (jacobian(mu, s[:4]) @ s[4:].reshape(4, 4)).ravel()]
    return solve_ivp(augmented, (0, end), np.r_[initial, np.eye(4).ravel()],
                     method="DOP853", rtol=3e-14, atol=2e-15, max_step=.01, t_eval=times)

def main():
    data = json.loads((ROOT/"docs/verification-input.json").read_text())
    results = {"python": platform.python_version(), "scipy": scipy.__version__, "cases": [], "convergence": []}
    for case in data["cases"]:
        mu = case["options"]["mu"]
        orbit = np.array(case["orbit"]).reshape(-1, 5)
        sol = reference(mu, orbit[0, 1:], orbit[-1, 0], orbit[:, 0])
        matrix = np.array(case["matrix"]).reshape(4, 4)
        ref_matrix = sol.y[4:, -1].reshape(4, 4)
        orbit_error = float(np.max(np.abs(orbit[:, 1:] - sol.y[:4].T)))
        eig = np.linalg.eigvals(ref_matrix)
        mu_s = eig[np.argmin(np.abs(eig))].real
        mu_u = eig[np.argmax(np.abs(eig))].real
        path_error = 0.
        section_residual = 0.
        for path in case["paths"][:8]:
            samples = np.array(path["samples"]).reshape(-1, 5)
            # Short common interval: long chaotic arcs are assessed separately.
            chosen = samples[np.abs(samples[:, 0]) <= .5]
            if len(chosen) < 2:
                continue
            psol = reference(mu, chosen[0, 1:], chosen[-1, 0], chosen[:, 0])
            path_error = max(path_error, float(np.max(np.abs(chosen[:, 1:] - psol.y[:4].T))))
            section = np.array(path["sections"]).reshape(-1, 5)
            if len(section):
                section_residual = max(section_residual, float(np.max(np.abs(section[:, 2]))))
                assert np.all(section[:, 4] > 0)
        result = {
            "mu": mu, "point": case["options"]["point"],
            "wasm_ms": case["milliseconds"], "orbit_state_error": orbit_error,
            "matrix_relative_error": float(np.linalg.norm(matrix-ref_matrix)/np.linalg.norm(ref_matrix)),
            "unstable_multiplier_error": float(abs(case["meta"][7]-mu_u)/abs(mu_u)),
            "stable_multiplier_error": float(abs(case["meta"][8]-mu_s)/abs(mu_s)),
            "closure": case["meta"][5], "jacobi_drift": case["meta"][16],
            "symplectic_defect": case["meta"][9], "reciprocity_error": case["meta"][26],
            "short_manifold_state_error": path_error, "section_y_residual": section_residual,
        }
        results["cases"].append(result)
        assert orbit_error < 1e-7, result
        assert result["matrix_relative_error"] < 1e-7, result
        assert result["closure"] < 1e-8, result
        assert path_error < 1e-7, result
    for trace in data["traces"]:
        arr = np.array(trace["data"][:-16]).reshape(-1, 5)
        sol = reference(trace["mu"], trace["initial"], trace["horizon"], arr[:, 0])
        results["convergence"].append({
            "rtol": trace["rtol"], "state_error": float(np.max(np.abs(arr[:, 1:]-sol.y[:4].T))),
            "jacobi_drift": float(np.max(np.abs(jacobi(trace["mu"], arr[:, 1:])-jacobi(trace["mu"], trace["initial"])))),
        })
    assert results["convergence"][-1]["state_error"] < 1e-8
    (ROOT/"docs/validation-local.json").write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
