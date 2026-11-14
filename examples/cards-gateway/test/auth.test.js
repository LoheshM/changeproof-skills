import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authTimeoutMs, isTimedOut } from '../src/auth.js';
import { loadConfig } from '../src/config.js';

test('config has a valid auth timeout', () => assert.ok(authTimeoutMs() >= 1000));
test('rejects out-of-range timeouts', () => assert.throws(() => authTimeoutMs({ auth_timeout_ms: 50 })));
test('a slow APAC issuer answering in 4.5 s is not timed out', () => assert.equal(isTimedOut(4500), false));
test('config parses booleans', () => assert.equal(loadConfig().retry_on_timeout, false));
test('timeouts above the limit fire', () => assert.equal(isTimedOut(12000), true));
