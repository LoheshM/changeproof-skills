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
