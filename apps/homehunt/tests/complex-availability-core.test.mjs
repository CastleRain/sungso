import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyComplexFailure, describeComplexAvailability } from '../js/complex-availability-core.mjs';

test('a disabled or missing endpoint is explained as not deployed', () => {
  assert.equal(classifyComplexFailure({ apiEnabled: false }), 'not-deployed');
  assert.equal(classifyComplexFailure({ status: 404 }), 'not-deployed');
  assert.match(describeComplexAvailability('not-deployed').message, /단지 정보는 정상/);
});

test('network conditions are separated into actionable states', () => {
  assert.equal(classifyComplexFailure({ online: false }), 'offline');
  assert.equal(classifyComplexFailure({ errorName: 'AbortError' }), 'timeout');
  assert.equal(classifyComplexFailure({ status: 429 }), 'rate-limited');
  assert.equal(classifyComplexFailure({ status: 500 }), 'unavailable');
});

test('range-contract and partial failures keep actionable recovery copy', () => {
  assert.match(describeComplexAvailability('outdated-client').message, /다시 시작/);
  assert.match(describeComplexAvailability('partial').message, /덮어쓰지 않습니다/);
});
