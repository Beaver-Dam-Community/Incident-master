const test = require('node:test');
const assert = require('node:assert/strict');
const {Game,MATERIAL_ORDER,materialGuide} = require('../dist/game-engine.js');
require('../dist/scenarios.js');
const {scenarios,groups} = globalThis.BOOTH_CONTENT;
const setup = options => new Game(scenarios,{random:()=>.31,...options});
function finishRound(game){game.start();assert.equal(game.reveal(),true);game.nextTeam();}

test('all 19 scenarios and accepted alternatives use physically possible pieces',()=>{
 assert.equal(scenarios.length,19);assert.equal(new Set(scenarios.map(s=>s.id)).size,19);
 for(const s of scenarios){
  assert.equal(new Set(s.recipe).size,s.recipe.length,s.id);
  assert.deepEqual([...s.recipe,...s.unused].sort(),MATERIAL_ORDER.slice().sort(),s.id);
  assert.deepEqual(s.steps.map(a=>a.token).sort(),s.recipe.slice().sort(),s.id);
  for(const a of s.accepted)assert.deepEqual(a.slice().sort(),s.recipe.slice().sort(),s.id);
 }
 for(const g of groups)assert.equal(scenarios.filter(s=>s.group===g.id).length,g.count);
});
test('material cards keep one fixed unnumbered order across every scenario',()=>{
 for(const s of scenarios){
  const guide=materialGuide(s);
  assert.deepEqual(guide.map(item=>item.token),MATERIAL_ORDER,s.id);
  for(const item of guide){
   assert.equal(item.used,!s.unused.includes(item.token),s.id);
   if(item.used)assert.equal(item.label,s.steps.find(a=>a.token===item.token).label);
   else assert.match(item.label,/사용하지/);
   assert.equal(Object.hasOwn(item,'position'),false);
   assert.equal(Object.hasOwn(item,'reason'),false);
  }
 }
});
test('AI completed actions remain excluded and are visibly marked unused',()=>{
 const ai2=scenarios.find(s=>s.id==='AI-2'), ai4=scenarios.find(s=>s.id==='AI-4');
 assert.equal(ai2.recipe.length,4);assert.deepEqual(ai2.unused,['tomato','cheese']);assert.equal(ai4.recipe.length,5);
 assert.deepEqual(materialGuide(ai4).filter(item=>!item.used).map(item=>item.token),['shrimp']);
 assert.match(ai2.unusedLabels.tomato,/기록 보관 완료/);
 assert.match(ai4.unusedLabels.shrimp,/기록 분석 완료/);
});

