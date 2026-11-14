#!/usr/bin/env node
// Prints deterministic test counts from a test report, so an agent never has to estimate them.
// Supports JUnit XML (most runners, incl. `node --test --test-reporter=junit`) and Jest JSON (`jest --json`).
// Usage: node test-counts.mjs <report.xml|report.json>
// Output (JSON): {"format":"junit","passed":42,"failed":0,"skipped":1,"total":43}
import { readFileSync } from 'node:fs';

export function countJUnit(xml) {
  // Count <testcase> elements; a testcase is failed if it contains <failure> or <error>, skipped if <skipped>.
  const cases = xml.match(/<testcase\b[\s\S]*?(?:\/>|<\/testcase>)/g) || [];
  let failed = 0; let skipped = 0;
  for (const c of cases) {
    if (/<(failure|error)\b/.test(c)) failed += 1;
    else if (/<skipped\b/.test(c)) skipped += 1;
  }
  return { format: 'junit', passed: cases.length - failed - skipped, failed, skipped, total: cases.length };
}

export function countJest(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  const skipped = (j.numPendingTests || 0) + (j.numTodoTests || 0);
  return { format: 'jest', passed: j.numPassedTests || 0, failed: j.numFailedTests || 0, skipped, total: j.numTotalTests || 0 };
}

export function countReport(text) {
  const t = text.trim();
  if (t.startsWith('{')) return countJest(t);
  if (t.startsWith('<')) return countJUnit(t);
  throw new Error('Unrecognised report: expected JUnit XML or Jest JSON.');
}

if (process.argv[1] && process.argv[1].endsWith('test-counts.mjs')) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node test-counts.mjs <report.xml|report.json>'); process.exit(2); }
  console.log(JSON.stringify(countReport(readFileSync(file, 'utf8'))));
}
