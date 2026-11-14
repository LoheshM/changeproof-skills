// Authorization call with a configurable timeout.
import { loadConfig } from './config.js';
export function authTimeoutMs(cfg = loadConfig()) {
  const t = cfg.auth_timeout_ms;
  if (!Number.isInteger(t) || t < 1000 || t > 10000) throw new Error('auth_timeout_ms must be 1000..10000');
  return t;
}
export function isTimedOut(elapsedMs, cfg = loadConfig()) {
  return elapsedMs > authTimeoutMs(cfg);
}
