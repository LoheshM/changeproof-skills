// R20: the release-guard skill's deterministic test-count parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countJUnit, countJest, countReport } from './test-counts.mjs';

test('JUnit: passed, failed (failure or error) and skipped testcases', () => {
  const xml = `<testsuites><testsuite name="a" tests="4">
    <testcase name="ok1" time="0.1"/>
    <testcase name="ok2"></testcase>
    <testcase name="bad"><failure message="x">trace</failure></testcase>
    <testcase name="boom"><error message="y"/></testcase>
    <testcase name="later"><skipped/></testcase>
  </testsuite></testsuites>`;
  assert.deepEqual(countJUnit(xml), { format: 'junit', passed: 2, failed: 2, skipped: 1, total: 5 });
});

test('Jest JSON: pending and todo count as skipped', () => {
  assert.deepEqual(countJest({ numPassedTests: 42, numFailedTests: 0, numPendingTests: 1, numTodoTests: 1, numTotalTests: 44 }), { format: 'jest', passed: 42, failed: 0, skipped: 2, total: 44 });
});

test('format is detected; garbage is rejected', () => {
  assert.equal(countReport('<testsuites/>').format, 'junit');
  assert.equal(countReport('{"numPassedTests":1}').format, 'jest');
  assert.throws(() => countReport('PASS all good'), /Unrecognised report/);
});
