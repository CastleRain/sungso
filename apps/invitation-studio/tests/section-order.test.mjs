import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeAroundAnchor } from '../js/section-order.mjs';
import { DEFAULT_ORDER } from '../js/composition.mjs';

function fixture(nativeMove) {
  const moved = [], parent = { children: [] };
  const nodes = new Map(['hero', ...DEFAULT_ORDER, 'footer'].map(id => [id, { id, parentNode: parent, state: { selection: id } }]));
  parent.children = [...nodes.values()];
  for (const node of nodes.values()) Object.defineProperty(node, 'nextElementSibling', { get: () => parent.children[parent.children.indexOf(node) + 1] || null });
  parent.insertBefore = (node, before) => {
    moved.push(node.id);
    parent.children.splice(parent.children.indexOf(node), 1);
    parent.children.splice(parent.children.indexOf(before), 0, node);
  };
  if (nativeMove) parent.moveBefore = parent.insertBefore;
  return { parent, nodes, moved };
}
function* permutations(list) {
  if (!list.length) { yield []; return; }
  for (let i = 0; i < list.length; i++) for (const rest of permutations(list.filter((_, index) => i !== index))) yield [list[i], ...rest];
}
for (const nativeMove of [false, true]) test(`all section permutations preserve live nodes, cover/footer and stationary map (${nativeMove ? 'native' : 'fallback'})`, () => {
  const f = fixture(nativeMove), original = new Map([...f.nodes].map(([id, node]) => [id, node.state]));
  for (const order of permutations(DEFAULT_ORDER)) {
    arrangeAroundAnchor(f.parent, order.map(id => f.nodes.get(id)), f.nodes.get('location'), f.nodes.get('footer'));
    assert.deepEqual(f.parent.children.map(node => node.id), ['hero', ...order, 'footer']);
    for (const node of f.parent.children) assert.equal(node.state, original.get(node.id));
  }
  assert.equal(f.moved.includes('location'), false);
  assert.equal(f.moved.includes('hero'), false); assert.equal(f.moved.includes('footer'), false);
  const moves = f.moved.length;
  arrangeAroundAnchor(f.parent, f.parent.children.slice(1, -1), f.nodes.get('location'), f.nodes.get('footer'));
  assert.equal(f.moved.length, moves, 'unchanged order never detaches content');
});
