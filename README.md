# ChangeProof agent skills and tools

Open [Agent Skills](https://agentskills.io) (the `SKILL.md` format) and command-line tools for **ChangeProof**, a Forge app for Jira and Confluence that checks every production change against your change-control policy (independent approval, test evidence, rollback plan, documentation, release traceability) and proves it with tamper-evident evidence packs.

The skills use ChangeProof's tools from the Atlassian MCP server ([setup](#setup-the-skill-works-through-changeproofs-mcp-server)), so a coding agent (Claude Code, Cursor and others) can check a change before it ships, and close the gaps it legitimately can.

**Demo video (3 min):** https://youtu.be/iVDbA4CVwsU · **Install the app (Jira + Confluence):** https://loheshm.github.io/changeproof

## `release-guard`

Before a pull request is opened, merged or shipped, this skill:
- finds the Jira change behind the branch and asks ChangeProof what is missing;
- closes the gaps an agent may legitimately close:
  - records the **real** test run (counts parsed from the JUnit or Jest report, the command and the commit SHA; never estimated);
  - drafts a rollback plan grounded in the repository's code and config, which counts only after the change owner confirms it in Jira;
  - links the commit or pull request to the change;
- checks the change again and reports what is still missing.

It never approves anything and never fakes evidence: approvals, confirming drafts and releasing through the gate stay with people.

## Setup: the skill works through ChangeProof's MCP server

`release-guard` is an instruction file for your coding agent; it has no code of its own that talks to Jira. Every
check and every write goes through **ChangeProof's tools on the Atlassian MCP server** (`explain-gaps`,
`record-test-evidence`, `get-draft-sources`, `add-evidence-draft`, `link-code-evidence`, `find-change-collisions` and
more: 16 tools). Without that connection the skill can't do anything, so set up all four parts:

1. **The ChangeProof app** is installed on your Atlassian site, in Jira **and** Confluence:
   https://loheshm.github.io/changeproof
2. **MCP is turned on for ChangeProof** (once per site, by an admin): admin.atlassian.com → your organization →
   Apps → Connected apps (or Sites and apps) → ChangeProof → enable **Tools**.
3. **Your agent is connected to the MCP server**:
   - Claude Code:
     ```
     claude mcp add --transport http changeproof https://mcp.atlassian.com/forge/872ce7fc-ddc9-4dcf-b58a-19fca5a48a6e
     ```
     then run `/mcp`, choose `changeproof` and sign in with your Atlassian account, approving the access it asks for.
   - Cursor: add it to `.cursor/mcp.json` (or Settings → MCP), then sign in when Cursor prompts:
     ```json
     { "mcpServers": { "changeproof": { "url": "https://mcp.atlassian.com/forge/872ce7fc-ddc9-4dcf-b58a-19fca5a48a6e" } } }
     ```
   - Check: ask the agent *"List the ChangeProof tools"*. You should see `explain-gaps` among them. New tools can take a
     few minutes to appear after an app update.
4. **The skill is in place**:
   - Claude Code: copy `release-guard/` into `.claude/skills/` (per project) or `~/.claude/skills/`.
   - Cursor: copy it into `.cursor/skills/` or `.agents/skills/` (Cursor also reads `.claude/skills/`).

**Try it.** On a branch named after a Jira issue (for example `PAY-3-card-auth-timeout`), ask *"Is this branch ready
to merge?"*. No repository handy? [`examples/cards-gateway`](examples/cards-gateway) is the sample from the demo
video, with the steps.

The tools run as **you**, with your Jira permissions, and everything they write is visible to auditors. The skill
asks before its first write in a session.

## Command-line tools (Node.js 18+, no dependencies, no network)

### `tools/verify-binder.mjs`: check an audit binder without trusting ChangeProof

Every ChangeProof audit binder page ends with a **verification bundle** (a JSON block). An auditor copies it into `bundle.json` and runs:

```
node tools/verify-binder.mjs bundle.json
```

It recomputes, independently of the app:
1. every evidence-ledger record's SHA-256 hash and its link to the previous record (an edited or removed record is caught);
2. the population fingerprint from the list of changes (a change left out of the population is caught);
3. the seeded sample (a hand-picked sample is caught).

Exit code 0 = verified, 1 = something didn't match, 2 = bad input. Try it on `tools/examples/sample-bundle.json`.

What VERIFIED means: the bundle is consistent with itself (every hash, link, the population and the sample
recompute), and the ledger runs from record #1 to the chain head the bundle names. Compare that head with the one
on the binder page and in **Verify** in Jira: a bundle cut short or re-chained can't keep the same head.

### `tools/ci-report.mjs`: CI-verified test evidence

Run it in your pipeline after the tests. It reads the test report (JUnit XML or Jest JSON), signs the result with HMAC-SHA256, and posts it to ChangeProof's web trigger, so test evidence is CI-verified instead of self-reported. A Jira admin gets the URL and the secret in ChangeProof → Getting started → CI-verified test results.

```
CHANGEPROOF_URL=<web trigger URL> CHANGEPROOF_SECRET=<secret> \
  node tools/ci-report.mjs --suite unit --report junit.xml [--issue PAY-3]
node tools/ci-report.mjs --deployment production [--issue PAY-3]
```

The Jira key comes from `--issue`, or from the branch name (`pay-3-card-timeout` → `PAY-3`).

What "CI-verified" proves: the result was signed by a pipeline that holds your site's secret, with counts read from
the real report (a crashed test file or a suite-level error counts as a failure). Keep the secret in protected CI
settings, and use protected branches and environment protection rules, so only your pipelines can sign.

GitHub Actions step:

```yaml
- name: Report tests to ChangeProof
  if: always()
  env:
    CHANGEPROOF_URL: ${{ secrets.CHANGEPROOF_URL }}
    CHANGEPROOF_SECRET: ${{ secrets.CHANGEPROOF_SECRET }}
  run: node tools/ci-report.mjs --suite unit --report junit.xml --pipeline "GitHub Actions"
```

## What's here

| Path | What it is |
|---|---|
| `release-guard/SKILL.md` | The skill: when to use it, the steps, and the rules it follows |
| `release-guard/scripts/test-counts.mjs` | Reads JUnit XML or Jest JSON reports and returns exact passed / failed / skipped counts (Node.js 18+, no dependencies) |
| `release-guard/scripts/test-counts.test.mjs` | Its tests |
| `tools/verify-binder.mjs` | Offline audit-binder verifier |
| `tools/ci-report.mjs` | Signed CI test and deployment reporter |
| `tools/examples/sample-bundle.json` | A verification bundle made by ChangeProof, to try the verifier on |
| `tools/tools.test.mjs` | Tests for both tools |
| `examples/cards-gateway/` | The sample repository from the demo video, to try the skill on |

Run all tests with `npm test` (or `node --test "tools/*.test.mjs" "release-guard/scripts/*.test.mjs"`).

## Privacy

The ChangeProof app's privacy policy: [PRIVACY.md](PRIVACY.md).

## Licence

Apache-2.0. The ChangeProof app itself is not part of this repository.
