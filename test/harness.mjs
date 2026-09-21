// ORBITA headless harness — loads data.js + app.js against a minimal DOM
// stub and drives pointer/wheel/click events to verify camera behavior.
// Run: node test/harness.mjs   (exit code 0 = all pass)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (rel) => readFileSync(path.join(here, '..', rel), 'utf8');

// ---------- Clock ----------
let now = 0;
let rafCb = null;
const performance = { now: () => now };
const requestAnimationFrame = (cb) => { rafCb = cb; };
function stepFrames(n = 1, dtMs = 1000 / 60) {
  for (let i = 0; i < n; i++) {
    now += dtMs;
    const cb = rafCb; rafCb = null;
    if (!cb) throw new Error('rAF chain broken');
    frameArts = []; // separate per-frame draw calls
    cb(now);
  }
}

// ---------- 2D context stub ----------
let frameArts = []; // arcs of the most recent frame (reset each stepFrames tick)
const grad = { addColorStop() {} };
const noop = () => {};
const ctx = {
  fillStyle: null, strokeStyle: null, lineWidth: 1, globalAlpha: 1,
  font: '', textAlign: '', lineCap: '',
  fillRect: noop, beginPath: noop, closePath: noop, fill: noop, stroke: noop,
  save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
  setTransform: noop, setLineDash: noop, moveTo: noop, lineTo: noop, fillText: noop, clip: noop,
  arc: (x, y, r) => frameArts.push([x, y, r]),
  createRadialGradient: () => grad,
  createLinearGradient: () => grad,
};

// ---------- DOM stub ----------
const W = 1280, H = 800;
const els = {};
function makeEl(id, extra = {}) {
  if (els[id]) return els[id];
  const el = {
    id, style: {}, dataset: {}, children: [],
    textContent: '', innerHTML: '', hidden: false, disabled: false,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { (f ?? !this._s.has(c)) ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    listeners: {},
    addEventListener(t, f) { (el.listeners[t] ??= []).push(f); },
    removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    getContext: () => ctx,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    ...extra,
  };
  els[id] = el;
  return el;
}
for (const id of ['space', 'sim-date', 'panel', 'panel-body', 'hint-text', 'modal',
  'modal-box', 'modal-title', 'modal-body', 'modal-close', 'help-btn', 'quiz-btn',
  'tour-btn', 'reset-btn', 'zoom-in', 'zoom-out', 'today-btn', 'panel-close']) makeEl(id);

const speedBtns = ['0', '1', '7', '30', '365'].map((s) => makeEl(`speed-${s}`, { dataset: { speed: s } }));

const documentStub = {
  getElementById: (id) => makeEl(id),
  querySelectorAll: (sel) => (sel === '.speed-btn' ? speedBtns : []),
  addEventListener() {},
};

const windowListeners = {};
const windowStub = {
  innerWidth: W, innerHeight: H, devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
  addEventListener: (t, f) => { (windowListeners[t] ??= []).push(f); },
  ORBITA_DATA: null,
};
windowStub.window = windowStub; // `window.window` self-ref, if ever needed

// ---------- Boot the app in a VM context ----------
const sandbox = { window: windowStub, document: documentStub, performance, requestAnimationFrame, console, setTimeout, clearTimeout };
vm.createContext(sandbox);
vm.runInContext(load('js/data.js'), sandbox);
vm.runInContext(load('js/app.js'), sandbox);

const canvas = makeEl('space');
function fire(el, type, props = {}) {
  const e = { preventDefault() {}, stopPropagation() {}, ...props };
  for (const f of el.listeners[type] ?? []) f(e);
}
// First arc of each frame is the Sun's glow (drawn at toScreen(0,0)).
function sunPos() { return frameArts.length ? frameArts[0] : null; }
function snapshot() { /* no-op: frames are separated inside stepFrames */ }

// ---------- Results ----------
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

// ---------- Baseline ----------
// Pause immediately: at 1 day/sec, 10 frames ≈ 4 simulated hours — enough to
// cross midnight and make the load-date checks flaky when run in the evening.
for (const f of makeEl('speed-0').listeners['click'] ?? []) f();
snapshot(); stepFrames(10);
const x0 = sunPos()[0];
const loadClock = makeEl('sim-date').textContent; // sim is at day 0 → load date
check('boot: Sun centered', Math.abs(x0 - W / 2) < 1, `sun.x=${x0.toFixed(1)} (expect ${W / 2})`);

// ---------- Test: drag to pan ----------
fire(canvas, 'pointerdown', { pointerId: 1, clientX: 640, clientY: 400 });
for (let i = 1; i <= 30; i++) {
  fire(canvas, 'pointermove', { pointerId: 1, clientX: 640 + i * 10, clientY: 400 });
}
fire(canvas, 'pointerup', { pointerId: 1, clientX: 940, clientY: 400 });
snapshot();
stepFrames(60);
const x1 = sunPos()[0];
const d = windowStub.__ORBITA_DEBUG;
console.log(`debug after drag: follow=${d.sim.follow} selected=${d.sim.selected} cam=(${d.cam.x.toFixed(1)},${d.cam.y.toFixed(1)}) target=(${d.cam.targetX.toFixed(1)},${d.cam.targetY.toFixed(1)}) zoom=${d.cam.zoom.toFixed(3)}/${d.cam.targetZoom.toFixed(3)} dragging=${d.dragging.on},${d.dragging.moving}`);
const panDelta = x1 - x0;
check('drag 300px right → scene moves ~300px right (1:1 pan)',
  Math.abs(panDelta - 300) < 8, `sun moved ${panDelta.toFixed(1)}px`);

// ---------- Test: smooth scroll (trackpad) → pan ----------
snapshot(); stepFrames(5);
const sx0 = sunPos()[0], sy0 = sunPos()[1];
for (let i = 0; i < 30; i++) fire(canvas, 'wheel', { deltaY: 12, deltaX: 0, ctrlKey: false, deltaMode: 0, clientX: 640, clientY: 400 });
snapshot(); stepFrames(60);
const sdx = sunPos()[0] - sx0;
check('smooth scroll 360px down → pans down (trackpad gesture)', sdx < 10 && Math.abs(sunPos()[1] - sy0) > 100,
  `sun moved (${sdx.toFixed(0)}, ${(sunPos()[1] - sy0).toFixed(0)})`);

// ---------- Test: mouse wheel → zoom ----------
snapshot(); stepFrames(5);
const r0 = sunPos()[2];
fire(canvas, 'wheel', { deltaY: -120, deltaMode: 0, ctrlKey: false, clientX: 640, clientY: 400 });
snapshot(); stepFrames(60);
const r1 = sunPos()[2];
check('mouse wheel → zooms', r1 > r0 * 1.05, `glow r ${r0.toFixed(0)} → ${r1.toFixed(0)}`);

// ---------- Test: ctrl+scroll (pinch) → zoom out ----------
fire(canvas, 'wheel', { deltaY: 300, deltaMode: 0, ctrlKey: true, clientX: 640, clientY: 400 });
snapshot(); stepFrames(60);
const r2 = sunPos()[2];
check('ctrl+scroll (pinch) → zooms', r2 < r1 * 0.5, `glow r ${r1.toFixed(0)} → ${r2.toFixed(0)}`);

// ---------- Test: today button = full reset ----------
for (const f of makeEl('speed-365').listeners['click'] ?? []) f();
stepFrames(300); // ≈ 1850 simulated days
const dateAfter = makeEl('sim-date').textContent;
for (const f of makeEl('speed-0').listeners['click'] ?? []) f(); // pause first
for (const f of makeEl('today-btn').listeners['click'] ?? []) f();
snapshot(); stepFrames(60);
const dateNow = makeEl('sim-date').textContent;
const sunBack = sunPos();
check('today: sim date returns to load date', dateAfter !== dateNow && dateNow === loadClock,
  `${dateAfter} → ${dateNow} (load: ${loadClock})`);
check('today: camera returns to home view', Math.abs(sunBack[0] - W / 2) < 8 && Math.abs(sunBack[1] - H / 2) < 8,
  `sun at (${sunBack[0].toFixed(0)}, ${sunBack[1].toFixed(0)})`);

// ---------- Test: click a planet to select ----------
// Sun is centered; Jupiter is at some screen pos — just verify a click on empty
// space deselects (panel hidden).
makeEl('panel').classList.remove('hidden');
fire(canvas, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 600 });
fire(canvas, 'pointerup', { pointerId: 2, clientX: 200, clientY: 600 });
snapshot(); stepFrames(2);
check('click on empty space → deselects', makeEl('panel').classList.contains('hidden'), 'panel hidden');

