#!/usr/bin/env node
// Verify a ChangeProof audit binder WITHOUT trusting ChangeProof.
//
//   node tools/verify-binder.mjs bundle.json [--key <site public key>]
//
// bundle.json is the "ChangeProof verification bundle" code block at the end of an audit binder page.
// Node.js only: no dependencies, no network. It independently recomputes:
//   1. every ledger record's SHA-256 hash and its link to the previous record (tamper evidence);
//   2. the population fingerprint from the population key list (completeness of what was sampled from);
//   3. the seeded sample, from the seed and the population (the sample wasn't hand-picked);
//   4. the site's Ed25519 signature over the whole bundle (with --key: that it came from that site, unedited).
// Exit code 0 = everything verified; 1 = something did not match; 2 = bad input.
import { readFileSync } from 'node:fs';
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';

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

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const keyIdOf = (pub) => createHash('sha256').update(Buffer.from(pub, 'base64')).digest('hex').slice(0, 16);

/** Ed25519 signature over the canonical JSON of the bundle without its signature field. */
export function checkSignature(b, expectedKey = null) {
  const sig = b.signature;
  if (!sig) {
    return expectedKey
      ? { pass: false, detail: 'the bundle is not signed, but a site key was given' }
      : { pass: true, warning: true, detail: 'unsigned bundle (made before binders were signed): the checks above still hold' };
  }
  if (sig.alg !== 'Ed25519' || typeof sig.publicKey !== 'string' || typeof sig.value !== 'string') return { pass: false, detail: 'unknown or malformed signature' };
  const { signature, ...unsigned } = b;
  let valid = false;
  try {
    const raw = Buffer.from(sig.publicKey, 'base64');
    if (raw.length !== 32) throw new Error('bad key');
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
    valid = cryptoVerify(null, Buffer.from(canonical(unsigned), 'utf8'), key, Buffer.from(sig.value, 'base64'));
  } catch { valid = false; }
  const id = keyIdOf(sig.publicKey);
  if (!valid) return { pass: false, detail: `the signature does not match the bundle (key ID ${id}): the bundle was edited after it was signed` };
  if (expectedKey) {
    const same = String(expectedKey).trim() === sig.publicKey || String(expectedKey).trim().toLowerCase() === id;
    return same ? { pass: true, detail: `signed by the site key you gave (key ID ${id})` } : { pass: false, detail: `signed by key ID ${id}, not the site key you gave (key ID ${/^[0-9a-f]{16}$/i.test(String(expectedKey).trim()) ? String(expectedKey).trim().toLowerCase() : keyIdOf(String(expectedKey).trim())})` };
  }
  return { pass: true, warning: true, detail: `valid signature by key ID ${id}; pass --key with the public key from Jira (ChangeProof policy → Getting started) to confirm it is your site's` };
}

export function verifyBundle(b, { key = null } = {}) {
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
  // Bundles from November 2026 on carry the chain head and the record count: the chain must start at #1, be
  // complete, and end exactly at that head (so records cut off the end or a shortened, re-chained ledger fail).
  if (chainOk && b.head !== undefined) {
    const last = recs[recs.length - 1];
    if (!b.head) { if (recs.length) { chainOk = false; reason = 'the bundle says the ledger is empty but contains records'; } }
    else if (!recs.length) { chainOk = false; reason = `the ledger is empty but its head is #${b.head.seq}`; }
    else if (recs[0].seq !== 1) { chainOk = false; reason = `the ledger starts at #${recs[0].seq}, not #1`; }
    else if (last.seq !== b.head.seq || last.hash !== b.head.hash) { chainOk = false; reason = `the ledger ends at #${last.seq}, not at its head #${b.head.seq}`; }
    else if (recs.length !== b.count) { chainOk = false; reason = `${recs.length} record(s), but the bundle says ${b.count}`; }
    if (chainOk) reason += `; ends at head #${b.head.seq} ${String(b.head.hash).slice(0, 16)}`;
  }
  ok('Ledger chain', chainOk, recs.length ? reason : (chainOk ? 'no ledger records in the bundle' : reason));

  // 2. Population fingerprint.
  const keys = b.population?.keys || [];
  const fp = sha256([...keys].sort().join('\n')).slice(0, 16);
  ok('Population fingerprint', fp === b.population?.fingerprint, `${keys.length} key(s) → ${fp} (binder says ${b.population?.fingerprint})`);

  // 3. Seeded sample.
  const redrawn = drawSample(keys, b.sample?.size, b.sample?.seed);
  const claimed = [...(b.sample?.keys || [])].sort(byKey);
  const same = redrawn.length === claimed.length && redrawn.every((k, i) => k === claimed[i]);
  ok('Seeded sample', same, `seed "${b.sample?.seed}", size ${b.sample?.size} → ${redrawn.join(', ') || '(empty)'}${same ? '' : ` (binder says ${claimed.join(', ')})`}`);

  // Older bundles (no head) are still checked as before, with a note on what to compare by hand.
  if (b.head === undefined && recs.length) results.push({ name: 'Chain head', pass: true, warning: true, detail: 'this bundle predates chain heads: compare the last record\'s hash with the ledger head shown in Jira' });
  // 4. Signature (bundles from round 20 on). Placed last so older result positions stay the same.
  results.push({ name: 'Signature', ...checkSignature(b, key) });
  return { pass: results.every((r) => r.pass), results };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/').replace(/^(?!\/)/, '/')}` || process.argv[1]?.endsWith('verify-binder.mjs')) {
  const args = process.argv.slice(2);
  const ki = args.indexOf('--key');
  const key = ki >= 0 ? args[ki + 1] : null;
  const file = args.find((a, i) => !a.startsWith('--') && (ki < 0 || i !== ki + 1));
  if (!file || (ki >= 0 && !key)) { console.error('Usage: node tools/verify-binder.mjs bundle.json [--key <site public key>]'); process.exit(2); }
  let bundle;
  try { bundle = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`Could not read ${file}: ${e.message}`); process.exit(2); }
  if (bundle.format !== 'changeproof-binder-bundle/1') { console.error('Not a ChangeProof verification bundle (format changeproof-binder-bundle/1).'); process.exit(2); }
  const v = verifyBundle(bundle, { key });
  console.log(`ChangeProof binder verification · ${bundle.query || ''}`);
  for (const r of v.results) console.log(`${r.warning ? 'NOTE' : r.pass ? 'PASS' : 'FAIL'}  ${r.name}: ${r.detail}`);
  console.log(v.pass ? 'VERIFIED: the binder matches its own evidence.' : 'NOT VERIFIED: see the failures above.');
  if (v.pass && bundle.head) console.log(`Chain head #${bundle.head.seq} ${String(bundle.head.hash).slice(0, 16)}: it should match the ledger head on the binder page and in Verify in Jira.`);
  process.exit(v.pass ? 0 : 1);
}
