const test = require('node:test');
const assert = require('node:assert/strict');
const reference = require('../compiled-source-reference.json');
require('../dist/scenarios.js');
const cards = globalThis.BOOTH_CONTENT.scenarios;

test('all compiled titles and alphabet codes match the supplied document', () => {
  assert.equal(cards.length, 19);
  assert.deepEqual(cards.map(s=>[s.code,s.id,s.title]), reference.map(s=>[s.code,s.id,s.title]));
  assert.deepEqual(cards.map(s=>s.code), 'ABCDEFGHIJKLMNOPQRS'.split(''));
});

test('the 15 independent-piece document answers, actions, and alternatives are preserved', () => {
  for (const row of reference.filter(s=>!s.id.startsWith('AI-'))) {
    const card = cards.find(s=>s.id===row.id);
    assert.deepEqual(card.recipe,row.recipe,row.code);
    assert.deepEqual(card.accepted,[row.recipe,...row.accepted],row.code);
    for (const step of card.steps) {
      if (row.id==='BASIC-05' && step.token==='meat') assert.match(step.label,/증거 확보 후/);
      else assert.equal(step.label,row.materials[step.token],row.code+' '+step.token);
    }
  }
});

test('the three corrected answers replace the former unsafe orders', () => {
  const get=id=>cards.find(s=>s.id===id).recipe;
  assert.deepEqual(get('BASIC-01'),['meat','pepper','shrimp','cheese','bacon','tomato']);
  assert.deepEqual(get('BASIC-03'),['meat','cheese','shrimp','bacon','pepper','tomato']);
  assert.deepEqual(get('BASIC-05'),['bacon','tomato','cheese','meat','pepper','shrimp']);
});

test('AI wrapper conditions remain standalone pieces, with development-only work in S', () => {
  const ai=cards.filter(s=>s.group==='ai');
  assert.deepEqual(ai.map(s=>s.recipe.length),[5,4,6,5]);
  assert.deepEqual(ai[2].recipe,['pepper','bacon','shrimp','tomato','cheese','meat']);
  assert.deepEqual(ai[3].recipe,['tomato','pepper','cheese','bacon','meat']);
  assert.match(ai[3].steps.find(s=>s.token==='meat').label,/개발 환경/);
  for(const s of cards){
    for(const step of s.steps) assert.doesNotMatch(step.label,/감쌈|감쌀 재료/);
    for(const token of s.unused) assert.ok(s.unusedReasons[token],s.code+' '+token);
  }
});
