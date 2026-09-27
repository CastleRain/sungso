import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSelection, selectedDates} from '../src/analysis.mjs';
import {ledgerSourceData} from '../src/ledger-scope.mjs';
import {periodMonths, recentPeriod, matchesPeriodPreset, adjacentPeriodMonth} from '../src/period-presets.mjs';
import {fixture} from './fixture.mjs';

test('recent calendar presets end at the latest complete archive date and clip at archive start', () => {
  const data = fixture(), before = JSON.stringify(data);
  assert.deepEqual(recentPeriod(data, 7), {mode:'range', range:['2026-04-09','2026-04-15']});
  assert.deepEqual(recentPeriod(data, 30), {mode:'range', range:['2026-03-17','2026-04-15']});
  assert.deepEqual(recentPeriod({...data,start:'2026-04-13'},30), {mode:'range',range:['2026-04-13','2026-04-15']});
  assert.deepEqual(recentPeriod({...data,end:'2026-04-10'},7), {mode:'range',range:['2026-04-04','2026-04-10']});
  assert.equal(recentPeriod({...data,complete_through:null},7),null);
  assert.equal(recentPeriod({...data,start:'2026-04-16'},7),null);
  assert.equal(JSON.stringify(data),before);
});

test('preset selection preserves partial-day choice and scope filtering rather than manufacturing dates', () => {
  const data = fixture(), scope = ledgerSourceData(data,'payhere');
  const selection = {...initialSelection(data), includePartial:false, ...recentPeriod(scope,30)};
  const dates = selectedDates(scope,selection);
  assert.ok(dates.length > 0);
  assert.ok(dates.every(date => scope.scopeDates.has(date)));
  assert.equal(selection.includePartial,false);
  assert.equal(matchesPeriodPreset(selection,recentPeriod(scope,30)),true);
  assert.equal(matchesPeriodPreset({...selection,mode:'multiple',dates},recentPeriod(scope,30)),false);
  assert.equal(matchesPeriodPreset(selection,null),false);
  assert.equal(matchesPeriodPreset({...selection,mode:'all'},{mode:'all'}),true);
  assert.equal(matchesPeriodPreset(initialSelection(data),{mode:'month',month:'2026-04'}),true);
});

test('month navigation skips unavailable months, remains bounded and uses source months', () => {
  const data = {start:'2024-12-20',end:'2025-04-03',monthly:[{month:'2024-12'},{month:'2025-02'},{month:'2025-02'}],daily:[{date:'2025-04-03'}]};
  const months = periodMonths(data);
  assert.deepEqual(months,['2024-12','2025-02','2025-04']);
  assert.equal(adjacentPeriodMonth(months,'2025-02',-1),'2024-12');
  assert.equal(adjacentPeriodMonth(months,'2025-02',1),'2025-04');
  assert.equal(adjacentPeriodMonth(months,'2025-03',-1),'2025-02');
  assert.equal(adjacentPeriodMonth(months,'2024-12',-1),null);
  assert.equal(adjacentPeriodMonth(months,'2025-04',1),null);
  const archived = ledgerSourceData(fixture(),'payhere');
  assert.deepEqual(periodMonths(archived),['2026-01']);
});