test('remade AI orders preserve evidence and apply conditions before rebuilding or restarting',()=>{
 const byId=id=>scenarios.find(s=>s.id===id);
 const before=(s,a,b)=>assert.ok(s.recipe.indexOf(a)<s.recipe.indexOf(b),`${s.id}: ${a} before ${b}`);
 const ai1=byId('AI-1');assert.equal(ai1.recipe.length,5);assert.equal(ai1.recipe[0],'meat');
 assert.deepEqual(ai1.unused,['bacon']);before(ai1,'cheese','pepper');
 const ai2=byId('AI-2');assert.equal(ai2.recipe[0],'shrimp');before(ai2,'meat','pepper');before(ai2,'bacon','pepper');
 const ai3=byId('AI-3');assert.equal(ai3.recipe.length,6);assert.deepEqual(ai3.recipe.slice(0,2),['pepper','bacon']);
 before(ai3,'shrimp','tomato');before(ai3,'cheese','meat');
 const ai4=byId('AI-4');assert.equal(ai4.recipe[0],'tomato');before(ai4,'pepper','cheese');before(ai4,'bacon','meat');
});
test('answer stays hidden until the facilitator explicitly reveals it',()=>{
 const game=setup();assert.equal(game.reveal(),false);game.draw();assert.equal(game.reveal(),false);
 game.start();assert.equal(game.state.phase,'playing');assert.equal(game.state.outcome,null);
 const id=game.scenario.id;assert.equal(game.nextTeam(),false);assert.equal(game.draw(),false);
 assert.equal(game.reveal(),true);assert.equal(game.state.phase,'result');assert.equal(game.state.outcome,'revealed');assert.equal(game.scenario.id,id);
 assert.equal(game.reveal(),false);assert.equal(game.start(),false);assert.equal(game.nextTeam(),true);assert.equal(game.state.phase,'home');
});
test('shuffle bag exhausts all scenarios and avoids consecutive repeats at boundaries',()=>{
 const game=setup();let previous=null;
 for(let bag=0;bag<4;bag++){
  const seen=new Set();
  for(let i=0;i<19;i++){const s=game.draw();assert.notEqual(s.id,previous);assert.ok(!seen.has(s.id));seen.add(s.id);previous=s.id;finishRound(game);}
  assert.equal(seen.size,19);
 }
});
test('pool is nonempty and can change only between teams',()=>{
 const game=setup();assert.equal(game.setPool([]),false);assert.equal(game.setPool(['unknown']),false);assert.equal(game.setPool(['ai']),true);
 for(let i=0;i<9;i++){assert.equal(game.draw().group,'ai');assert.equal(game.setPool(['cloud']),false);finishRound(game);}
});
test('reload preserves the same scenario and hidden or revealed state',()=>{
 const game=setup();game.draw();
 const check=()=>{const restored=setup({snapshot:JSON.parse(JSON.stringify(game.snapshot()))});assert.deepEqual(restored.state,game.state);assert.deepEqual(restored.pool,game.pool);return restored;};
 check();game.start();check();game.reveal();check();
});
test('old pending judgments become hidden playing rounds, without requiring input',()=>{
 for(const pauseReason of ['judge','break']){
  const game=setup({snapshot:{version:2,pool:['ai'],bag:[],state:{phase:'paused',scenarioId:'AI-1',pauseReason}}});
  assert.equal(game.state.phase,'playing');assert.equal(game.state.outcome,null);assert.equal(game.scenario.id,'AI-1');assert.equal(game.reveal(),true);
 }
 const game=setup({snapshot:{version:2,pool:['ai'],bag:[],state:{phase:'result',scenarioId:'AI-1',outcome:'success'}}});
 assert.equal(game.state.phase,'result');assert.equal(game.state.outcome,'revealed');
});
test('old timed rounds migrate to fresh home while retaining scenario pool',()=>{
 const old={version:1,pool:['ai'],bag:['AI-2'],lastId:'AI-1',state:{phase:'playing',scenarioId:'AI-1',deadline:1,remainingMs:1000}};
 const game=setup({snapshot:old});assert.equal(game.state.phase,'home');assert.deepEqual(game.pool,['ai']);assert.deepEqual(game.bag,['AI-2']);assert.equal(game.state.outcome,null);
});
test('invalid saved state falls back to a fresh round',()=>{
 for(const state of [{phase:'playing',scenarioId:'unknown'},{phase:'result',scenarioId:'AI-1',outcome:'timeout'},{phase:'anything',scenarioId:'AI-1'}]){
  const game=setup({snapshot:{version:3,pool:['ai'],bag:['unknown','AI-2','AI-2'],state}});assert.equal(game.state.phase,'home');assert.deepEqual(game.bag,['AI-2']);
 }
});

test('count-up time survives reload, freezes on reveal, and resets for the next team',()=>{
 let now=10000;
 const game=setup({now:()=>now});game.draw();game.start();
 assert.equal(game.elapsedSeconds,0);
 now+=65000;assert.equal(game.elapsedSeconds,65);
 const restored=setup({now:()=>now,snapshot:JSON.parse(JSON.stringify(game.snapshot()))});
 assert.equal(restored.elapsedSeconds,65);
 now+=2000;restored.reveal();assert.equal(restored.elapsedSeconds,67);
 now+=60000;assert.equal(restored.elapsedSeconds,67);
 const finished=setup({now:()=>now,snapshot:restored.snapshot()});assert.equal(finished.elapsedSeconds,67);
 finished.nextTeam();finished.draw();finished.start();assert.equal(finished.elapsedSeconds,0);
});

test('existing untimed playing rounds get a fresh count-up start without losing their order',()=>{
 const game=setup({now:()=>10000,snapshot:{version:3,pool:['ai'],state:{phase:'playing',scenarioId:'AI-1'}}});
 assert.equal(game.scenario.id,'AI-1');assert.equal(game.state.phase,'playing');assert.equal(game.elapsedSeconds,0);
});
