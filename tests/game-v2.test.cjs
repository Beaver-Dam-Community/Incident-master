const test = require('node:test');
const assert = require('node:assert/strict');
const {Game, MATERIAL_ORDER, SITUATION_MS, ACTION_MS} = require('../dist/game-engine.js');
require('../dist/scenarios.js');
const {scenarios, groups} = globalThis.BOOTH_CONTENT;

const constantRandom = () => 0.31;
const setup = (catalog = scenarios, options = {}) => new Game(catalog, {random: constantRandom, ...options});

function completeTimedRound(game, getNow, setNow) {
  assert.equal(game.start(), true);
  setNow(getNow() + 100_000);
  game.advance();
  assert.equal(game.state.phase, 'finished');
  assert.equal(game.reveal(), true);
  assert.equal(game.state.phase, 'result');
  assert.equal(game.nextTeam(), true);
}

test('the engine and catalog expose five six-action cloud incidents', () => {
  assert.equal(scenarios.length, 5);
  assert.equal(new Set(scenarios.map(scenario => scenario.id)).size, 5);
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), 5);
  for (const scenario of scenarios) {
    assert.equal(scenario.steps.length, MATERIAL_ORDER.length, scenario.id);
    assert.deepEqual(scenario.recipe, scenario.steps.map(step => step.id), scenario.id);
  }
});

test('drawing assigns all six materials and shuffles action cards separately from the answer', () => {
  const game = setup();
  const scenario = game.draw();
  assert.ok(scenario);
  assert.equal(game.state.phase, 'ready');
  assert.deepEqual(Object.values(game.state.materialByStep).sort(), [...MATERIAL_ORDER].sort());
  assert.deepEqual([...game.state.actionOrder].sort(), scenario.steps.map(step => step.id).sort());
  assert.notDeepEqual(game.state.actionOrder, scenario.recipe);
  assert.deepEqual(game.round.actions.map(step => step.id), game.state.actionOrder);
  assert.deepEqual(game.round.recipe.map(step => step.id), scenario.recipe);
  assert.deepEqual(game.round.recipe.map(step => step.token), scenario.recipe.map(id => game.state.materialByStep[id]));
});

test('each stage uses the intended 10-second and 50-second limits with curtain transitions', () => {
  let now = 50_000;
  const game = setup(scenarios, {now: () => now, curtainCloseMs: 400, curtainOpenMs: 400});
  game.draw();
  assert.equal(game.start(), true);
  assert.equal(game.state.phase, 'situation');
  assert.equal(game.remainingSeconds, 10);
  now += SITUATION_MS - 1;
  assert.equal(game.advance(), false);
  assert.equal(game.remainingSeconds, 1);
  now += 1;
  assert.equal(game.advance(), true);
  assert.equal(game.state.phase, 'curtain-close');
  assert.equal(game.reveal(), false);
  now += 400;
  game.advance();
  assert.equal(game.state.phase, 'curtain-open');
  now += 400;
  game.advance();
  assert.equal(game.state.phase, 'actions');
  assert.equal(game.remainingSeconds, 50);
  assert.equal(game.state.phaseEndsAt, now + ACTION_MS);
  now += ACTION_MS - 1;
  assert.equal(game.advance(), false);
  assert.equal(game.remainingSeconds, 1);
  now += 1;
  game.advance();
  assert.equal(game.state.phase, 'finished');
  assert.equal(game.remainingSeconds, null);
  assert.equal(game.reveal(), true);
  assert.equal(game.state.phase, 'result');
});

test('scenario shuffle bag avoids repeats until all five incidents have appeared', () => {
  let now = 0;
  const game = setup(scenarios, {now: () => now, curtainCloseMs: 0, curtainOpenMs: 0});
  let previous = null;
  for (let cycle = 0; cycle < 4; cycle += 1) {
    const seen = new Set();
    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = game.draw();
      assert.notEqual(scenario.id, previous);
      assert.ok(!seen.has(scenario.id));
      seen.add(scenario.id);
      previous = scenario.id;
      completeTimedRound(game, () => now, value => { now = value; });
    }
    assert.equal(seen.size, scenarios.length);
  }
});

test('a repeated scenario gets a different material map and a different card order', () => {
  let now = 10_000;
  const game = setup([scenarios[0]], {now: () => now});
  game.draw();
  const firstMap = {...game.state.materialByStep};
  const firstOrder = [...game.state.actionOrder];
  completeTimedRound(game, () => now, value => { now = value; });
  game.draw();
  assert.notDeepEqual(game.state.materialByStep, firstMap);
  assert.notDeepEqual(game.state.actionOrder, firstOrder);
});