// ---------- Test: ⌂ home button = also a FULL reset (time + view) ----------
for (const f of makeEl('speed-365').listeners['click'] ?? []) f();
stepFrames(200); // ≈ 1180 simulated days
const dateBeforeHome = makeEl('sim-date').textContent;
for (const f of makeEl('speed-0').listeners['click'] ?? []) f(); // pause first
for (const f of makeEl('reset-btn').listeners['click'] ?? []) f();
stepFrames(60);
const d2 = windowStub.__ORBITA_DEBUG;
check('⌂: sim date returns to load date', dateBeforeHome !== loadClock && makeEl('sim-date').textContent === loadClock,
  `${dateBeforeHome} → ${makeEl('sim-date').textContent} (load: ${loadClock})`);
check('⌂: camera finite & back home', Number.isFinite(d2.cam.x) && Number.isFinite(d2.cam.zoom) && Math.abs(sunPos()[0] - W / 2) < 8,
  `sun.x=${sunPos()[0].toFixed(1)}`);

// ---------- Test: camera self-heals if it ever goes non-finite ----------
d2.cam.targetX = NaN; d2.cam.zoom = Infinity; // simulate a broken camera state
stepFrames(30);
const sp = sunPos();
check('broken camera (NaN/Inf) self-heals: Sun visible & finite',
  sp && Number.isFinite(sp[0]) && Number.isFinite(sp[1]) && sp[0] >= 0 && sp[0] <= W && sp[1] >= 0 && sp[1] <= H,
  `sun at (${sp[0]?.toFixed(0)}, ${sp[1]?.toFixed(0)})`);

// ---------- Summary ----------
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
