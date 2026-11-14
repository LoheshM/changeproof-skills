# ChangeProof agent skills

Open [Agent Skills](https://agentskills.io) (the `SKILL.md` format) for **ChangeProof**, a Forge app for Jira and Confluence that checks every production change against your change-control policy (independent approval, test evidence, rollback plan, documentation, release traceability) and proves it with tamper-evident evidence packs.

The skills use ChangeProof's tools from the Atlassian MCP server, so a coding agent (Claude Code, Cursor and others) can check a change before it ships, and close the gaps it legitimately can.

## `release-guard`

Before a pull request is opened, merged or shipped, this skill:
- finds the Jira change behind the branch and asks ChangeProof what is missing;
- closes the gaps an agent may legitimately close:
  - records the **real** test run (counts parsed from the JUnit or Jest report, the command and the commit SHA; never estimated);
  - drafts a rollback plan grounded in the repository's code and config, which counts only after the change owner confirms it in Jira;
  - links the commit or pull request to the change;
- checks the change again and reports what is still missing.

It never approves anything and never fakes evidence: approvals, confirming drafts and releasing through the gate stay with people.

## Install

1. **Copy the skill**
   - Claude Code: copy `release-guard/` into `.claude/skills/` (per project) or `~/.claude/skills/`.
   - Cursor: copy it into `.cursor/skills/` or `.agents/skills/` (Cursor also reads `.claude/skills/`).
2. **Connect the tools.** A Jira admin enables Tools for ChangeProof in admin.atlassian.com → Connected apps. Then:
   ```
   claude mcp add --transport http changeproof https://mcp.atlassian.com/forge/872ce7fc-ddc9-4dcf-b58a-19fca5a48a6e
   ```
   and run `/mcp` to sign in.
3. **Try it.** On a branch named after a Jira issue (for example `PAY-3-card-auth-timeout`), ask *"Is this branch ready to merge?"*.

## What's here

| Path | What it is |
|---|---|
| `release-guard/SKILL.md` | The skill: when to use it, the steps, and the rules it follows |
| `release-guard/scripts/test-counts.mjs` | Reads JUnit XML or Jest JSON reports and returns exact passed / failed / skipped counts (Node.js 18+, no dependencies) |
| `release-guard/scripts/test-counts.test.mjs` | Its tests: `node --test release-guard/scripts/` |

## Licence

Apache-2.0. The ChangeProof app itself is not part of this repository.
