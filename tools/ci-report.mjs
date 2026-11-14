#!/usr/bin/env node
// Post a CI test run to ChangeProof as CI-verified evidence (signed with HMAC-SHA256). Node.js only, no dependencies.
//
//   CHANGEPROOF_URL=<web trigger URL> CHANGEPROOF_SECRET=<secret> \
//   node tools/ci-report.mjs --suite unit --report junit.xml [--issue PAY-3] [--pipeline "GitHub Actions"]
//   node tools/ci-report.mjs --deployment production [--issue PAY-3]      (after deploying: approvals must precede it)
//
// The Jira key comes from --issue, else from the branch name (GITHUB_HEAD_REF / GITHUB_REF_NAME / git), e.g.
// "pay-3-card-timeout" → PAY-3. Counts come from the report (JUnit XML or Jest JSON), never from a person.
// Exit code 0 = recorded (or already recorded); 1 = refused or failed.
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';

const arg = (name, fallback = '') => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

export function countReport(text) {
  const t = String(text).trim();
  if (t.startsWith('{')) {
    const j = JSON.parse(t);
    // A test file that crashed before running its tests is a failure, even if no single test failed.
    let failed = (j.numFailedTests || 0) + (j.numRuntimeErrorTestSuites || 0);
    if (j.success === false && failed < 1) failed = 1;
    return { passed: j.numPassedTests || 0, failed, skipped: (j.numPendingTests || 0) + (j.numTodoTests || 0) };
  }
  // JUnit XML: ignore comments and CDATA (a "<testcase>" inside them is not a test), read each <testcase> element by
  // its tags (an attribute value may contain "/>"), and never report fewer failures than the suites declare.
  const x = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const open = /<testcase\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let cases = 0; let failed = 0; let skipped = 0; let m;
  while ((m = open.exec(x))) {
    cases += 1;
    if (m[2] === '/') continue; // <testcase .../> has no children: it passed
    const close = x.indexOf('</testcase>', open.lastIndex);
    const body = x.slice(open.lastIndex, close < 0 ? x.length : close);
    if (/<(failure|error)\b/.test(body)) failed += 1;
    else if (/<skipped\b/.test(body)) skipped += 1;
  }
  let declared = 0;
  const suite = /<testsuite\b((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
  while ((m = suite.exec(x))) {
    const attr = (name) => Number((m[1].match(new RegExp(`\\b${name}\\s*=\\s*["'](\\d+)["']`)) || [])[1] || 0);
    declared += attr('failures') + attr('errors');
  }
  return { passed: Math.max(0, cases - failed - skipped), failed: Math.max(failed, declared), skipped };
}

export const keyFromBranch = (branch) => {
  const m = String(branch || '').match(/([A-Za-z][A-Za-z0-9]{1,9})-(\d+)/);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : '';
};

export const sign = (body, secret) => `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

async function main() {
  const url = process.env.CHANGEPROOF_URL;
  const secret = process.env.CHANGEPROOF_SECRET;
  if (!url || !secret) { console.error('Set CHANGEPROOF_URL and CHANGEPROOF_SECRET (from ChangeProof → Getting started → CI-verified test results).'); process.exit(1); }
  const deployment = arg('deployment');
  const reportFile = arg('report') || arg('junit');
  if (!reportFile && !deployment) { console.error('Pass --report <junit.xml|jest.json> (test results) or --deployment <environment>'); process.exit(1); }
  const counts = reportFile ? countReport(readFileSync(reportFile, 'utf8')) : null;
  const issueKey = arg('issue') || keyFromBranch(process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git('rev-parse --abbrev-ref HEAD'));
  if (!issueKey) { console.error('No Jira key: pass --issue PAY-3 or name the branch after the issue.'); process.exit(1); }
  const commitSha = process.env.GITHUB_SHA || git('rev-parse HEAD');
  const ciUrl = arg('ci-url') || (process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '');
  const body = deployment ? JSON.stringify({
    type: 'deployment', issueKey, environment: deployment, commitSha, ciUrl, deployedAt: new Date().toISOString(),
    pipeline: arg('pipeline', process.env.GITHUB_WORKFLOW ? `GitHub Actions: ${process.env.GITHUB_WORKFLOW}` : 'CI pipeline'),
  }) : JSON.stringify({
    issueKey, suite: arg('suite', 'tests'), ...counts, commitSha, ciUrl,
    command: arg('command', 'CI pipeline'), pipeline: arg('pipeline', process.env.GITHUB_WORKFLOW ? `GitHub Actions: ${process.env.GITHUB_WORKFLOW}` : 'CI pipeline'),
  });
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ChangeProof-Signature': sign(body, secret) }, body });
  const text = await res.text();
  console.log(`ChangeProof: HTTP ${res.status} ${text} · ${issueKey} ${deployment ? `deployed to ${deployment}` : `${counts.passed} passed, ${counts.failed} failed`} @${commitSha.slice(0, 7)}`);
  process.exit(res.ok ? 0 : 1);
}

if (process.argv[1]?.endsWith('ci-report.mjs')) main().catch((e) => { console.error(e.message); process.exit(1); });
