import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeSyntheticTravel, makeSyntheticResorts } from './couple-qa/reference-fixtures.mjs';
const dateOffset = index => new Date(Date.UTC(2030, 0, index + 1)).toISOString().slice(0, 10);

test('synthetic travel fixture satisfies static entrypoint selectors across all eight views', async () => {
  const travel = makeSyntheticTravel(dateOffset);
  const paths = ['app.mjs', 'budget.mjs', 'readiness.mjs'];
  const sources = await Promise.all(paths.map(name => readFile(new URL(`../../apps/travel/${name}`, import.meta.url), 'utf8')));
  // Modules create the budget/readiness controls; the fixture must provide all
  // remaining document IDs used before or during subscription callbacks.
  const markup = travel.bodyHtml + sources.join('\n');
  const emitted = new Set([...markup.matchAll(/\bid=["']([\w-]+)["']/g)].map(match => match[1]));
  const requested = new Set(sources.flatMap(source => [...source.matchAll(/\$\(['"]#([\w-]+)(?:['"]|[\s.[])/g)].map(match => match[1])));
  for (const id of requested) assert.ok(emitted.has(id), `Missing fixture/generated DOM ID ${id}`);
  assert.equal((travel.bodyHtml.match(/data-travel-view=/g) || []).length, 8);
  assert.ok(travel.bodyHtml.includes('id="travel-budget-summary"'));
  assert.ok(travel.reference.TRIP_DAYS.length >= 6);
  for (const day of travel.reference.TRIP_DAYS) assert.ok(travel.reference.TRAVEL_LOCATIONS[day.date]);
});

test('synthetic resort detail fixture has iterable lists and scored price/location fields', () => {
  const { RESORTS } = makeSyntheticResorts();
  assert.equal(RESORTS.length, 4);
  for (const resort of RESORTS) {
    for (const key of ['image_urls', 'youtube_ids', 'pdfs', 'pros', 'cons']) assert.ok(Array.isArray(resort[key]), key);
    for (const key of ['lagoon', 'underwater', 'privacy', 'dining']) assert.ok(Number.isFinite(resort.ratings[key]), key);
    assert.ok(['최상', '중간', '단순'].includes(resort.honeymoon_tier));
    assert.ok(Number.isFinite(resort.coords.lat) && Number.isFinite(resort.coords.lon));
    assert.ok(Object.values(resort.agencies).every(agency => Number.isFinite(agency.water_pool_4n)));
  }
});
