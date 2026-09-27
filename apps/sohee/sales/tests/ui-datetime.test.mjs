import test from 'node:test';
import assert from 'node:assert/strict';
import {toLocalMinute} from '../src/ui-datetime.mjs';
test('picker preserves Korea wall-clock date and minute without applying host timezone',()=>{
  assert.equal(toLocalMinute('2026-05-02 00:30:59'),'2026-05-02T00:30');
  assert.equal(toLocalMinute('2026-05-02T23:59'),'2026-05-02T23:59');
  assert.equal(toLocalMinute(null),'');
  assert.equal(toLocalMinute('2026-05-02T00:30:00Z'),'');
});
