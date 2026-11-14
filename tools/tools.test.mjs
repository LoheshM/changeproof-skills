// Tests for the two command-line tools. Run: node --test tools/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { verifyBundle, drawSample } from './verify-binder.mjs';
import { countReport, keyFromBranch, sign } from './ci-report.mjs';

const sample = () => JSON.parse(readFileSync(new URL('./examples/sample-bundle.json', import.meta.url), 'utf8'));

test('verify-binder: the example bundle (made by ChangeProof) verifies', () => {
  const v = verifyBundle(sample());
  assert.equal(v.pass, true, JSON.stringify(v.results));
});

test('verify-binder: an edited ledger record is caught', () => {
  const b = sample(); b.ledger[0].issueKey = 'PAY-99';
  assert.equal(verifyBundle(b).results[0].pass, false);
});

test('verify-binder: a removed ledger record is caught', () => {
  const b = sample(); b.ledger.splice(1, 1);
  assert.equal(verifyBundle(b).results[0].pass, false);
});

test('verify-binder: a population with a change left out is caught', () => {
  const b = sample(); b.population.keys = b.population.keys.slice(1);
  assert.equal(verifyBundle(b).results[1].pass, false);
});

test('verify-binder: a hand-picked sample is caught', () => {
  const b = sample();
  const other = b.population.keys.filter((k) => !b.sample.keys.includes(k)).slice(0, b.sample.keys.length);
  b.sample.keys = other;
  assert.equal(verifyBundle(b).results[2].pass, false);
});

test('verify-binder: the same seed always draws the same sample', () => {
  const keys = ['A-1', 'A-2', 'A-3', 'A-4', 'A-5'];
  assert.deepEqual(drawSample(keys, 2, 'x'), drawSample([...keys].reverse(), 2, 'x'));
});

test('ci-report: counts come from the report, never from a person', () => {
  assert.deepEqual(countReport('<testsuites><testcase name="a"/><testcase name="b"><failure/></testcase><testcase name="c"><skipped/></testcase></testsuites>'), { passed: 1, failed: 1, skipped: 1 });
  assert.deepEqual(countReport('{"numPassedTests":5,"numFailedTests":0,"numPendingTests":1}'), { passed: 5, failed: 0, skipped: 1 });
});

test('ci-report: the Jira key comes from the branch name', () => {
  assert.equal(keyFromBranch('pay-3-card-auth-timeout'), 'PAY-3');
  assert.equal(keyFromBranch('feature/FIN-42_x'), 'FIN-42');
});

test('ci-report: the signature is HMAC-SHA256 of the exact body', () => {
  const body = '{"issueKey":"PAY-3"}';
  assert.equal(sign(body, 'k'), `sha256=${createHmac('sha256', 'k').update(body).digest('hex')}`);
});

// ---------- round 18: chain heads and a stricter report parser ----------
const withHead = () => {
  const b = sample();
  const recs = [...b.ledger].sort((x, y) => x.seq - y.seq);
  return { ...b, head: { seq: recs[recs.length - 1].seq, hash: recs[recs.length - 1].hash }, count: recs.length };
};

test('verify-binder: a bundle with its chain head verifies', () => {
  assert.equal(verifyBundle(withHead()).pass, true);
});

test('verify-binder: records cut off the end, or an emptied ledger, fail against the head', () => {
  const cut = withHead();
  cut.ledger = [...cut.ledger].sort((x, y) => x.seq - y.seq).slice(0, -1);
  assert.equal(verifyBundle(cut).pass, false);
  const empty = withHead();
  empty.ledger = [];
  assert.equal(verifyBundle(empty).pass, false);
});

test('verify-binder: an old bundle without a head still verifies, with a note to compare the head in Jira', () => {
  const v = verifyBundle(sample());
  assert.equal(v.pass, true);
  assert.ok(v.results.some((r) => r.warning && /predates chain heads/.test(r.detail)));
});

test('ci-report: crashed test files, "/>" in names, suite-level errors and commented-out cases are counted right', () => {
  assert.equal(countReport(JSON.stringify({ success: false, numPassedTests: 40, numFailedTests: 0, numRuntimeErrorTestSuites: 1 })).failed, 1);
  assert.equal(countReport('<testsuite><testcase name="renders a/>b"><failure message="boom"/></testcase></testsuite>').failed, 1);
  assert.equal(countReport('<testsuites><testsuite name="db" errors="1"></testsuite><testsuite><testcase name="ok"/></testsuite></testsuites>').failed, 1);
  assert.deepEqual(countReport('<testsuite><!-- <testcase name="placeholder"/> --></testsuite>'), { passed: 0, failed: 0, skipped: 0 });
  assert.deepEqual(countReport('<testsuite failures="1"><testcase name="a"/><testcase name="b"><failure/></testcase><testcase name="c"><skipped/></testcase></testsuite>'), { passed: 1, failed: 1, skipped: 1 });
});

test('verify-binder: a signed bundle verifies against its site key, and any edit or another key fails', async () => {
  const { generateKeyPairSync, sign } = await import('node:crypto');
  const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v ?? null));
  const pair = () => { const k = generateKeyPairSync('ed25519'); return { k, pub: k.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64') }; };
  const site = pair();
  const signWith = (b, p) => ({ ...b, signature: { alg: 'Ed25519', publicKey: p.pub, value: sign(null, Buffer.from(canon(b)), p.k.privateKey).toString('base64') } });
  const signed = signWith(sample(), site);
  const sig = (v) => v.results.find((r) => r.name === 'Signature');
  assert.equal(verifyBundle(signed, { key: site.pub }).pass, true);
  const edited = { ...signed, query: 'something else' };
  assert.equal(verifyBundle(edited, { key: site.pub }).pass, false);
  assert.match(sig(verifyBundle(edited)).detail, /edited after it was signed/);
  assert.equal(verifyBundle(signWith(sample(), pair()), { key: site.pub }).pass, false, 'signed by another key');
  assert.equal(sig(verifyBundle(sample())).warning, true, 'unsigned bundles still verify, with a note');
});
