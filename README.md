# ORBITA — Interactive Solar System

A single-page, dependency-free interactive map of the Solar System. Watch the planets orbit in real simulated time, hop between worlds with a following camera, track two comets on true Keplerian ellipses, and test yourself with the quiz.

![stack](https://img.shields.io/badge/stack-vanilla%20JS%20%2B%20canvas-ffb347) ![deps](https://img.shields.io/badge/dependencies-none-63b3ec)

## Run it

It's a static site — no build step:

```sh
# any static server works
python3 -m http.server 8787
# → http://localhost:8787
```

(Or just open `index.html` directly in a browser.)

## Features

- **Accurate orbital motion** — planets use their real orbital periods; comets (Halley, Encke) solve Kepler's equation each frame with real eccentricities, and their tails stream away from the Sun.
- **520-rock asteroid belt** between Mars and Jupiter, with periods following Kepler's third law.
- **Camera** — drag to pan, scroll/pinch to zoom, click to select, "Follow" to lock onto a moving body.
- **Time machine** — pause or run at 1 day → 1 year per second, with a live simulated date.
- **Planet dossiers** — diameter, orbit, year, day (incl. Venus's retrograde spin), moons, temperature, and a fact; moons of each planet are drawn individually (Triton orbits retrograde).
- **Tour mode** (`T`) — a guided flythrough that hops planet to planet.
- **Quiz** (`Q`) — 5 random questions from a 12-question pool, with explanations.
- **Keyboard-first** — `1`–`8` select, arrows cycle, `Space` pauses, `+/−` zoom, `0` resets, `Esc` releases.
- **Accessible & mobile** — `prefers-reduced-motion` respected, touch pan + pinch zoom, ARIA labels on interactive regions.

## Honesty about the model

Orbital *periods*, eccentricities, distances (AU), diameters, temperatures and moon counts are real values. The rendering is not to scale: orbital radii use a compressed `AU^0.55` projection so Neptune fits on screen, planet sizes are exaggerated, and orbits are drawn circular (mean motion) except for comets. It's a map, not a simulator.

## Project layout

```
index.html            single page
css/style.css         dark space theme
js/data.js            planets, comets, quiz (real values)
js/app.js             canvas engine: camera, physics, input, UI
scripts/check.js      CI checks: asset refs, node --check, data shape
.github/workflows/    CI (checks) + CD (GitHub Pages on push to main)
```

## CI/CD

Push to `main` and GitHub Actions runs `scripts/check.js` (asset references, JS syntax, planetary data validation), then deploys the site to GitHub Pages.

To enable Pages deployment: in your repo, **Settings → Pages → Source: GitHub Actions**, and rename `main` to your default branch if different.

## Run the checks locally

```sh
node scripts/check.js
```
