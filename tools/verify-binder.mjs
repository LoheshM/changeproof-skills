#!/usr/bin/env node
// Verify a ChangeProof audit binder WITHOUT trusting ChangeProof.
//
//   node tools/verify-binder.mjs bundle.json
//
// bundle.json is the "ChangeProof verification bundle" code block at the end of an audit binder page.
// Node.js only: no dependencies, no network. It independently recomputes:
//   1. every ledger record's SHA-256 hash and its link to the previous record (tamper evidence);
//   2. the population fingerprint from the population key list (completeness of what was sampled from);
//   3. the seeded sample, from the seed and the population (the sample wasn't hand-picked).
// Exit code 0 = everything verified; 1 = something did not match; 2 = bad input.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(String(s ?? ''), 'utf8').digest('hex');
const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
};
const recordHash = (r) => sha256(canonical({ seq: r.seq, issueKey: r.issueKey, pageId: r.pageId, generatedAt: r.generatedAt, snapshotHash: r.snapshotHash, prevHash: r.prevHash }));

// Seeded sampling, exactly as documented on the binder page.
const fnv1a = (seed) => { let h = 2166136261; for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const byKey = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
export function drawSample(keys, size, seed) {
  const pool = [...new Set(keys)].sort(byKey);
  const rand = mulberry32(fnv1a(seed));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, Math.min(size, pool.length))).sort(byKey);
}

export function verifyBundle(b) {
  const results = [];
  const ok = (name, pass, detail) => results.push({ name, pass, detail });

  // 1. Ledger: each record's own hash, and each link to the record before it.
  const recs = [...(b.ledger || [])].sort((x, y) => x.seq - y.seq);
  let chainOk = true;
  let reason = `${recs.length} record(s), every hash and link recomputed`;
  for (let i = 0; i < recs.length && chainOk; i++) {
    const r = recs[i];
    if (recordHash(r) !== r.hash) { chainOk = false; reason = `record #${r.seq} was altered (its hash doesn't match its content)`; }
    else if (i > 0 && recs[i - 1].seq !== r.seq - 1) { chainOk = false; reason = `record #${recs[i - 1].seq + 1} is missing`; }
    else if (i > 0 && r.prevHash !== recs[i - 1].hash) { chainOk = false; reason = `record #${r.seq} doesn't link to record #${recs[i - 1].seq}`; }
  }
  if (recs.length && recs[0].seq === 1 && recs[0].prevHash !== 'GENESIS') { chainOk = false; reason = 'record #1 doesn\'t start the chain'; }
  ok('Ledger chain', chainOk, recs.length ? reason : 'no ledger records in the bundle');

  // 2. Population fingerprint.
  const keys = b.population?.keys || [];
  const fp = sha256([...keys].sort().join('\n')).slice(0, 16);
  ok('Population fingerprint', fp === b.population?.fingerprint, `${keys.length} key(s) → ${fp} (binder says ${b.population?.fingerprint})`);

  // 3. Seeded sample.
  const redrawn = drawSample(keys, b.sample?.size, b.sample?.seed);
  const claimed = [...(b.sample?.keys || [])].sort(byKey);
  const same = redrawn.length === claimed.length && redrawn.every((k, i) => k === claimed[i]);
  ok('Seeded sample', same, `seed "${b.sample?.seed}", size ${b.sample?.size} → ${redrawn.join(', ') || '(empty)'}${same ? '' : ` (binder says ${claimed.join(', ')})`}`);

  return { pass: results.every((r) => r.pass), results };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/').replace(/^(?!\/)/, '/')}` || process.argv[1]?.endsWith('verify-binder.mjs')) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node tools/verify-binder.mjs bundle.json'); process.exit(2); }
  let bundle;
  try { bundle = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`Could not read ${file}: ${e.message}`); process.exit(2); }
  if (bundle.format !== 'changeproof-binder-bundle/1') { console.error('Not a ChangeProof verification bundle (format changeproof-binder-bundle/1).'); process.exit(2); }
  const v = verifyBundle(bundle);
  console.log(`ChangeProof binder verification · ${bundle.query || ''}`);
  for (const r of v.results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}: ${r.detail}`);
  console.log(v.pass ? 'VERIFIED: the binder matches its own evidence.' : 'NOT VERIFIED: see the failures above.');
  process.exit(v.pass ? 0 : 1);
}
