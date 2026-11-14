// Reads config/cards-gateway.yaml (tiny parser for the keys we use).
import { readFileSync } from 'node:fs';
export function loadConfig(path = new URL('../config/cards-gateway.yaml', import.meta.url)) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([a-z_]+):\s*([^#\s{][^#]*)$/);
    if (m) out[m[1]] = /^\d+$/.test(m[2].trim()) ? Number(m[2].trim()) : m[2].trim() === 'true' ? true : m[2].trim() === 'false' ? false : m[2].trim();
  }
  return out;
}
