(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BoothGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MATERIAL_ORDER = Object.freeze(['tomato', 'pepper', 'meat', 'shrimp', 'cheese', 'bacon']);
  const PHASES = ['home', 'ready', 'situation', 'curtain-close', 'curtain-open', 'actions', 'finished', 'result'];
  const SITUATION_MS = 10_000;
  const ACTION_MS = 50_000;
  const DEFAULT_CURTAIN_MS = 430;

  function randomValue() {
    try {
      const source = globalThis.crypto;
      if (source && typeof source.getRandomValues === 'function') {
        const values = new Uint32Array(1);
        source.getRandomValues(values);
        return values[0] / 0x1_0000_0000;
      }
    } catch (_) {}
    return Math.random();
  }

  function shuffle(items, random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const value = Number(random());
      const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
      const other = Math.floor(safeValue * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function sameArray(left, right) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function permutation(values, expected) {
    return Array.isArray(values) && values.length === expected.length &&
      new Set(values).size === expected.length && expected.every(value => values.includes(value));
  }

  class Game {
    constructor(catalog, options = {}) {
      this.catalog = catalog;
      this.random = typeof options.random === 'function' ? options.random : randomValue;
      this.now = typeof options.now === 'function' ? options.now : Date.now;
      this.curtainCloseMs = Math.max(0, Number(options.curtainCloseMs ?? DEFAULT_CURTAIN_MS));
      this.curtainOpenMs = Math.max(0, Number(options.curtainOpenMs ?? DEFAULT_CURTAIN_MS));
      this.bag = [];
      this.lastId = null;
      this.lastRounds = {};
      this.pool = [...new Set(catalog.map(scenario => scenario.group))];
      this.state = this.freshState();
      if (options.snapshot) this.restore(options.snapshot);
    }

    freshState() {
      return {
        phase: 'home', scenarioId: null, outcome: null,
        startedAt: null, phaseEndsAt: null, finishedAt: null,
        materialByStep: null, actionOrder: null
      };
    }

    get scenario() {
      return this.catalog.find(scenario => scenario.id === this.state.scenarioId) || null;
    }

    get eligible() {
      return this.catalog.filter(scenario => this.pool.includes(scenario.group));
    }

    get remainingSeconds() {
      if (!['situation', 'actions'].includes(this.state.phase) || !Number.isFinite(this.state.phaseEndsAt)) return null;
      return Math.max(0, Math.ceil((this.state.phaseEndsAt - this.now()) / 1000));
    }

    get round() {
      const scenario = this.scenario;
      if (!scenario || !this.state.materialByStep || !this.state.actionOrder) return null;
      const byId = new Map(scenario.steps.map(step => [step.id, step]));
      const attachMaterial = id => {
        const step = byId.get(id);
        const token = this.state.materialByStep[id];
        return step && MATERIAL_ORDER.includes(token) ? {...step, token} : null;
      };
      const actions = this.state.actionOrder.map(attachMaterial);
      const recipe = scenario.recipe.map(attachMaterial);
      if (actions.some(step => !step) || recipe.some(step => !step)) return null;
      return {
        actions,
        recipe,
        accepted: scenario.accepted.map(order => order.map(attachMaterial))
      };
    }

    setPool(groups) {
      if (this.state.phase !== 'home') return false;
      const valid = [...new Set(groups)].filter(group => this.catalog.some(scenario => scenario.group === group));
      if (!valid.length) return false;
      this.pool = valid;
      this.bag = [];
      return true;
    }

    refill() {
      this.bag = shuffle(this.eligible.map(scenario => scenario.id), this.random);
      if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.lastId) {
        [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1], this.bag[0]];
      }
    }

    makeRound(scenario) {
      const stepIds = scenario.steps.map(step => step.id);
      const previous = this.lastRounds[scenario.id];
      const tokens = shuffle(MATERIAL_ORDER, this.random);
      const materialByStep = Object.fromEntries(stepIds.map((id, index) => [id, tokens[index]]));
      let actionOrder = shuffle(stepIds, this.random);

      // A repeated scenario always gets a visibly different mapping and card order.
      if (previous && stepIds.length > 1) {
        const previousTokens = stepIds.map(id => previous.materialByStep[id]);
        const currentTokens = stepIds.map(id => materialByStep[id]);
        if (sameArray(currentTokens, previousTokens)) {
          [materialByStep[stepIds[0]], materialByStep[stepIds[1]]] = [materialByStep[stepIds[1]], materialByStep[stepIds[0]]];
        }
        if (sameArray(actionOrder, previous.actionOrder)) {
          [actionOrder[0], actionOrder[1]] = [actionOrder[1], actionOrder[0]];
        }
      }
      return {materialByStep, actionOrder};
    }

    draw() {
      if (this.state.phase !== 'home') return false;
      if (!this.bag.length) this.refill();
      const id = this.bag.pop();
      const scenario = this.catalog.find(item => item.id === id);
      if (!scenario) return false;
      this.lastId = id;
      const round = this.makeRound(scenario);
      this.lastRounds[id] = {
        materialByStep: {...round.materialByStep},
        actionOrder: [...round.actionOrder]
      };
      this.state = {
        ...this.freshState(), phase: 'ready', scenarioId: id,
        materialByStep: round.materialByStep, actionOrder: round.actionOrder
      };
      return scenario;
    }

    start() {
      if (this.state.phase !== 'ready') return false;
      const startedAt = this.now();
      this.state.phase = 'situation';
      this.state.startedAt = startedAt;
      this.state.phaseEndsAt = startedAt + SITUATION_MS;
      return true;
    }

    advance() {
      let changed = false;
      let transitions = 0;
      const now = this.now();
      while (this.state.phaseEndsAt !== null && now >= this.state.phaseEndsAt && transitions < 5) {
        const transitionAt = this.state.phaseEndsAt;
        transitions += 1;
        changed = true;
        if (this.state.phase === 'situation') {
          this.state.phase = 'curtain-close';
          this.state.phaseEndsAt = transitionAt + this.curtainCloseMs;
        } else if (this.state.phase === 'curtain-close') {
          this.state.phase = 'curtain-open';
          this.state.phaseEndsAt = transitionAt + this.curtainOpenMs;
        } else if (this.state.phase === 'curtain-open') {
          this.state.phase = 'actions';
          this.state.phaseEndsAt = transitionAt + ACTION_MS;
        } else if (this.state.phase === 'actions') {
          this.state.phase = 'finished';
          this.state.phaseEndsAt = null;
          this.state.finishedAt = transitionAt;
        } else {
          this.state.phaseEndsAt = null;
        }
      }
      return changed;
    }

    // Host ends the current timed stage early: situation → curtain → actions, actions → finished.
    skip() {
      if (!['situation', 'actions'].includes(this.state.phase)) return false;
      this.state.phaseEndsAt = Math.min(this.state.phaseEndsAt, this.now());
      return this.advance();
    }

    reveal() {
      if (this.state.phase !== 'finished') return false;
      this.state.phase = 'result';
      this.state.outcome = 'revealed';
      return true;
    }

    nextTeam() {
      if (this.state.phase !== 'result') return false;
      this.state = this.freshState();
      return true;
    }

    snapshot() {
      return {
        version: 4,
        pool: [...this.pool],
        bag: [...this.bag],
        lastId: this.lastId,
        lastRounds: JSON.parse(JSON.stringify(this.lastRounds)),
        state: {
          ...this.state,
          materialByStep: this.state.materialByStep ? {...this.state.materialByStep} : null,
          actionOrder: this.state.actionOrder ? [...this.state.actionOrder] : null
        }
      };
    }

    restore(data) {
      try {
        if (!data || data.version !== 4) return;
        const knownGroups = [...new Set(this.catalog.map(scenario => scenario.group))];
        const pool = Array.isArray(data.pool) ? [...new Set(data.pool)].filter(group => knownGroups.includes(group)) : [];
        if (pool.length) this.pool = pool;
        const eligibleIds = new Set(this.eligible.map(scenario => scenario.id));
        this.bag = Array.isArray(data.bag) ? [...new Set(data.bag)].filter(id => eligibleIds.has(id)) : [];
        this.lastId = this.catalog.some(scenario => scenario.id === data.lastId) ? data.lastId : null;

        if (data.lastRounds && typeof data.lastRounds === 'object' && !Array.isArray(data.lastRounds)) {
          for (const scenario of this.catalog) {
            const previous = data.lastRounds[scenario.id];
            const ids = scenario.steps.map(step => step.id);
            const mapping = previous?.materialByStep;
            const order = previous?.actionOrder;
            const validMapping = mapping && typeof mapping === 'object' && !Array.isArray(mapping) &&
              Object.keys(mapping).length === ids.length && ids.every(id => Object.hasOwn(mapping, id)) &&
              permutation(ids.map(id => mapping[id]), MATERIAL_ORDER);
            if (validMapping && permutation(order, ids)) {
              this.lastRounds[scenario.id] = {materialByStep: Object.fromEntries(ids.map(id => [id, mapping[id]])), actionOrder: [...order]};
            }
          }
        }

        const saved = data.state;
        if (!saved || !PHASES.includes(saved.phase) || saved.phase === 'home') return;
        const scenario = this.catalog.find(item => item.id === saved.scenarioId);
        if (!scenario || saved.phase === 'ready') return;
        const ids = scenario.steps.map(step => step.id);
        const mapping = saved.materialByStep;
        const validMapping = mapping && typeof mapping === 'object' && !Array.isArray(mapping) &&
          Object.keys(mapping).length === ids.length && ids.every(id => Object.hasOwn(mapping, id)) &&
          permutation(ids.map(id => mapping[id]), MATERIAL_ORDER);
        if (!validMapping || !permutation(saved.actionOrder, ids)) return;
        const timerPhases = ['situation', 'curtain-close', 'curtain-open', 'actions'];
        if (timerPhases.includes(saved.phase) && !Number.isFinite(saved.phaseEndsAt)) return;
        if (saved.phase === 'finished' && !Number.isFinite(saved.finishedAt)) return;
        if (saved.phase === 'result' && saved.outcome !== 'revealed') return;

        const startedAt = Number.isFinite(saved.startedAt) && saved.startedAt >= 0 ? saved.startedAt : this.now();
        const finishedAt = saved.phase === 'finished' || saved.phase === 'result'
          ? (Number.isFinite(saved.finishedAt) && saved.finishedAt >= startedAt ? saved.finishedAt : startedAt)
          : null;
        this.state = {
          ...this.freshState(),
          phase: saved.phase,
          scenarioId: scenario.id,
          outcome: saved.phase === 'result' ? 'revealed' : null,
          startedAt,
          phaseEndsAt: timerPhases.includes(saved.phase) ? saved.phaseEndsAt : null,
          finishedAt,
          materialByStep: Object.fromEntries(ids.map(id => [id, mapping[id]])),
          actionOrder: [...saved.actionOrder]
        };
        if (!this.lastRounds[scenario.id]) {
          this.lastRounds[scenario.id] = {materialByStep: {...this.state.materialByStep}, actionOrder: [...this.state.actionOrder]};
        }
      } catch (_) {
        this.state = this.freshState();
        this.bag = [];
        this.lastRounds = {};
      }
    }
  }

  return {Game, MATERIAL_ORDER, PHASES, SITUATION_MS, ACTION_MS};
});
