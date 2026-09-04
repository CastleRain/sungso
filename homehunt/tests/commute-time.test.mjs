import test from 'node:test';
import assert from 'node:assert/strict';

import { nextWeekdaySearchDateTime } from '../scripts/commute-time.mjs';

const kstInstant = (year, month, day, hour, minute) => Date.UTC(year, month - 1, day, hour - 9, minute);

test('uses the same weekday when the requested departure is still ahead', () => {
  assert.equal(nextWeekdaySearchDateTime('08:00', kstInstant(2026, 9, 4, 7, 30)), '202609040800');
});

test('moves a passed Friday departure to Monday', () => {
  assert.equal(nextWeekdaySearchDateTime('08:00', kstInstant(2026, 9, 4, 8, 30)), '202609070800');
});

test('moves a weekend departure to Monday and defaults an empty time', () => {
  assert.equal(nextWeekdaySearchDateTime('', kstInstant(2026, 9, 6, 10, 0)), '202609070800');
});

test('rejects malformed or impossible departure times', () => {
  assert.equal(nextWeekdaySearchDateTime('8:00', kstInstant(2026, 9, 4, 7, 30)), null);
  assert.equal(nextWeekdaySearchDateTime('24:00', kstInstant(2026, 9, 4, 7, 30)), null);
  assert.equal(nextWeekdaySearchDateTime('08:60', kstInstant(2026, 9, 4, 7, 30)), null);
});
