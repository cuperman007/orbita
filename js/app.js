/* ORBITA — application engine.
 * Canvas rendering with a world→screen camera (pan + zoom).
 * Every body (planets + comets) follows a true Keplerian ellipse: real J2000
 * orbital elements, Kepler's equation solved each frame, so the map shows the
 * Solar System's actual configuration on the simulated date.
 * Time controls, click/tap selection with camera follow, keyboard shortcuts,
 * quiz mode, tour mode.
 */
(() => {
  'use strict';

  const { PLANETS, DWARF_PLANETS, COMETS, QUIZ } = window.ORBITA_DATA;

  // ---------- Canvas & camera ----------
  const canvas = document.getElementById('space');
  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cam = { x: 0, y: 0, zoom: 1, targetX: 0, targetY: 0, targetZoom: 1 };
  const START_ZOOM_FIT = 1; // fitted on resize

  let W = 0, H = 0, DPR = 1;
  let stars = [];
  let userZoomed = false; // stop auto-fit after the user takes control of zoom

  // ---------- Simulation state ----------
  const sim = {
    days: 0,                       // simulated days since t0
    daysPerSec: reducedMotion ? 0 : 1,
    startDate: new Date(),          // real "today" at load — ⏮ returns here
    selected: null,                // body id
    follow: null,                  // body id (camera follows)
    tour: false,
    tourIndex: 0,
    tourTimer: 0
  };

  // ---------- Display scaling ----------
  // Compress the huge range of orbital distances: r_disp = K * AU^p
  const SCALE_K = 62, SCALE_P = 0.55;
  const scaleAU = (au) => SCALE_K * Math.pow(au, SCALE_P);
  // Default "home" zoom: fit the system out to Saturn.
  const homeFit = () => (Math.min(W, H) / 2) / (scaleAU(9.537) + 30);

  const SUN_R = 16;
  const planetDisplayR = (km) => 3 + 2.3 * Math.log10(km / 1900 + 1);

  // Days between the J2000.0 epoch (2000-01-01 12:00 TT) and our sim start date.
  const EPOCH_DAYS = (sim.startDate - new Date(Date.UTC(2000, 0, 1, 12))) / 86400000;
  const D2R = Math.PI / 180;
  const norm2pi = (x) => x % (2 * Math.PI);

  // Kepler element set shared by planets and comets.
  // M0 = mean anomaly at t = t0 days; varpi = argument of perihelion (rad);
  // planets: M0 = (L0 - ϖ) at J2000, t0 = EPOCH_DAYS. comets: M0 = phase, t0 = 0.
  function makeEl({ aAU, ecc, M0, varpi, t0, periodDays }) {
    return { aAU, ecc, M0: norm2pi(M0), varpi, t0, periodDays };
  }

  // Precompute display geometry + Kepler elements for planets.
  const planetGeo = PLANETS.map((p) => ({
    ...p,
    dispR: planetDisplayR(p.radiusKm),
    el: makeEl({
      aAU: p.orbitAU, ecc: p.ecc,
      M0: (p.L0 - p.varpi) * D2R, varpi: p.varpi * D2R,
      t0: EPOCH_DAYS, periodDays: p.periodDays
    })
  }));

  // Dwarf planets: same treatment, out beyond Neptune.
  const dwarfGeo = DWARF_PLANETS.map((p) => ({
    ...p,
    dispR: planetDisplayR(p.radiusKm),
    moonsList: [],
    el: makeEl({
      aAU: p.orbitAU, ecc: p.ecc,
      M0: (p.L0 - p.varpi) * D2R, varpi: p.varpi * D2R,
      t0: EPOCH_DAYS, periodDays: p.periodDays
    })
  }));
  const allPlanetGeo = [...planetGeo, ...dwarfGeo];

  // ---------- Asteroid belt (visual) ----------
  // ~500 little rocks between Mars and Jupiter. Periods follow Kepler III: T = a^1.5 years.
  const belt = [];
  for (let i = 0; i < 520; i++) {
    const aAU = 2.05 + Math.random() * 1.35;
    const a = scaleAU(aAU);
    belt.push({
      a,
      phase: Math.random() * Math.PI * 2,
      periodDays: Math.pow(aAU, 1.5) * 365.25 * (0.97 + Math.random() * 0.06),
      alpha: 0.25 + Math.random() * 0.45,
      big: Math.random() < 0.08
    });
  }

  // ---------- Bodies for hit-testing / follow ----------
  // Each body: { id, kind, geo, x, y, screenX, screenY, dispR }
  const bodies = [];
  for (const g of allPlanetGeo) bodies.push({ id: g.id, kind: 'planet', geo: g, el: g.el, x: 0, y: 0 });
  for (const c of COMETS) {
    bodies.push({
      id: c.id, kind: 'comet', geo: c, x: 0, y: 0,
      el: makeEl({ aAU: c.aAU, ecc: c.e, M0: c.phase, varpi: c.omega, t0: 0, periodDays: c.periodDays })
    });
  }
  const bodyIndex = new Map(bodies.map((b) => [b.id, b]));

  // ---------- Stars ----------
  function makeStars() {
    stars = [];
    const n = Math.floor((W * H) / 2600);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() < 0.9 ? 1 : 2,
        base: 0.25 + Math.random() * 0.6,
        tw: Math.random() * Math.PI * 2,
        tws: 0.5 + Math.random() * 1.5
      });
    }
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    makeStars();

    // Fit: show at least out to Saturn by default (until the user zooms deliberately).
    const saturnR = scaleAU(9.537) + 30;
    const fit = Math.min(W, H) / 2 / saturnR;
    if (!userZoomed || cam.targetZoom === START_ZOOM_FIT) {
      cam.targetZoom = fit;
      if (cam.zoom === START_ZOOM_FIT) cam.zoom = fit;
    }
    if (sim.follow) refitToFollow();
  }
  window.addEventListener('resize', resize);

  // ---------- Orbit math ----------
  // Solve Kepler's equation M = E - e sin E (Newton; 6 iterations is ample —
  // even at Halley's e=0.967 the residual is < 6e-4 rad, i.e. sub-pixel).
  function keplerE(M, e) {
    let E = e < 0.8 ? M : Math.PI;
    for (let i = 0; i < 6; i++) {
      E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }
    return E;
  }

  // True position (world px) + current distance (AU) for a Kepler element set.
  function keplerPos(el, days) {
    const M = norm2pi(el.M0 + (2 * Math.PI * (el.t0 + days)) / el.periodDays);
    const E = keplerE(M, el.ecc);
    const nu = 2 * Math.atan2(
      Math.sqrt(1 + el.ecc) * Math.sin(E / 2),
      Math.sqrt(1 - el.ecc) * Math.cos(E / 2)
    );
    const rAU = el.aAU * (1 - el.ecc * Math.cos(E));
    const r = scaleAU(rAU);
    const ang = nu + el.varpi;
    return { x: Math.cos(ang) * r, y: Math.sin(ang) * r, rAU };
  }

  // ---------- World → screen ----------
  function toScreen(x, y) {
    return {
      x: W / 2 + (x - cam.x) * cam.zoom,
      y: H / 2 + (y - cam.y) * cam.zoom
    };
  }
  function toWorld(sx, sy) {
    return { x: (sx - W / 2) / cam.zoom + cam.x, y: (sy - H / 2) / cam.zoom + cam.y };
  }

  // ---------- Drawing ----------
  function drawStars(t) {
    ctx.fillStyle = '#04060e';
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const a = reducedMotion ? s.base : s.base * (0.7 + 0.3 * Math.sin(t / 1000 * s.tws + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfd8ff';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function drawSun() {
    const p = toScreen(0, 0);
    const r = SUN_R * Math.max(cam.zoom, 0.35);
    const glow = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r * 4.5);
    glow.addColorStop(0, 'rgba(255, 200, 110, 0.5)');
    glow.addColorStop(1, 'rgba(255, 170, 70, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 4.5, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
    core.addColorStop(0, '#fff3c4');
    core.addColorStop(0.55, '#ffcf6e');
    core.addColorStop(1, '#e08a2c');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // True ellipse (compressed by the display projection) for a Kepler element set.
  function drawKeplerOrbit(el, color, dash) {
    const c0 = toScreen(0, 0);
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const nu = (i / 160) * Math.PI * 2;
      const rAU = (el.aAU * (1 - el.ecc * el.ecc)) / (1 + el.ecc * Math.cos(nu));
      const r = scaleAU(rAU);
      const ang = nu + el.varpi;
      const sx = c0.x + Math.cos(ang) * r * cam.zoom;
      const sy = c0.y + Math.sin(ang) * r * cam.zoom;
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.setLineDash(dash ? [4, 5] : []);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawRing(geo, p, r) {
    const ring = geo.rings;
    if (!ring) return;
    const inner = r * ring.inner;
    const outer = r * ring.outer;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-0.35);
    ctx.scale(1, 0.42);
    const grad = ctx.createRadialGradient(0, 0, inner * 0.85, 0, 0, outer);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.25, hexA(ring.color, ring.alpha));
    grad.addColorStop(0.75, hexA(ring.color, ring.alpha * 0.75));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, Math.PI * 2);
    ctx.arc(0, 0, inner, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  function drawPlanet(b, t) {
    const g = b.geo;
    const p = toScreen(b.x, b.y);
    const r = Math.max(1.4, g.dispR * cam.zoom);
    if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) return;

    drawRing(g, p, r);

    const grad = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.15, p.x, p.y, r);
    grad.addColorStop(0, g.color);
    grad.addColorStop(1, g.color2);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Banded hint for gas giants (Jupiter/Saturn): subtle horizontal stripes.
    if (g.bands && r > 3.5) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#000';
      for (let i = -2; i <= 2; i++) {
        const by = p.y + i * r * 0.4;
        ctx.fillRect(p.x - r, by, r * 2, r * 0.14);
      }
      ctx.restore();
    }

    // Moons
    if (g.moonsList) {
      for (const m of g.moonsList) {
        // Moons orbit with their own real periods (in Earth days; negative = retrograde).
        const mAng = (2 * Math.PI * sim.days) / m.periodDays + m.dist * 3;
        const md = r * (1.9 + m.dist * 1.35);
        const mx = p.x + Math.cos(mAng) * md;
        const my = p.y + Math.sin(mAng) * md;
        const mr = Math.max(0.8, planetDisplayR(m.radiusKm) * cam.zoom * 0.8);
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Labels (dwarf planets are rare out there — always label them)
    if (g.dwarf || cam.zoom > 0.45 || sim.selected === g.id) {
      ctx.font = '600 11px ' + '"Avenir Next", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = sim.selected === g.id ? '#ffd9a0' : 'rgba(200, 214, 255, 0.75)';
      ctx.fillText(g.name, p.x, p.y + r + 14);
    }

    // Selection halo
    if (sim.selected === g.id) {
      const pulse = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t / 300);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 6 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 179, 71, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawBelt() {
    if (cam.zoom < 0.3) return; // too far out to matter
    const c = toScreen(0, 0);
    for (const s of belt) {
      const ang = s.phase + (2 * Math.PI * sim.days) / s.periodDays;
      const sx = c.x + Math.cos(ang) * s.a * cam.zoom;
      const sy = c.y + Math.sin(ang) * s.a * cam.zoom;
      if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
      ctx.globalAlpha = s.alpha * (s.big ? 1 : 0.6);
      ctx.fillStyle = '#8f8a80';
      const r = s.big ? 1.4 : 0.8;
      ctx.fillRect(sx, sy, r, r);
    }
    ctx.globalAlpha = 1;
  }

  function drawComet(b, t) {
    const c = b.geo;
    const p = toScreen(b.x, b.y);
    const r = Math.max(1.2, 2.6 * Math.sqrt(cam.zoom));
    if (p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80) return;

    // Tail points away from the Sun, length grows near perihelion.
    if (c.tail && b.rAU > 0) {
      const dx = b.x, dy = b.y;
      const len = Math.min(140, 60 / (b.rAU * b.rAU + 0.3)) * cam.zoom;
      const norm = Math.hypot(dx, dy) || 1;
      const ux = dx / norm, uy = dy / norm;
      const tail = ctx.createLinearGradient(p.x, p.y, p.x + ux * len, p.y + uy * len);
      tail.addColorStop(0, 'rgba(190, 230, 255, 0.5)');
      tail.addColorStop(1, 'rgba(190, 230, 255, 0)');
      ctx.strokeStyle = tail;
      ctx.lineWidth = Math.max(1, r * 1.6);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + ux * len, p.y + uy * len);
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
    glow.addColorStop(0, 'rgba(220, 240, 255, 0.9)');
    glow.addColorStop(1, 'rgba(180, 220, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
    ctx.fill();

    if (cam.zoom > 0.8 || sim.selected === c.id) {
      ctx.font = '600 10px ' + '"Avenir Next", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(190, 220, 255, 0.7)';
      ctx.fillText(c.name, p.x, p.y - r * 3 - 4);
    }
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(t) {
    requestAnimationFrame(frame); // schedule first: a frame error must never break the loop
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;

    // Self-heal: a non-finite camera (e.g. from a wild gesture) would push every
    // body off-canvas so the planets appear to vanish — snap the camera home.
    if ([cam.x, cam.y, cam.zoom, cam.targetX, cam.targetY, cam.targetZoom].some((v) => !Number.isFinite(v))) {
      const z = homeFit();
      cam.x = 0; cam.y = 0; cam.zoom = z;
      cam.targetX = 0; cam.targetY = 0; cam.targetZoom = z;
    }

    try {
    sim.days += sim.daysPerSec * dt;

    // Tour: hop planets on a timer.
    if (sim.tour) {
      sim.tourTimer += dt;
      if (sim.tourTimer > 6) {
        sim.tourTimer = 0;
        sim.tourIndex = (sim.tourIndex + 1) % PLANETS.length;
        const id = PLANETS[sim.tourIndex].id;
        sim.follow = id;
        refitToFollow();
        selectBody(id, true);
      }
    }

    // Update positions (true Keplerian motion for every body).
    for (const b of bodies) {
      const pos = keplerPos(b.el, sim.days);
      b.x = pos.x; b.y = pos.y; b.rAU = pos.rAU;
    }

    // Camera: follow target, track the pointer 1:1 while dragging, or ease.
    if (sim.follow && !dragging.moving) {
      const b = bodyIndex.get(sim.follow);
      if (b) { cam.x = b.x; cam.y = b.y; cam.targetX = b.x; cam.targetY = b.y; }
    } else {
      const ease = 1 - Math.pow(0.0015, dt); // smooth exponential ease
      if (dragging.moving) { cam.x = cam.targetX; cam.y = cam.targetY; }
      else {
        cam.x += (cam.targetX - cam.x) * ease;
        cam.y += (cam.targetY - cam.y) * ease;
      }
      cam.zoom += (cam.targetZoom - cam.zoom) * ease;
    }

    // Draw.
    drawStars(t);
    // Orbit paths (true ellipses)
    for (const g of planetGeo) drawKeplerOrbit(g.el, 'rgba(120, 150, 220, 0.16)');
    for (const g of dwarfGeo) drawKeplerOrbit(g.el, 'rgba(190, 170, 230, 0.13)', true);
    for (const b of bodies) if (b.kind === 'comet') drawKeplerOrbit(b.el, 'rgba(150, 220, 255, 0.14)', true);
    drawSun();
    drawBelt();
    for (const b of bodies) {
      const sp = toScreen(b.x, b.y);
      b.screenX = sp.x; b.screenY = sp.y;
      b.kind === 'planet' ? drawPlanet(b, t) : drawComet(b, t);
    }

    updateClock();
    } catch (err) {
      console.warn('ORBITA: frame error', err);
      if ([cam.x, cam.y, cam.zoom, cam.targetX, cam.targetY, cam.targetZoom].some((v) => !Number.isFinite(v))) {
        const z = homeFit();
        cam.x = 0; cam.y = 0; cam.zoom = z;
        cam.targetX = 0; cam.targetY = 0; cam.targetZoom = z;
      }
    }
  }

  // ---------- Clock ----------
  const clockEl = document.getElementById('sim-date');
  let lastClock = '';
  function updateClock() {
    const d = new Date(sim.startDate.getTime() + sim.days * 86400000);
    const s = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (s !== lastClock) { lastClock = s; clockEl.textContent = s; }
  }

  // ---------- Formatters ----------
  const fmtKm = (km) => km.toLocaleString('en-GB');
  const fmtDays = (d) => (d < 400 ? `${Math.round(d * 10) / 10} days` : `${Math.round(d / 365.25)} years`);
  const fmtHours = (h) => {
    const a = Math.abs(h);
    const retro = h < 0 ? ' ↺' : '';
    return a >= 48 ? `${(a / 24).toFixed(1)} days${retro}` : `${a.toFixed(1)} h${retro}`;
  };

  // ---------- Selection & panel ----------
  const panel = document.getElementById('panel');
  const panelBody = document.getElementById('panel-body');
  const hint = document.getElementById('hint-text');
  const HINT_DEFAULT = 'Drag or scroll to pan · Wheel, pinch or ⌃+scroll to zoom · Click a planet to explore · <kbd>1</kbd>–<kbd>8</kbd> select · <kbd>Space</kbd> pause';

  function selectBody(id, silent) {
    sim.selected = id;
    const b = bodyIndex.get(id);
    const g = b ? b.geo : null;
    if (!g) return;

    if (b.kind === 'planet') {
      panelBody.innerHTML = `
        <div class="planet-head">
          <span class="planet-swatch" style="background: radial-gradient(circle at 35% 35%, ${g.color}, ${g.color2}); --glow: ${hexA(g.color, 0.55)};"></span>
          <div>
            <h2 class="planet-name">${g.name}</h2>
            <div class="planet-type">${g.dwarf ? 'Dwarf planet' : 'Planet'}</div>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat"><div class="k">Diameter</div><div class="v">${fmtKm(g.radiusKm)} km</div></div>
          <div class="stat"><div class="k">Orbit</div><div class="v">${g.orbitAU} AU</div></div>
          <div class="stat"><div class="k">Eccentricity</div><div class="v">${g.ecc}</div></div>
          <div class="stat"><div class="k">Year</div><div class="v">${fmtDays(g.periodDays)}</div></div>
          <div class="stat"><div class="k">Sun distance now</div><div class="v">${(b.rAU ?? g.orbitAU).toFixed(2)} AU</div></div>
          <div class="stat"><div class="k">Day</div><div class="v">${fmtHours(g.rotationHours)}</div></div>
          <div class="stat"><div class="k">Moons</div><div class="v">${g.moons}</div></div>
          <div class="stat"><div class="k">Mean temp</div><div class="v">${g.tempC} °C</div></div>
        </div>
        <p class="blurb">${g.blurb}</p>
        ${g.moonsList.length ? `<div class="planet-type" style="margin-bottom:6px">Moons</div>
          <div class="moon-row">${g.moonsList.map((m) => `<span class="moon-chip">${m.name}</span>`).join('')}</div>` : ''}
        <button class="follow-btn" data-follow="${g.id}">${following(g.id) ? '■ Stop following' : '◎ Follow camera'}</button>`;
    } else {
      panelBody.innerHTML = `
        <div class="planet-head">
          <span class="planet-swatch" style="background: radial-gradient(circle at 35% 35%, #dceeff, #7fb4d8); --glow: rgba(170,220,255,0.6)"></span>
          <div>
            <h2 class="planet-name">${g.name}</h2>
            <div class="planet-type">Comet</div>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat"><div class="k">Semi-major axis</div><div class="v">${g.aAU} AU</div></div>
          <div class="stat"><div class="k">Eccentricity</div><div class="v">${g.e}</div></div>
          <div class="stat"><div class="k">Period</div><div class="v">${fmtDays(g.periodDays)}</div></div>
          <div class="stat"><div class="k">Current dist.</div><div class="v">${(b.rAU || 0).toFixed(2)} AU</div></div>
        </div>
        <p class="blurb">${g.id === 'halley'
          ? 'The most famous comet, visible from Earth roughly every 76 years. Last perihelion: 1986; next: 2061. Its tail always streams away from the Sun.'
          : 'The comet with the shortest period in the Solar System (~3.3 years), and a member of the Jupiter family of comets. One of the first discovered comets, in 1818.'}</p>
        <button class="follow-btn" data-follow="${g.id}">${following(g.id) ? '■ Stop following' : '◎ Follow camera'}</button>`;
    }

    panel.classList.remove('hidden');
    if (!silent) {
      hint.innerHTML = sim.follow
        ? `Following <b>${g.name}</b>. Press <kbd>Esc</kbd> to release the camera.`
        : HINT_DEFAULT;
    }
    updateFollowBtns();
  }

  function deselect() {
    sim.selected = null;
    panel.classList.add('hidden');
    hint.innerHTML = HINT_DEFAULT;
    updateFollowBtns();
  }

  function following(id) { return sim.follow === id; }

  function refitToFollow() {
    const b = bodyIndex.get(sim.follow);
    if (!b || b.kind !== 'planet') return;
    // Zoom so the planet (and its moons) fits pleasantly.
    const span = b.geo.dispR * 4.2;
    cam.targetZoom = Math.min(8, Math.max(0.2, Math.min(W, H) / 3 / (span || 1)));
  }

  function updateFollowBtns() {
    const btn = panelBody.querySelector('.follow-btn');
    if (btn && sim.selected) {
      const on = following(sim.selected);
      btn.classList.toggle('following', on);
      btn.textContent = on ? '■ Stop following' : '◎ Follow camera';
    }
  }

  panelBody.addEventListener('click', (e) => {
    const f = e.target.closest('[data-follow]');
    if (!f) return;
    if (sim.follow === f.dataset.follow) {
      sim.follow = null;
    } else {
      sim.follow = f.dataset.follow;
      refitToFollow();
    }
    updateFollowBtns();
    hint.innerHTML = sim.follow ? `Following <b>${bodyIndex.get(sim.follow).geo.name}</b>. Press <kbd>Esc</kbd> to release.` : HINT_DEFAULT;
  });
  document.getElementById('panel-close').addEventListener('click', deselect);

  // ---------- Pointer input: pan / click / pinch ----------
  const dragging = { on: false, moving: false, sx: 0, sy: 0, wx: 0, wy: 0, pinchD: 0 };
  const pointers = new Map();

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging.on = true; dragging.moving = false;
      dragging.sx = e.clientX; dragging.sy = e.clientY;
      dragging.wx = cam.targetX; dragging.wy = cam.targetY;
      canvas.classList.add('dragging');
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      dragging.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (dragging.pinchD > 0) zoomBy(d / dragging.pinchD);
      dragging.pinchD = d;
      return;
    }
    if (!dragging.on) return;
    if (Math.hypot(e.clientX - dragging.sx, e.clientY - dragging.sy) > 5) dragging.moving = true;
    if (dragging.moving) {
      sim.follow = null; // user takes the wheel
      // Total displacement since pointerdown (not the per-event delta!), so a
      // long drag actually moves the camera the full distance.
      cam.targetX = dragging.wx - (e.clientX - dragging.sx) / cam.zoom;
      cam.targetY = dragging.wy - (e.clientY - dragging.sy) / cam.zoom;
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (pointers.size === 0) {
      if (dragging.on && !dragging.moving) handleClick(e.clientX, e.clientY);
      dragging.on = false; dragging.moving = false;
    }
    dragging.pinchD = 0;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  function handleClick(sx, sy) {
    // Find nearest body within a generous radius (screen space).
    let best = null, bestD = 1e9;
    for (const b of bodies) {
      const r = b.kind === 'planet' ? b.geo.dispR * cam.zoom + 10 : 14;
      const d = Math.hypot(b.screenX - sx, b.screenY - sy);
      if (d < Math.max(r, 14) && d < bestD) { best = b; bestD = d; }
    }
    if (best) selectBody(best.id);
    else {
      deselect();
      sim.follow = null;
    }
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey) {
      // Trackpad pinch gesture → zoom around the pointer.
      zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      return;
    }
    // Mouse wheel (line units or big steps) zooms; smooth two-finger
    // trackpad scroll pans — the natural macOS gesture.
    const isWheel = e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50 || Math.abs(e.deltaX) >= 50;
    if (isWheel) zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    else {
      sim.follow = null; // user takes the wheel
      cam.targetX -= e.deltaX / cam.zoom;
      cam.targetY -= e.deltaY / cam.zoom;
    }
  }, { passive: false });

  function zoomBy(f, sx, sy) {
    userZoomed = true;
    const z0 = cam.targetZoom;
    const z1 = Math.min(30, Math.max(0.15, z0 * f));
    // Keep the point under (sx, sy) stationary.
    const px = sx ?? W / 2, py = sy ?? H / 2;
    const w = toWorld(px, py);
    cam.targetZoom = z1;
    cam.targetX = w.x - (px - W / 2) / z1;
    cam.targetY = w.y - (py - H / 2) / z1;
  }

  // ---------- Keyboard ----------
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return;
    const k = e.key;
    if (k === ' ') {
      e.preventDefault();
      setSpeed(sim.daysPerSec === 0 ? 1 : 0);
    } else if (k === 'Escape') {
      if (!document.getElementById('modal').classList.contains('hidden')) closeModal();
      else { sim.follow = null; deselect(); }
    } else if (k === '+' || k === '=') zoomBy(1.3);
    else if (k === '-' || k === '_') zoomBy(1 / 1.3);
    else if (k === '0') resetAll();
    else if (/^[1-8]$/.test(k)) selectBody(PLANETS[+k - 1].id);
    else if (k === 'q' || k === 'Q') toggleQuiz();
    else if (k === 't' || k === 'T') toggleTour();
    else if (k === 'ArrowRight') {
      const i = PLANETS.findIndex((p) => p.id === sim.selected);
      selectBody(PLANETS[(i + 1 + PLANETS.length) % PLANETS.length].id);
    } else if (k === 'ArrowLeft') {
      const i = PLANETS.findIndex((p) => p.id === sim.selected);
      selectBody(PLANETS[(i - 1 + PLANETS.length) % PLANETS.length].id);
    }
  });

  // ---------- Speed controls ----------
  const speedBtns = [...document.querySelectorAll('.speed-btn')];
  function setSpeed(dps) {
    sim.daysPerSec = Math.max(0, Math.min(3650, dps));
    speedBtns.forEach((b) => b.classList.toggle('active', +b.dataset.speed === sim.daysPerSec));
  }
  speedBtns.forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
  setSpeed(sim.daysPerSec);

  // ---------- Full reset (⏮ / ⌂ / 0): time back to today AND camera home ----------
  let resetHintT = 0;
  function resetAll() {
    sim.days = 0;      // back to the real "today" (load time)
    lastClock = '';
    resetView();       // …and fly the camera home, so the reset is visible
    hint.innerHTML = '⏮ Back to today — camera home, full system in view';
    clearTimeout(resetHintT);
    resetHintT = setTimeout(() => { hint.innerHTML = HINT_DEFAULT; }, 3000);
  }

  const todayBtn = document.getElementById('today-btn');
  if (todayBtn) todayBtn.addEventListener('click', () => {
    resetAll();
    todayBtn.classList.add('active');
    setTimeout(() => todayBtn.classList.remove('active'), 250);
  });

  // ---------- Reset / zoom buttons ----------
  function resetView() {
    userZoomed = false;
    sim.follow = null;
    cam.targetX = 0; cam.targetY = 0;
    cam.targetZoom = homeFit();
    deselect();
  }
  document.getElementById('reset-btn').addEventListener('click', resetAll);
  document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.35));
  document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.35));

  // ---------- Modal ----------
  const modal = document.getElementById('modal');
  const modalBox = document.getElementById('modal-box');
  const modalTitle = document.getElementById('modal-title');
  const modalBodyEl = document.getElementById('modal-body');

  function openModal(title) {
    modalTitle.textContent = title;
    modal.classList.remove('hidden');
  }
  function closeModal() {
    modal.classList.add('hidden');
    modalBodyEl.innerHTML = '';
  }
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  document.getElementById('help-btn').addEventListener('click', () => {
    openModal('Keyboard shortcuts');
    modalBodyEl.innerHTML = `<ul class="help-list">
      <li><span>Select planets</span><span><kbd>1</kbd>…<kbd>8</kbd></span></li>
      <li><span>Previous / next planet</span><span><kbd>←</kbd> <kbd>→</kbd></span></li>
      <li><span>Pause / resume</span><span><kbd>Space</kbd></span></li>
      <li><span>Zoom in / out</span><span><kbd>+</kbd> <kbd>−</kbd></span></li>
      <li><span>Quiz / tour</span><span><kbd>Q</kbd> / <kbd>T</kbd></span></li>
      <li><span>Release camera / close</span><span><kbd>Esc</kbd></span></li>
      <li><span>Reset time &amp; view</span><span><b>⏮</b> / <b>⌂</b> / <kbd>0</kbd></span></li>
      <li><span>Pan · Zoom · Select</span><span>drag / scroll · wheel, pinch / ⌃+scroll · click</span></li>
    </ul>
    <p class="quiz-why" style="margin-top:16px">Note: planets follow their real J2000 orbital elements — they are exactly where they are on the simulated date. Only the *sizes* and the distance scale are compressed so everything fits on one screen.</p>`;
  });

  // ---------- Quiz ----------
  let quiz = { questions: [], i: 0, score: 0, locked: false };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function toggleQuiz() {
    if (!modal.classList.contains('hidden') && modalTitle.textContent.startsWith('Space quiz')) {
      closeModal();
    } else {
      openQuiz();
    }
  }

  function openQuiz() {
    quiz = { questions: shuffle(QUIZ).slice(0, 5), i: 0, score: 0, locked: false };
    openModal('Space quiz');
    renderQuiz();
  }

  function renderQuiz() {
    const { questions, i, score } = quiz;
    if (i >= questions.length) {
      const pct = Math.round((score / questions.length) * 100);
      const verdict = pct === 100 ? 'Flawless. You are officially a planetary scientist. 🏆'
        : pct >= 60 ? 'Great orbit — solid knowledge out there. 🚀'
        : 'A bit of a wobbly orbit. Give the tour a spin and try again!';
      modalBodyEl.innerHTML = `
        <p class="quiz-score-line">You scored <b>${score} / ${questions.length}</b> (${pct}%)</p>
        <p class="quiz-why">${verdict}</p>
        <button class="follow-btn" id="quiz-retry">↻ Play again</button>
        <button class="follow-btn" id="quiz-exit" style="border-color: var(--panel-border); color: var(--text-dim); background: transparent;">Exit</button>`;
      document.getElementById('quiz-retry').addEventListener('click', openQuiz);
      document.getElementById('quiz-exit').addEventListener('click', closeModal);
      return;
    }

    const q = questions[i];
    modalBodyEl.innerHTML = `
      <div class="quiz-progress"><div style="width:${(i / questions.length) * 100}%"></div></div>
      <div class="quiz-score-line">Question ${i + 1} of ${questions.length} · score ${score}</div>
      <p class="quiz-q">${q.q}</p>
      <div class="quiz-options">
        ${q.a.map((opt, j) => `<button class="quiz-opt" data-j="${j}">${opt}</button>`).join('')}
      </div>
      <p class="quiz-why" id="quiz-why"></p>`;

    modalBodyEl.querySelectorAll('.quiz-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (quiz.locked) return;
        quiz.locked = true;
        const j = +btn.dataset.j;
        if (j === q.correct) quiz.score++;
        modalBodyEl.querySelectorAll('.quiz-opt').forEach((b2) => {
          b2.disabled = true;
          if (+b2.dataset.j === q.correct) b2.classList.add('right');
          else if (b2 === btn) b2.classList.add('wrong');
        });
        document.getElementById('quiz-why').textContent = q.why;
        setTimeout(() => { quiz.i++; quiz.locked = false; renderQuiz(); }, 3200);
      });
    });
  }

  document.getElementById('quiz-btn').addEventListener('click', toggleQuiz);

  // ---------- Tour ----------
  function toggleTour() {
    sim.tour = !sim.tour;
    document.getElementById('tour-btn').classList.toggle('active', sim.tour);
    document.getElementById('tour-btn').textContent = sim.tour ? '■ Stop tour' : '▶ Tour';
    if (sim.tour) {
      sim.tourIndex = 0;
      sim.tourTimer = 99; // fires immediately
      if (sim.daysPerSec < 1) setSpeed(30);
      closeModal();
    } else {
      sim.follow = null;
    }
  }
  document.getElementById('tour-btn').addEventListener('click', toggleTour);

  // ---------- Boot ----------
  resize();
  selectBody('earth');
  requestAnimationFrame(frame);

  // Debug escape hatch (used by test/harness.mjs; harmless in the browser).
  window.__ORBITA_DEBUG = { cam, sim, dragging, resetView, resetAll };
})();
