// The change under review in this sample: raise the card authorization timeout from 3 s to 6 s for slow APAC
// issuers. Run it on your branch, then commit, so the branch really carries the change.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../config/cards-gateway.yaml', import.meta.url);
const before = readFileSync(file, 'utf8');
const m = before.match(/^(auth_timeout_ms:[ \t]*)(\d+)/m); // works with LF and CRLF checkouts
if (!m) throw new Error('auth_timeout_ms not found in config/cards-gateway.yaml');
if (m[2] === '6000') {
  console.log('Already applied: auth_timeout_ms is 6000.');
} else {
  writeFileSync(file, before.replace(m[0], `${m[1]}6000`));
  console.log(`config/cards-gateway.yaml: auth_timeout_ms ${m[2]} -> 6000`);
}