test('the current shuffle and timed phase survive reload without revealing the answer', () => {
  let now = 20_000;
  const game = setup(scenarios, {now: () => now});
  game.draw();
  game.start();
  const savedSituation = JSON.parse(JSON.stringify(game.snapshot()));
  const restoredSituation = setup(scenarios, {now: () => now, snapshot: savedSituation});
  assert.deepEqual(restoredSituation.state, game.state);
  assert.deepEqual(restoredSituation.round, game.round);
  assert.equal(restoredSituation.state.phase, 'situation');
  assert.equal(restoredSituation.reveal(), false);

  now += SITUATION_MS;
  restoredSituation.advance();
  now += 1_000;
  restoredSituation.advance();
  const savedActions = JSON.parse(JSON.stringify(restoredSituation.snapshot()));
  const restoredActions = setup(scenarios, {now: () => now, snapshot: savedActions});
  assert.deepEqual(restoredActions.state, restoredSituation.state);
  assert.deepEqual(restoredActions.round, restoredSituation.round);
  assert.equal(restoredActions.state.phase, 'actions');
});

test('only the explicit answer button can reveal the answer after the timer ends', () => {
  let now = 0;
  const game = setup(scenarios, {now: () => now, curtainCloseMs: 0, curtainOpenMs: 0});
  assert.equal(game.reveal(), false);
  game.draw();
  assert.equal(game.reveal(), false);
  game.start();
  assert.equal(game.state.phase, 'situation');
  assert.equal(game.reveal(), false);
  now += SITUATION_MS;
  game.advance();
  assert.equal(game.state.phase, 'actions');
  assert.equal(game.reveal(), false);
  now += ACTION_MS;
  game.advance();
  assert.equal(game.state.phase, 'finished');
  assert.equal(game.reveal(), true);
  assert.equal(game.reveal(), false);
  assert.equal(game.nextTeam(), true);
  assert.equal(game.state.phase, 'home');
});

test('scenario groups can only change between teams and cannot be empty', () => {
  const game = setup();
  assert.equal(game.setPool([]), false);
  assert.equal(game.setPool(['unknown']), false);
  assert.equal(game.setPool(['cloud']), true);
  game.draw();
  assert.equal(game.setPool(['cloud']), false);
});

test('invalid and legacy snapshots safely return to the home screen', () => {
  const invalid = setup(scenarios, {snapshot: {version: 4, state: {phase: 'actions', scenarioId: 'unknown'}}});
  assert.equal(invalid.state.phase, 'home');
  const malformed = setup(scenarios, {snapshot: {version: 4, state: {phase: 'result', scenarioId: scenarios[0].id, outcome: 'revealed', materialByStep: {bad: 'tomato'}, actionOrder: []}}});
  assert.equal(malformed.state.phase, 'home');
  const old = setup(scenarios, {snapshot: {version: 3, state: {phase: 'playing', scenarioId: 'BASIC-01'}}});
  assert.equal(old.state.phase, 'home');
});

test('an expired saved timer advances to the correct stage after reload', () => {
  let now = 1_000;
  const game = setup(scenarios, {now: () => now, curtainCloseMs: 0, curtainOpenMs: 0});
  game.draw();
  game.start();
  now += SITUATION_MS;
  game.advance();
  const snapshot = JSON.parse(JSON.stringify(game.snapshot()));
  now += ACTION_MS;
  const restored = setup(scenarios, {now: () => now, curtainCloseMs: 0, curtainOpenMs: 0, snapshot});
  restored.advance();
  assert.equal(restored.state.phase, 'finished');
});

test('the host can end the situation or action stage early without revealing the answer', () => {
  let now = 10_000;
  const game = setup(scenarios, {now: () => now, curtainCloseMs: 400, curtainOpenMs: 400});
  assert.equal(game.skip(), false);
  game.draw();
  assert.equal(game.skip(), false);
  game.start();
  now += 2_000;
  assert.equal(game.skip(), true);
  assert.equal(game.state.phase, 'curtain-close');
  assert.equal(game.skip(), false);
  now += 800;
  game.advance();
  assert.equal(game.state.phase, 'actions');
  assert.equal(game.remainingSeconds, ACTION_MS / 1000);
  now += 5_000;
  assert.equal(game.skip(), true);
  assert.equal(game.state.phase, 'finished');
  assert.equal(game.state.finishedAt, now);
  assert.equal(game.state.outcome, null);
  assert.equal(game.skip(), false);
  assert.equal(game.reveal(), true);
});
