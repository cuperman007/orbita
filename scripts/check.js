#!/usr/bin/env node
/* ORBITA — static site checks for CI.
 * 1. Every local asset referenced in index.html exists.
 * 2. All JavaScript files pass `node --check`.
 * 3. Planetary data is well-formed (loaded in a VM sandbox).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
let failures = 0;

function fail(msg) {
  failures++;
  console.error(`  ✗ ${msg}`);
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

console.log('ORBITA checks');

// 1 — asset references
console.log('\n[1] index.html asset references');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:|data:|mailto:)/.test(u));
if (refs.length === 0) fail('no local asset references found — expected some');
for (const ref of refs) {
  const p = path.join(root, ref);
  fs.existsSync(p) ? ok(ref) : fail(`missing referenced file: ${ref}`);
}

// 2 — JS syntax
console.log('\n[2] JavaScript syntax (node --check)');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(p, out);
    } else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const jsFiles = walk(root);
if (jsFiles.length === 0) fail('no JS files found');
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    ok(path.relative(root, f));
  } catch (err) {
    fail(`${path.relative(root, f)}: ${err.stderr?.toString().trim() || err.message}`);
  }
}

// 3 — data shape
console.log('\n[3] planetary data');
const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
try {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8'), sandbox, { filename: 'data.js' });
} catch (err) {
  fail(`data.js did not execute: ${err.message}`);
}
const data = sandbox.window.ORBITA_DATA;
if (data) {
  const { PLANETS, COMETS, QUIZ } = data;
  const ids = new Set(PLANETS.map((p) => p.id));
  ids.size === PLANETS.length ? ok(`${PLANETS.length} planets, unique ids`) : fail('duplicate planet ids');

  for (const p of PLANETS) {
    const bad = [
      (!Number.isFinite(p.radiusKm) || p.radiusKm <= 0) && 'radiusKm',
      (!Number.isFinite(p.orbitAU) || p.orbitAU <= 0) && 'orbitAU',
      (!Number.isFinite(p.periodDays) || p.periodDays <= 0) && 'periodDays',
      (!Number.isFinite(p.ecc) || p.ecc < 0 || p.ecc >= 1) && 'ecc',
      !Number.isFinite(p.L0) && 'L0',
      !Number.isFinite(p.varpi) && 'varpi',
      !p.blurb?.length && 'blurb',
      !Number.isFinite(p.tempC) && 'tempC',
    ].filter(Boolean);
    bad.length ? fail(`${p.id}: ${bad.join(', ')}`) : ok(`${p.id} fields valid (incl. J2000 elements)`);
    for (const m of p.moonsList ?? []) {
      if (!m.name || !Number.isFinite(m.periodDays) || m.periodDays === 0) fail(`${p.id} moon ${m.name ?? '?'}: bad period`);
    }
  }
  const aus = PLANETS.map((p) => p.orbitAU);
  (aus.every((v, i) => i === 0 || v > aus[i - 1])) ? ok('orbits in increasing AU order') : fail('orbital order broken');

  for (const c of COMETS) {
    c.aAU > 0 && c.e > 0 && c.e < 1 && Number.isFinite(c.periodDays)
      ? ok(`comet ${c.id} valid (e=${c.e})`)
      : fail(`comet ${c.id}: bad orbital elements`);
  }

  if (QUIZ.length < 5) fail(`quiz pool too small (${QUIZ.length})`);
  else ok(`quiz pool: ${QUIZ.length} questions`);
  QUIZ.forEach((q, i) => {
    if (!Array.isArray(q.a) || q.a.length < 2 || !Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.a.length) {
      fail(`quiz ${i + 1}: malformed question`);
    }
    if (!q.why?.length) fail(`quiz ${i + 1}: missing explanation`);
  });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
