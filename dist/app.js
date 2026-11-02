(function () {
  'use strict';
  const {Game, materialGuide} = globalThis.BoothGame;
  const {scenarios, groups} = globalThis.BOOTH_CONTENT;
  const names = {tomato:'토마토',pepper:'피망',meat:'고기',shrimp:'새우',cheese:'치즈',bacon:'베이컨'};
  const STORE = 'beaver-dam-booth-v1';
  const app = document.getElementById('app');
  const settingsDialog = document.getElementById('settings-dialog');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let sound = false;
  let audioContext;
  let toastTimer;
  let previousFocus;
  let guideOpen = location.hash === '#guide';
  let guideStep = 0;
  const example = scenarios.find(s => s.id === 'BASIC-01');
  function load() { try {return JSON.parse(localStorage.getItem(STORE));} catch (_) {return null;} }
  const stored = load();
  sound = stored?.sound === true;
  const random = () => {try {const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296;} catch (_) {return Math.random();}};
  const game = new Game(scenarios, {random, snapshot:stored?.game});
  // Resume a saved order from the former preparation screen directly in play.
  if (game.state.phase === 'ready') game.start();
  function save() {try {localStorage.setItem(STORE, JSON.stringify({sound,game:game.snapshot()}));} catch (_) {}}
  function elapsedText() {
    const seconds = game.elapsedSeconds;
    return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  }
  function timerMarkup(label = '경과 시간') {
    return `<div class="elapsed-timer">${icon('clock')}<span>${label}</span><span id="elapsed-time" class="elapsed-value">${elapsedText()}</span></div>`;
  }
  function icon(name) {
    const paths = {
      gear:'<path d="m10 3 1-2h2l1 2 2 1 2-1 1 2-1 2v2l1 2-1 2-2-1-2 1-1 2h-2l-1-2-2-1-2 1-1-2 1-2V7L5 5l1-2 2 1Z"/><circle cx="12" cy="8.5" r="2.5"/>',
      sound:'<path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="M17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
      mute:'<path d="M3 9h4l5-4v14l-5-4H3Z"/><path d="m17 9 5 6m0-6-5 6"/>',
      full:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
      close:'<path d="m6 6 12 12M6 18 18 6"/>',
      arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
      dice:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="8" cy="8" r=".8"/><circle cx="16" cy="8" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="8" cy="16" r=".8"/><circle cx="16" cy="16" r=".8"/>',
      clock:'<circle cx="12" cy="13" r="8"/><path d="M9 2h6m-3 0v3m0 4v5l3 2m3-11 2 2"/>',
      play:'<path d="m8 4 12 8-12 8Z"/>',
      pause:'<path d="M8 4v16M16 4v16"/>',
      check:'<path d="m4 12 5 5L20 6"/>',
      shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
      star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
      bulb:'<path d="M8 16c0-2-3-3-3-7a7 7 0 0 1 14 0c0 4-3 5-3 7m-8 0h8m-7 4h6"/>',
      retry:'<path d="M4 8a8 8 0 1 1-1 7M3 3v6h6"/>',
      trophy:'<path d="M8 3h8v7a4 4 0 0 1-8 0Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-4 1h8"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;
  }
  function food(kind, extra = '') {
    return `<img src="assets/ingredients/${kind}.svg?v=7" class="ingredient-art ${extra}" alt="${names[kind]}" width="120" height="120" decoding="async" draggable="false">`;
  }
  function mini(kind) {return `<span class="mini-food">${food(kind)}</span>`;}
  function announce(text) {document.getElementById('announcer').textContent = text;}
  function toast(text) {
    clearTimeout(toastTimer); const t = document.getElementById('toast');
    t.textContent = text; t.classList.add('visible'); toastTimer = setTimeout(() => t.classList.remove('visible'), 2600);
  }
  function beep(result = 'start') {
    if (!sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      audioContext.resume().catch(() => {});
      const notes = result === 'success' ? [523,659,784] : [659];
      notes.forEach((frequency,i) => {
        const osc = audioContext.createOscillator(), gain = audioContext.createGain(), at = audioContext.currentTime + i*.13;
        osc.type = 'sine';osc.frequency.value = frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.055,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+.14);
        osc.connect(gain);gain.connect(audioContext.destination);osc.start(at);osc.stop(at+.16);
      });
    } catch (_) {}
  }
  function updateHeader() {
    document.getElementById('sound-toggle').innerHTML = icon(sound?'sound':'mute');
    document.getElementById('sound-toggle').setAttribute('aria-label', sound?'소리 끄기':'소리 켜기');
    document.getElementById('sound-toggle').title = sound?'소리 끄기':'소리 켜기';
    document.getElementById('fullscreen-toggle').innerHTML = icon('full');
    document.getElementById('settings-icon').innerHTML = icon('gear');
    document.getElementById('settings-open').disabled = guideOpen || game.state.phase !== 'home';
    document.getElementById('footer-note').textContent = '';
  }
  function homeView() {
    return `<section class="player-home" aria-labelledby="page-title">
      <div class="home-hero"><div class="hero-copy"><div class="eyebrow">BEAVER DAM COMMUNITY BOOTH</div>
        <h1 id="page-title" tabindex="-1">침해대응의 달인</h1>
        <p class="hero-subtitle">한 꼬치로 수습 완료!</p>
        <p class="hero-description">사고를 읽고, 대응 순서를 꼬치로 완성해요.</p>
        <div class="hero-tags"><span class="tag">시간 제한 없음</span><span class="tag mint">한 팀 한 미션</span></div>
        <button class="primary" data-action="draw" id="draw-button">${icon('dice')}랜덤 주문서 받기 ${icon('arrow')}</button>
        <button class="home-guide-link" data-action="guide-open">게임 방법 · 예시 보기 ${icon('arrow')}</button>
      </div><div class="hero-art" aria-hidden="true"><div class="mascot-orbit"></div><div class="mascot-image-card"><img src="assets/beaver-dam-logo.jpg" alt="" width="271" height="271"></div><span class="float-food one">${food('tomato')}</span><span class="float-food two">${food('cheese')}</span><span class="little-star s1">✦</span></div></div>
      <div class="player-rules"><div><span>01</span><strong>사고와 재료를 읽고</strong></div><div><span>02</span><strong>대응 순서대로 끼우고</strong></div><div><span>03</span><strong>“수습 완료!” 외치기</strong></div></div>
      <p class="roll-reminder">${mini('cheese')}${mini('bacon')}치즈·베이컨 모두 접어서 한 칸씩!</p>
    </section>`;
  }
  function shortAction(s,token) { return s.steps.find(step=>step.token===token)?.shortLabel || ''; }
  function actionMarkup(s,token) { return esc(shortAction(s,token)).replaceAll('·','·<wbr>'); }
  function scenarioCode(s) { return `<span class="scenario-code">시나리오 ${esc(s.code)}</span>`; }
  function recipeMarkup(s) {
    return `<section class="recipe-card answer-card" aria-labelledby="recipe-title"><div class="recipe-heading"><h2 id="recipe-title">정답 꼬치</h2><span class="direction">끼우는 방향: 손잡이 → 끝</span></div>
      <div class="recipe-items" style="--count:${s.recipe.length}" aria-label="손잡이부터 ${s.recipe.map(k=>names[k]).join(', ')} 순서"><div class="skewer-track" aria-hidden="true"></div>
      ${s.recipe.map((k,i)=>`<div class="ingredient-step"><span class="recipe-position">${i+1}</span>${food(k,'food-icon')}<span class="ingredient-name">${names[k]}</span><span class="ingredient-action">${actionMarkup(s,k)}</span></div>`).join('')}</div></section>`;
  }
  function guideMarkup(s) {
    return `<section class="player-materials" aria-labelledby="materials-title"><div class="materials-heading"><h2 id="materials-title">재료별 행동</h2><span class="material-order-note">재료의 행동을 읽고 순서를 생각해 보세요</span></div><div class="materials-grid">${materialGuide(s).map(item=>`<article data-ingredient="${item.token}" class="material-card${item.used?'':' resting'}">${food(item.token,'material-icon')}<div><h3>${names[item.token]}</h3><p>${item.used?actionMarkup(s,item.token):esc(s.unusedLabels?.[item.token]||'이번에는 사용 안 해요')}</p></div></article>`).join('')}</div></section>`;
  }
  function missionView() {
    const s=game.scenario;
    return `<section class="player-mission" aria-labelledby="page-title"><div class="player-heading"><span class="mission-kicker">오늘의 미션</span><div class="mission-status"><span class="tag">재료 ${s.recipe.length}개</span>${timerMarkup()}</div></div><h1 id="page-title" tabindex="-1">${esc(s.title)}</h1><p class="scenario-summary">${esc(s.summary)}</p>
      ${guideMarkup(s)}<div class="player-playbar"><div><strong>완성하면 “수습 완료!”</strong><p>시간 제한 없이, 대응 순서를 완성해 보세요.</p></div>
      <button class="secondary reveal-control" data-action="reveal" id="reveal-button">${icon('bulb')}정답 공개</button></div>
      <div class="player-roll-note">${mini('cheese')}${mini('bacon')}치즈·베이컨 모두 접어서 한 칸씩</div>${scenarioCode(s)}</section>`;
  }
  function resultView() {
    const s=game.scenario;
    return `<section class="player-result" aria-labelledby="page-title"><div class="answer-top"><div><span class="mission-kicker">${esc(s.title)}</span><h1 id="page-title" tabindex="-1">정답은 이렇게!</h1></div><div class="answer-actions">${timerMarkup('걸린 시간')}<button class="secondary" data-action="next-team">처음으로 ${icon('arrow')}</button></div></div>
      ${recipeMarkup(s)}<details class="answer-explanation"><summary>왜 이 순서일까요?</summary><div class="explanation-body"><p class="explanation-key">${esc(s.debrief)}</p><div class="original-case"><h2>사고 자세히 보기</h2><p>${esc(s.story)}</p>${s.glossary?`<p>${esc(s.glossary)}</p>`:''}</div>${s.steps.map((step,i)=>`<div class="explain-step"><strong>${i+1}. ${names[step.token]} · ${esc(step.label)}</strong><p>${esc(step.reason)}</p></div>`).join('')}${unusedMarkup(s)}${acceptedMarkup(s)}<p class="accepted-note">이 주문서의 대표 흐름이에요. 실제 사고에서는 조치를 병행하거나 반복할 수 있어요.</p></div></details>${scenarioCode(s)}</section>`;
  }
  function unusedMarkup(s) {
    if (!s.unused?.length) return '';
    return `<div class="original-case"><h2>꽂지 않는 재료</h2>${s.unused.map(token=>`<p><strong>${names[token]}</strong> · ${esc(s.unusedReasons?.[token]||'이번에는 사용하지 않아요.')}</p>`).join('')}</div>`;
  }
  function acceptedMarkup(s) {
    if(s.accepted.length<2)return '';
    return `<p class="accepted-note">그림은 대표 정답이에요. 함께 인정하는 배열: ${s.accepted.slice(1).map(order=>order.map(k=>names[k]).join(' → ')).join(' / ')}</p>`;
  }
  function tutorialView() {
    const titles = ['기본 대응 흐름을 알아봐요', '사고와 재료를 읽어요', '대응 순서대로 끼워요', '완성하면 “수습 완료!”'];
    const tabs = ['기본 흐름', '01 읽기', '02 끼우기', '03 완료'];
    let body;
    if(guideStep === 0){
      const flow = [
        ['막기','지금 진행 중인 피해를 멈춰요.','세션 종료 · 링크 차단 · 서버 격리 · 접속키 비활성화'],
        ['남기기','지우거나 바꾸기 전에 증거를 보존해요.','기록·설정·스냅샷 보존 · 현재 상태 복사'],
        ['파악하기','원인과 피해 범위를 조사해요.','접속 기록 분석 · 노출 범위 조사 · 침입 경로 추적'],
        ['되돌리기','공격 흔적을 정리하고 정상 상태로 복구해요.','안전한 재구성 · 백업 복원 · 재배포 · 노출된 키 교체'],
        ['다시 못 오게 하기','들어온 경로와 약한 설정을 고쳐요.','2단계 인증 · 권한 정비 · 보안 업데이트 · 검증 규칙'],
        ['확인하기','조치가 효과 있는지 지켜봐요.','재접근·재감염 감시 · 결과 검증 · 서비스 재개 후 점검']
      ];
      body = `<section class="response-flow" aria-label="침해사고 기본 대응 흐름">${flow.map(([title,meaning,examples],i)=>`<article class="response-flow-card"><div class="response-flow-title"><span>${i+1}</span><h2>${title}</h2></div><p class="response-flow-meaning">${meaning}</p><p class="response-flow-examples">${examples}</p></article>`).join('')}</section><p class="response-flow-note">상황에 따라 순서가 달라지거나 여러 조치를 함께 진행해요.<br>각 재료의 행동은 주문서에서 확인해요.</p>`;
    }else if(guideStep === 1){
      body = `<div class="tutorial-case"><span class="tag">예시 · ${esc(example.title)}</span><p>${esc(example.summary)}</p></div>${guideMarkup(example)}<p class="tutorial-hint">재료마다 적힌 행동을 읽고, 어떤 조치를 먼저 할지 생각해 보세요.</p>`;
    }else if(guideStep === 2){
      body = `${recipeMarkup(example).replace('정답 꼬치','예시 꼬치')}<section class="tutorial-assembly-note" aria-labelledby="fold-note-title"><div class="fold-note-art">${food('cheese')}${food('bacon')}</div><div class="fold-note-copy"><h2 id="fold-note-title">치즈·베이컨은 접어서 한 칸씩!</h2><p>납작하게 지그재그로 접어 끼워요. 다른 재료를 감싸지 않아요.</p></div><p class="fold-note-direction">손잡이 쪽부터 차례대로 끼워요.<span>실제 미션의 정답은 나중에 공개해요.</span></p></section>`;
    }else{
      body = `<div class="tutorial-finish tutorial-finish-solo"><div class="tutorial-finish-card"><span class="tutorial-cheer">수습 완료!</span><h2>실물 꼬치를 보여 주세요</h2><p>진행자가 직접 확인해요.<br>다르면 같은 미션으로 다시 도전!</p><div class="tutorial-rule-tags"><span class="tag">한 팀 한 미션</span><span class="tag mint">시간 제한 없음</span></div></div></div><p class="tutorial-hint">재료의 행동과 순서는 주문서마다 달라요. 정답 공개는 진행자가 눌러요.</p>`;
    }
    return `<section class="player-tutorial player-result" aria-labelledby="page-title"><div class="tutorial-heading"><div><span class="mission-kicker">게임 방법 · ${guideStep===0?'대응의 기본 생각법':'설명용 예시'}</span><h1 id="page-title" tabindex="-1">${titles[guideStep]}</h1></div><button class="tutorial-close" data-action="guide-close" aria-label="게임 안내 닫기">${icon('close')}</button></div><nav class="tutorial-progress" aria-label="게임 안내 단계">${tabs.map((title,i)=>`<button data-action="guide-step-${i}" ${guideStep===i?'aria-current="step"':''}>${title}</button>`).join('')}</nav><div class="tutorial-body">${body}</div><div class="tutorial-navigation"><button class="secondary" data-action="${guideStep?'guide-prev':'guide-close'}">${guideStep?'이전':'돌아가기'}</button><span>${guideStep+1} / 4</span>${guideStep<3?`<button class="primary" data-action="guide-next">${['사고·재료 예시 보기','예시 꼬치 보기','완성 후에는?'][guideStep]} ${icon('arrow')}</button>`:`<button class="primary" data-action="guide-finish">${game.state.phase==='home'?'실전 주문서 받기':'내 미션으로 돌아가기'} ${icon('arrow')}</button>`}</div></section>`;
  }
  function openGuide() {
    guideOpen=true;guideStep=0;
    if(location.hash!=='#guide')location.hash='guide';
    render(true);announce('게임 방법 안내입니다. 기본 대응 흐름과 읽기, 끼우기, 완료 예시를 살펴봐요.');
  }
  function closeGuide() {
    guideOpen=false;
    if(location.hash==='#guide')location.hash='';
    render(true);
  }
  function render(moveFocus = false) {
    const phase=game.state.phase;
    app.innerHTML=guideOpen?tutorialView():phase==='home'?homeView():phase==='result'?resultView():missionView();
    updateHeader();
    if(moveFocus){document.getElementById('page-title')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  }
  function showDialog(dialog) {
    previousFocus=document.activeElement;
    if(!dialog.open)dialog.showModal();
    document.body.classList.add('dialog-open');
  }
  function closeDialog(dialog) {
    if(dialog.open)dialog.close();
    if(!document.querySelector('dialog[open]'))document.body.classList.remove('dialog-open');
  }
  function act(action) {
    if(action==='guide-open'){openGuide();return;}
    if(action==='guide-close'){closeGuide();return;}
    if(action==='guide-next'||action==='guide-prev'||/^guide-step-[0-3]$/.test(action)){
      if(!guideOpen)return;
      guideStep=action==='guide-next'?Math.min(3,guideStep+1):action==='guide-prev'?Math.max(0,guideStep-1):Number(action.slice(-1));
      render(true);return;
    }
    if(action==='guide-finish'){
      closeGuide();
      if(game.state.phase==='home')act('draw');
      return;
    }
    if(guideOpen)return;
    if(action==='draw'){
      if(!game.draw())return;
      if(!game.start())return;
      beep();save();render(true);document.getElementById('page-title')?.focus({preventScroll:true});announce('사고 대응 시작! 시간 제한 없이 대응 순서를 완성해 주세요.');
    }else if(action==='reveal'){
      if(!game.reveal())return;
      save();render(true);beep('reveal');announce('정답 꼬치를 공개합니다. 자세한 해설은 펼쳐서 확인할 수 있어요.');
    }else if(action==='next-team'){
      if(!game.nextTeam())return;
      save();render(true);announce('다음 팀을 위한 새 주문서를 뽑아 주세요.');
    }
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');
    if(button&&!button.disabled)act(button.dataset.action);
  });
  document.getElementById('brand-home').addEventListener('click',event=>{
    event.preventDefault();
    if(guideOpen){closeGuide();return;}
    if(game.state.phase==='home'){window.scrollTo({top:0,behavior:'smooth'});return;}
    toast('이번 체험을 마친 뒤 ‘다음 팀 준비하기’를 눌러 주세요.');
  });
  document.getElementById('sound-toggle').addEventListener('click',()=>{sound=!sound;save();updateHeader();if(sound)beep();toast(sound?'시작과 종료 알림 소리를 켰어요.':'알림 소리를 껐어요.');});
  async function fullscreen() {
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
    catch(_){toast('브라우저에서 F11을 눌러 전체 화면으로 볼 수 있어요.');}
  }
  document.getElementById('fullscreen-toggle').addEventListener('click',fullscreen);
  document.getElementById('settings-open').addEventListener('click',()=>{
    if(game.state.phase!=='home')return;
    settingsDialog.innerHTML=`<div class="settings-heading"><h2 id="settings-title">오늘은 어떤 사고를 만날까요?</h2><button class="close-button" data-settings="close" aria-label="설정 닫기">${icon('close')}</button></div><p>원하는 묶음에서 주문서 한 장을 뽑아요.</p><button class="pool-all" data-settings="all">모두 선택</button><div class="pool-options">${groups.map(g=>`<label class="pool-option"><input type="checkbox" name="pool" value="${g.id}" ${game.pool.includes(g.id)?'checked':''}><span class="pool-name">${esc(g.name)}</span><span class="pool-count">${g.count}종</span></label>`).join('')}</div><p class="pool-help">선택한 묶음의 주문서를 한 번씩 고르게 뽑아요.<br>모두 나온 뒤 다시 섞으며, 같은 주문서가 바로 반복되지 않아요.</p><div class="settings-error" id="settings-error" role="status"></div><button class="primary blue" data-settings="save">이 설정으로 준비하기 ${icon('check')}</button><div class="settings-small">진행 중에는 설정을 바꾸지 않아요. 체험을 마친 뒤 다음 팀 안내 화면에서 바꿀 수 있어요.</div>`;
    showDialog(settingsDialog);
  });
  settingsDialog.addEventListener('click',event=>{
    const btn=event.target.closest('[data-settings]');if(!btn)return;
    if(btn.dataset.settings==='close'){closeDialog(settingsDialog);previousFocus?.focus();}
    if(btn.dataset.settings==='all')settingsDialog.querySelectorAll('input[name=pool]').forEach(input=>input.checked=true);
    if(btn.dataset.settings==='save'){
      const pool=[...settingsDialog.querySelectorAll('input[name=pool]:checked')].map(input=>input.value);
      if(!pool.length){document.getElementById('settings-error').textContent='시나리오 묶음을 하나 이상 선택해 주세요.';return;}
      if(pool.join('|')!==game.pool.join('|'))game.setPool(pool);
      closeDialog(settingsDialog);save();render();document.getElementById('settings-open').focus();toast(`${game.eligible.length}종의 주문서로 준비했어요.`);
    }
  });
  settingsDialog.addEventListener('close',()=>{document.body.classList.remove('dialog-open');});
  document.addEventListener('keydown',event=>{
    if(event.repeat||event.ctrlKey||event.altKey||event.metaKey||document.querySelector('dialog[open]'))return;
    if(event.target.matches('input,textarea,select'))return;
    if(guideOpen&&event.key==='Escape'){event.preventDefault();closeGuide();return;}
    if(event.code==='Space'){
      if(guideOpen)return;
      if(event.target.matches('button,a,summary'))return;
    }else if(event.key.toLowerCase()==='f'){event.preventDefault();fullscreen();}
  });
  window.addEventListener('pagehide',save);
  window.addEventListener('hashchange',()=>{
    const open=location.hash==='#guide';
    if(open!==guideOpen){guideOpen=open;if(open)guideStep=0;render(true);}
  });
  setInterval(() => {
    const timer = document.getElementById('elapsed-time');
    if (timer && game.state.phase === 'playing') timer.textContent = elapsedText();
  }, 250);
  render();save();
})();
