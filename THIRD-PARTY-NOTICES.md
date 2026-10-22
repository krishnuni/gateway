# Dependencies, data and references

All application-specific equations, algorithms, rendering logic, interface and tests were newly implemented for Gateway. Established numerical methods and declared framework dependencies are used.

Runtime dependencies:

- React and React DOM — MIT, Meta Platforms and affiliates.
- Three.js and OrbitControls — MIT, three.js authors.
- Source Sans 3 via Fontsource — SIL Open Font License 1.1. [Bundled font licence](docs/licenses/Source-Sans-3.txt).

Build/test dependencies include TypeScript, Vite, its React plugin, Node type declarations and Playwright. Python reference calculations use NumPy and SciPy; those packages are not shipped to the browser. Package licences accompany installed packages. Runtime licence texts are also preserved in `docs/licenses/`.

The published Dormand–Prince and Shampine coefficient tables define the numerical method; they are not an adapted third-party solver implementation. See the paper citations in [NUMERICS.md](docs/NUMERICS.md).

JPL planetary fitted-element and astrodynamic-parameter tables supply scientific data, retrieved 22 October 2026. See [JPL approximate positions](https://ssd.jpl.nasa.gov/planets/approx_pos.html), [JPL parameters](https://ssd.jpl.nasa.gov/astro_par.html) and [JPL API conventions](https://ssd-api.jpl.nasa.gov/doc/periodic_orbits.html). No JPL application code or imagery is included. These references do not imply endorsement.

Braintruffle's films informed the visual brief. No video frames, artwork, code or exact compositions are incorporated in the application. Early planning concept images are identified as generated art-direction studies; all README screenshots come from the running application.
