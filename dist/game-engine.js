(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BoothGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PHASES = ['home', 'ready', 'playing', 'result'];
  const MATERIAL_ORDER = Object.freeze(['tomato','pepper','meat','shrimp','cheese','bacon']);
  function materialGuide(scenario) {
    const actions = new Map(scenario.steps.map(step => [step.token, step.label]));
    return MATERIAL_ORDER.map(token => ({token, used:actions.has(token), label:actions.get(token) || '이번 주문서에서는 사용하지 않는 재료예요.'}));
  }
  class Game {
    constructor(catalog, options = {}) {
      this.catalog = catalog;
      this.random = options.random || Math.random;
      this.now = options.now || Date.now;
      this.bag = [];
      this.lastId = null;
      this.pool = [...new Set(catalog.map(s => s.group))];
      this.state = this.freshState();
      if (options.snapshot) this.restore(options.snapshot);
    }
    freshState() { return {phase:'home', scenarioId:null, outcome:null, startedAt:null, finishedAt:null}; }
    get elapsedSeconds() {
      if (this.state.startedAt === null) return 0;
      return Math.max(0, Math.floor(((this.state.finishedAt ?? this.now()) - this.state.startedAt) / 1000));
    }
    get scenario() { return this.catalog.find(s => s.id === this.state.scenarioId) || null; }
    get eligible() { return this.catalog.filter(s => this.pool.includes(s.group)); }
    setPool(groups) {
      if (this.state.phase !== 'home') return false;
      const valid = [...new Set(groups)].filter(g => this.catalog.some(s => s.group === g));
      if (!valid.length) return false;
      this.pool = valid; this.bag = []; return true;
    }
    refill() {
      this.bag = this.eligible.map(s => s.id);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(this.random() * (i + 1)));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.lastId) {
        [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1], this.bag[0]];
      }
    }
    draw() {
      if (this.state.phase !== 'home') return false;
      if (!this.bag.length) this.refill();
      const id = this.bag.pop();
      if (!id) return false;
      this.lastId = id;
      this.state = {...this.freshState(), phase:'ready', scenarioId:id};
      return this.scenario;
    }
    start() {
      if (this.state.phase !== 'ready') return false;
      this.state.phase = 'playing';
      this.state.startedAt = this.now();
      return true;
    }
    reveal() {
      if (this.state.phase !== 'playing') return false;
      this.state.phase = 'result'; this.state.outcome = 'revealed';
      this.state.finishedAt = this.now();
      return true;
    }
    nextTeam() {
      if (this.state.phase !== 'result') return false;
      this.state = this.freshState(); return true;
    }
    snapshot() {
      return {version:3, pool:[...this.pool], bag:[...this.bag], lastId:this.lastId, state:{...this.state}};
    }
    restore(data) {
      try {
        if (!data || ![1,2,3].includes(data.version)) return;
        const knownGroups = [...new Set(this.catalog.map(s => s.group))];
        const pool = Array.isArray(data.pool) ? [...new Set(data.pool)].filter(g => knownGroups.includes(g)) : [];
        if (pool.length) this.pool = pool;
        const ids = new Set(this.eligible.map(s => s.id));
        this.bag = Array.isArray(data.bag) ? [...new Set(data.bag)].filter(id => ids.has(id)) : [];
        this.lastId = this.catalog.some(s => s.id === data.lastId) ? data.lastId : null;
        // Start a fresh round when upgrading from the previous picture-copying rules.
        if (data.version === 1) return;
        const st = data.state && {...data.state};
        if (data.version === 2 && st?.phase === 'paused') st.phase = 'playing';
        if (data.version === 2 && st?.phase === 'result' && st.outcome === 'success') st.outcome = 'revealed';
        if (!st || !PHASES.includes(st.phase)) return;
        if (st.phase === 'home') return;
        if (!this.catalog.some(s => s.id === st.scenarioId)) return;
        if (st.phase === 'result' && st.outcome !== 'revealed') return;
        const restored = {...this.freshState(), phase:st.phase, scenarioId:st.scenarioId};
        if (st.phase === 'playing' || st.phase === 'result') {
          restored.startedAt = Number.isFinite(st.startedAt) && st.startedAt >= 0 ? st.startedAt : this.now();
          if (st.phase === 'result') restored.finishedAt = Number.isFinite(st.finishedAt) && st.finishedAt >= restored.startedAt ? st.finishedAt : restored.startedAt;
        }
        if (st.phase === 'result') restored.outcome = 'revealed';
        this.state = restored;
      } catch (_) { this.state = this.freshState(); }
    }
  }
  return {Game, MATERIAL_ORDER, materialGuide};
});
