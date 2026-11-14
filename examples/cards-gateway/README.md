# cards-gateway (sample repository for the release-guard skill)

A tiny card-authorization gateway, used in the ChangeProof demo video. Its only change raises `auth_timeout_ms`
from 3000 to 6000 for slow APAC issuers. Use it to try the `release-guard` skill against your own Jira site.

## Try it (about 5 minutes)

1. Create the demo changes in Jira (ChangeProof policy → Getting started → **Try it now**). Note the key of
   *"Increase card authorization timeout from 3s to 6s"*, e.g. `CPD-3`.
2. Copy this folder somewhere, then make the change on a branch named after that key (Node.js 18+):
   ```
   git init && git add . && git commit -m "cards-gateway sample"
   git checkout -b CPD-3-card-auth-timeout      # the branch names the Jira change
   node tools/make-change.mjs                   # the change under review: auth_timeout_ms 3000 -> 6000
   git commit -am "Raise card auth timeout to 6 s for slow APAC issuers"
   ```
3. Push the branch. The agent records a test run only for a commit that exists outside your laptop, so the
   recorded SHA matches what ships. Any GitHub repository you own works
   (`git remote add origin <https-url> && git push -u origin HEAD`). Just trying it out? A local bare
   repository works too: `git init --bare ../cards-gateway-origin.git && git remote add origin ../cards-gateway-origin.git && git push -u origin HEAD`
   (then there is no https URL, so the agent skips linking the commit).
4. Copy `release-guard/` from the root of this repository into `.claude/skills/` (Claude Code) or
   `.cursor/skills/` (Cursor), connect the ChangeProof MCP tools (see the main README), and ask:
   *"Is this branch ready to merge?"*

The agent runs `npm test` (counts parsed from `junit.xml`) and, once you agree, records the run on the change and
posts a rollback plan drafted from `config/cards-gateway.yaml` and the git history, for the change owner to
confirm in Jira. It never approves. `tools/ci-report.mjs` and `.github/workflows/changeproof.yml` show the
CI-verified route.
