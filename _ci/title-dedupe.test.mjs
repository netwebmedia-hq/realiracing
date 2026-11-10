// node --test _ci/title-dedupe.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { compareTitles, findDuplicate } = createRequire(import.meta.url)('../_deploy/lib/title-dedupe.js');

test('exact normalised match', () => {
  assert.equal(compareTitles('Motion Rigs for iRacing: What They Add & What They Cost', 'motion rigs for iracing what they add and what they cost'), 'exact');
});
test('near match and distinct titles', () => {
  assert.equal(compareTitles('Endurance Racing Fuel and Tire Strategy Basics', 'Endurance Racing Fuel and Tire Strategy'), 'near');
  assert.equal(compareTitles('Best Budget Load Cell Pedals', 'Heel-Toe Braking Technique'), null);
});
test('findDuplicate returns the matching entry', () => {
  const d = findDuplicate('Pedal Spacing and Angle Setup', [{ where: 'a', title: 'Other' }, { where: 'b', title: 'Pedal Spacing and Angle Setup' }]);
  assert.equal(d.of.where, 'b');
});
