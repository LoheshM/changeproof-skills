# cards-gateway (sample repository for the release-guard skill)

A tiny card-authorization gateway, used in the ChangeProof demo video. Its only change raises `auth_timeout_ms`
from 3000 to 6000 for slow APAC issuers. Use it to try the `release-guard` skill against your own Jira site.

## Try it (about 5 minutes)

1. Create a demo change in Jira (ChangeProof policy → Getting started → **Try it now**). Note one key, e.g. `CPD-3`.
2. Copy this folder somewhere, then:
   ```
   git init && git add . && git commit -m "cards-gateway sample"
   git checkout -b CPD-3-card-auth-timeout      # the branch names the Jira change
   npm test                                     # writes junit.xml; Node.js 18+
   ```
3. Optional, for "tests ran on this exact commit": push it to any GitHub repository you own
   (`git remote add origin <url> && git push -u origin HEAD`).
4. Copy `release-guard/` from the root of this repository into `.claude/skills/` (Claude Code) or
   `.cursor/skills/` (Cursor), connect the ChangeProof MCP tools (see the main README), and ask:
   *"Is this branch ready to merge?"*

The agent records the real test run (counts parsed from `junit.xml`), drafts a rollback plan from
`config/cards-gateway.yaml` for the change owner to confirm, and refuses to approve. `tools/ci-report.mjs` and
`.github/workflows/changeproof.yml` show the CI-verified route.
