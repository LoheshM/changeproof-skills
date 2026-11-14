# ChangeProof privacy policy

*Last updated: 14 November 2026*

ChangeProof is an Atlassian Forge app. It checks Jira changes against a change-management policy, enforces it at release time, and creates tamper-evident audit evidence in Confluence.

## What data the app accesses

When a user views an issue, a project page or a Confluence page with ChangeProof, asks the ChangeProof Rovo agent, calls a ChangeProof MCP tool, or moves an issue through a workflow that uses the ChangeProof release gate, the app reads the following through Atlassian's APIs:
- **Jira issue fields:** summary, description, status, priority, type, assignee, reporter, labels, fix versions (with release dates), due date, comments, issue links, remote links and the issue's change history.
- **Confluence pages** linked from those issues, and the version number of ChangeProof's own evidence pages.
- **Members of the approvers group**, if an admin configures one.
- **Jira Service Management approvals** (decision, date, approvers) on change requests linked to a change.

User-initiated requests run **as the signed-in user** (`asUser`), so the app sees only what that user can already see. Three parts have no user and run as the app:
- the workflow release gate;
- the release trigger, which captures a pack and posts the emergency notice;
- the daily snapshot job.

Group membership is also read as the app, and the JQL readiness property (below) is written by the app so it stays current for every viewer.

## What data the app stores

All of it is stored inside Atlassian, in your own site:
- **Site-wide records** (policy, policy change log, evidence ledger, exceptions register, erase log, daily counts) are Jira **Forge app properties**. Only the app can read or write them.
- **Per-issue records** (test runs, the release-gate log, deployments, the list of an issue's packs) are **issue properties** on that issue, and each pack's fingerprint is a **content property** on its Confluence page. People who can edit the issue or page could edit these, so every value is signed with a key only the app holds (HMAC-SHA256, bound to the issue or page and the record type). A value changed or copied outside ChangeProof fails the check: ChangeProof ignores it and shows an integrity alert to admins.
- The CI signing secret is in Forge's encrypted secret storage, and data from before the shared store existed may remain in Forge KVS.
- **Policy settings:** enabled checks, keywords, freeze windows, approvers group name, emergency label, monitored projects. Each evidence pack also stores a short **policy fingerprint** (a hash of these settings) so Verify can tell whether the policy changed later.
- **Evidence fingerprints:** for each evidence pack, a snapshot made of **hashes** (SHA-256) of comment bodies, the description, the summary and the assignee's account ID, plus comment IDs and times, labels, fix versions, link targets and check results. This lets ChangeProof detect later edits. The text of comments and descriptions is not stored, and account IDs are stored only as hashes. These are plain (unsalted) SHA-256 hashes, so they are pseudonymous rather than anonymous: someone who already knows an account ID can check whether it matches.
- **The evidence ledger:** one record per pack (issue key, page ID, time, hashes), chained by hash.
- **Test records:** suite, counts, command, commit SHA and CI link, plus who recorded them (account ID and display name) and whether they were self-reported. Recorded only when someone uses the record-test-evidence tool. The tool also posts a matching comment on the issue.
- **The exceptions register:** issue key, time, open gaps and review due date for emergency releases.
- **Integrity alerts:** when a stored record on an issue or page is changed outside ChangeProof, the time, where, what happened and, once an admin reviews it, the reviewing admin's account ID; up to 500 alerts.
- **Notes on the change:** for every test record and production deployment ChangeProof stores, it posts a comment on the issue (counts, commit, pipeline and a short reference) so a later deletion of the record can be detected.
- **Erase log:** when a test-site erase is used, the time, the account ID of the admin who erased, and the ledger position that was erased.
- **Release gate log:** for each change, the time and result of each gate run (blocked, passed or emergency exception), the names of the open checks and how many times a run repeated; up to 50 entries per change (emergency exceptions and the first block are always kept), plus the time the gate first ran on the site. No personal data.
- **Policy change log:** for each policy save that changed a rule (including turning the test-site erase switch on or off), the time, the admin's account ID and display name, the policy fingerprint before and after, and which settings changed; the last 200 changes. It is kept through a test-site erase. Only Jira administrators see who changed what; other users see a count.
- **Daily counts per monitored project:** numbers only, kept for 90 days.
- **CI test results and deployments (optional):** when an admin turns on CI-verified tests, a CI pipeline posts the issue key, suite name, test counts (or the deployment environment and time), commit SHA, CI run URL and pipeline name to ChangeProof's web trigger. Requests must be signed with a secret that is kept in Forge's encrypted secret storage; admins can replace or remove it at any time. Unsigned requests are refused and not stored.
- **Automatic binders (optional):** when an admin turns this on, releasing a Jira version writes that release's audit binder to Confluence. It contains the same information as a binder someone builds by hand, including an offline verification bundle (ledger hashes, the population's issue keys and the sample seed).

**Code evidence links** (repository, commit, pull request) are added as remote links on the issue when you or your coding agent ask for them.

**On each Jira issue**, ChangeProof stores a small `changeproof` property so you can search readiness in JQL: verdict, number of gaps, gap names, risk, number of packs and when the verdict last changed. People who can edit the issue can also edit this property, so it is a search convenience, not evidence. The release gate and Verify always re-check live.

Pages and comments ChangeProof creates are in *your* site:
- evidence packs, audit binders and release readiness reports in Confluence. **Evidence packs copy the issue's description, comment excerpts (first 200 characters) and linked-issue summaries** into the page, so readers of that space can see them. Packs go only to the space an admin chose or the space whose key matches the project. They never copy restricted comments (visible to a role or group only), Jira Service Management internal notes, or any text from issues with a security level. Packs captured automatically at release use the same rules. Packs also include the change's history: the names of the people who approved, edited or moved it, and the release-gate results (restricted comments leave no trace in it);
- rollback-plan drafts, added to an issue's description when you ask the agent for one, and marked as drafts until the owner confirms them;
- fix requests, approvals made with the panel button, and emergency notices in Jira.

You own and control them like any other page or comment.

ChangeProof makes **no outbound network calls** (its only inbound endpoint is the signed CI web trigger), uses no analytics or tracking of its own, and copies no issue or page content outside Atlassian. It runs entirely on Atlassian (Forge hosted compute and storage).

## Logs

Forge function logs may contain error messages, issue keys and evidence page URLs. They are kept in Atlassian's developer console according to Atlassian's retention policy. The app owner can see them only if your site shares logs.

## Personal data reporting

ChangeProof stores Atlassian account IDs only where an auditor needs attribution: who recorded a test run, who changed the policy, who erased a test site, who reviewed an integrity alert. Every week it reports those account IDs to Atlassian's personal data reporting API. When Atlassian says an account was closed, ChangeProof replaces its ID and name with "Former user (account closed)". Evidence snapshots hold only hashes of account IDs.

## Removing data

Admins can export everything ChangeProof stores as JSON from Getting started → Your data, for example before uninstalling. On a test site, an admin can erase ChangeProof's records from the policy page, after ticking "This is a test site" and typing ERASE. The erase leaves a tombstone (see "Erase log"), and the ledger then shows that it was restarted. On a production site, test records and the exceptions register are kept until the app is uninstalled. Uninstalling the app ends its access. Its Forge storage (KVS and app properties) is then handled under Atlassian's data retention policy for uninstalled apps. Issue and page properties stay on the issues and pages (they hold hashes, counts, CI links and account IDs, never comment or description text); a test-site erase removes them. Evidence pages, binders and comments stay in your site until you delete them.

## Contact

ChangeProof is built and supported by Lohesh M (individual developer). Questions or data requests: lohe1406@gmail.com.
