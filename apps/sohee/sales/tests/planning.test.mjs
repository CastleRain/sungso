import test from 'node:test';import assert from 'node:assert/strict';
import {distribute,planRow,deadline} from '../src/planning.mjs';
test('low-volume time rounding never invents extra daily stock',()=>{assert.deepEqual(distribute([.3,.3,.3,.1],1),[1,0,0,0]);assert.equal(distribute([1,2,3,4],17).reduce((a,b)=>a+b),17)});
test('zero manual production stays zero, buffer and 4-packs are explicit',()=>{const p={expected:3.4,hours:Array(24).fill(1),unit:'팩(4개)'};assert.equal(planRow(p,30,0).target,0);const r=planRow(p,30);assert.equal(r.target,4);assert.equal(r.physical,16);assert.equal(r.windows.reduce((a,b)=>a+b),4)});
test('deadline handles overnight but preserves user input minutes',()=>{assert.equal(deadline(10,90),'08:30');assert.equal(deadline(0,60),'전날 23:00')});
