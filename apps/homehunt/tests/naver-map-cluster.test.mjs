import test from 'node:test';
import assert from 'node:assert/strict';

import { HomeMap } from '../js/naver-map.js';

function candidate(id, lat, lng) {
  return { catalogId: id, name: `단지 ${id}`, lat, lng, bestArea: { averagePriceManWon: 90000 } };
}

test('낮은 줌에서는 가까운 후보를 숫자 원 하나로 묶고 확대하면 개별 후보로 푼다', () => {
  const map = new HomeMap('test-client');
  map.clusterEnabled = true;
  map.candidateRecords = [
    candidate('a', 37.5010, 127.0310),
    candidate('b', 37.5012, 127.0312),
    candidate('c', 37.6200, 127.1200),
  ];

  map.map = { getZoom: () => 12 };
  const overview = map.candidateGroups();
  assert.equal(overview.length, 2);
  assert.equal(overview.some((group) => group.records.length === 2), true);

  map.map = { getZoom: () => 16 };
  const detail = map.candidateGroups();
  assert.equal(detail.length, 3);
  assert.deepEqual(detail.map((group) => group.records.length), [1, 1, 1]);
});

test('좌표가 완전히 같은 후보는 최대 확대에서도 같은 위치 숫자 원으로 유지한다', () => {
  const map = new HomeMap('test-client');
  map.clusterEnabled = true;
  map.map = { getZoom: () => 18 };
  map.candidateRecords = [candidate('a', 37.5, 127.03), candidate('b', 37.5, 127.03)];

  const groups = map.candidateGroups();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].records.length, 2);
});
