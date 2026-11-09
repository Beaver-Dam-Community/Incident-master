(function () {
  'use strict';

  const {Game, MATERIAL_ORDER} = globalThis.BoothGame;
  const {scenarios, groups} = globalThis.BOOTH_CONTENT;
  const names = {tomato: '토마토', pepper: '피망', meat: '고기', shrimp: '새우', cheese: '치즈', bacon: '베이컨'};
  const STORE = 'beaver-dam-booth-v1';
  const app = document.getElementById('app');
  const settingsDialog = document.getElementById('settings-dialog');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
  let sound = false;
  let audioContext;
  let toastTimer;
  let previousFocus;
  let guideOpen = location.hash === '#guide';
  let guideStep = 0;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)); }
    catch (_) { return null; }
  }

  const stored = load();
  sound = stored?.sound === true;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const curtainDuration = reducedMotion ? 80 : 430;
  const game = new Game(scenarios, {
    snapshot: stored?.game,
    curtainCloseMs: curtainDuration,
    curtainOpenMs: curtainDuration
  });

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({sound, game: game.snapshot()})); }
    catch (_) {}
  }

  function icon(name) {
    const paths = {
      gear: '<path d="m10 3 1-2h2l1 2 2 1 2-1 1 2-1 2v2l1 2-1 2-2-1-2 1-1 2h-2l-1-2-2-1-2 1-1-2 1-2V7L5 5l1-2 2 1Z"/><circle cx="12" cy="8.5" r="2.5"/>',
      sound: '<path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="M17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
      mute: '<path d="M3 9h4l5-4v14l-5-4H3Z"/><path d="m17 9 5 6m0-6-5 6"/>',
      full: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
      close: '<path d="m6 6 12 12M6 18 18 6"/>',
      arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
      dice: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="8" cy="8" r=".8"/><circle cx="16" cy="8" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="8" cy="16" r=".8"/><circle cx="16" cy="16" r=".8"/>',
      clock: '<circle cx="12" cy="13" r="8"/><path d="M9 2h6m-3 0v3m0 4v5l3 2m3-11 2 2"/>',
      play: '<path d="m8 4 12 8-12 8Z"/>',
      bulb: '<path d="M8 16c0-2-3-3-3-7a7 7 0 0 1 14 0c0 4-3 5-3 7m-8 0h8m-7 4h6"/>',
      check: '<path d="m4 12 5 5L20 6"/>',
      shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
      moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
      stop: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
      cloud: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 9.5 4.3 4.3 0 0 0 7 18Z"/>',
      star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;
  }

  function food(kind, extra = '') {
    if (!MATERIAL_ORDER.includes(kind)) return '';
    return `<img src="assets/ingredients/${kind}.svg?v=8" class="ingredient-art ${extra}" alt="${names[kind]}" width="120" height="120" decoding="async" draggable="false">`;
  }

  function mini(kind) { return `<span class="mini-food">${food(kind)}</span>`; }
  function announce(text) { document.getElementById('announcer').textContent = text; }

  function toast(text) {
    clearTimeout(toastTimer);
    const element = document.getElementById('toast');
    element.textContent = text;
    element.classList.add('visible');
    toastTimer = setTimeout(() => element.classList.remove('visible'), 2600);
  }

  function beep(kind = 'start') {
    if (!sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      audioContext.resume().catch(() => {});
      const notes = kind === 'end' ? [523, 659, 784] : [659];
      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const at = audioContext.currentTime + index * 0.13;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.055, at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.16);
      });
    } catch (_) {}
  }

  function activePhase(phase = game.state.phase) {
    return ['situation', 'curtain-close', 'curtain-open', 'actions'].includes(phase);
  }

  function updateHeader() {
    const soundButton = document.getElementById('sound-toggle');
    soundButton.innerHTML = icon(sound ? 'sound' : 'mute');
    soundButton.setAttribute('aria-label', sound ? '소리 끄기' : '소리 켜기');
    soundButton.title = sound ? '소리 끄기' : '소리 켜기';
    const dark = document.documentElement.dataset.theme === 'dark';
    const themeButton = document.getElementById('theme-toggle');
    const themeLabel = dark ? '밝은 테마로 바꾸기' : '어두운 테마로 바꾸기';
    themeButton.innerHTML = icon(dark ? 'sun' : 'moon');
    themeButton.setAttribute('aria-label', themeLabel);
    themeButton.title = themeLabel;
    document.getElementById('fullscreen-toggle').innerHTML = icon('full');
    document.getElementById('settings-icon').innerHTML = icon('gear');
    document.getElementById('settings-open').disabled = guideOpen || game.state.phase !== 'home';
    document.querySelector('.header-guide').disabled = activePhase() && !guideOpen;
    document.getElementById('footer-note').textContent = activePhase() ? '10초 상황 브리핑 · 50초 대응' : '한 팀 · 한 사고 · 한 번의 대응';
  }

  function homeView() {
    return `<section class="player-home" aria-labelledby="page-title">
      <div class="home-hero"><div class="hero-copy"><div class="eyebrow">BEAVER DAM COMMUNITY BOOTH</div>
        <h1 id="page-title" tabindex="-1">침해대응의 달인</h1>
        <p class="hero-subtitle">클라우드 사고, 대응 순서를 정해요</p>
        <p class="hero-description">사고 상황을 읽고, 행동 카드를 살펴 실제 꼬치로 대응 순서를 완성해요.</p>
        <div class="hero-tags"><span class="tag">상황 10초</span><span class="tag mint">대응 50초</span></div>
        <button class="primary" data-action="draw" id="draw-button">${icon('dice')}무작위 사고 시작 ${icon('arrow')}</button>
        <button class="home-guide-link" data-action="guide-open">게임 방법 ${icon('arrow')}</button>
      </div><div class="hero-art" aria-hidden="true"><div class="mascot-orbit"></div><div class="mascot-image-card"><img src="assets/beaver-dam-logo.jpg" alt="" width="271" height="271"></div><span class="float-food one">${food('tomato')}</span><span class="float-food two">${food('cheese')}</span><span class="little-star s1">✦</span></div></div>
      <div class="player-rules"><div><span>01</span><strong>사고 제목과 상황을 읽고</strong></div><div><span>02</span><strong>행동 카드를 보고 꼬치에 끼우고</strong></div><div><span>03</span><strong>끝! 뒤에 정답을 확인해요</strong></div></div>
      <p class="roll-reminder">${mini('cheese')}${mini('bacon')}치즈·베이컨은 접어서 각각 한 칸씩 끼워요.</p>
    </section>`;
  }

  function scenarioCode(scenario) {
    return `<span class="scenario-code">시나리오 ${esc(scenario.code)}</span>`;
  }

  function countdownMarkup(label, seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const value = `00:${String(safeSeconds).padStart(2, '0')}`;
    return `<div class="incident-timer${safeSeconds <= 10 ? ' urgent' : ''}" role="timer" aria-label="${esc(label)} ${safeSeconds}초 남음"><span class="timer-caption">${esc(label)}</span><strong id="countdown-value" class="timer-digits">${value}</strong><span class="timer-unit">초</span></div>`;
  }

  function skipButton(phase) {
    const situation = phase === 'situation';
    const title = situation ? '상황 시간을 건너뛰고 행동 카드를 공개해요' : '남은 시간과 상관없이 대응 시간을 끝내요';
    return `<button class="stage-skip" data-action="skip-stage" title="${title}">${icon(situation ? 'arrow' : 'stop')}<span>${situation ? '바로 행동 보기' : '지금 끝내기'}</span></button>`;
  }

  function stageControls(label, phase) {
    return `<div class="stage-controls">${countdownMarkup(label, game.remainingSeconds)}${skipButton(phase)}</div>`;
  }

  function situationView() {
    const scenario = game.scenario;
    return `<section class="incident-screen incident-situation" aria-labelledby="page-title">
      <div class="incident-topline"><span class="incident-kicker">사고 브리핑</span>${stageControls('상황을 읽을 시간', 'situation')}</div>
      <div class="incident-panel"><span class="incident-alert">클라우드 침해사고</span><h1 id="page-title" tabindex="-1">${esc(scenario.title)}</h1><p class="incident-summary">${esc(scenario.summary)}</p></div>
      <p class="incident-footnote">지금은 제목과 상황만 읽어 주세요. 대응 행동은 잠시 뒤 공개돼요.</p>
    </section>`;
  }

  function curtainView() {
    const mode = game.state.phase === 'curtain-close' ? 'closing' : 'opening';
    return `<section class="incident-screen curtain-screen" aria-label="화면 전환 중"><div class="curtain-stage" data-mode="${mode}" aria-hidden="true"><div class="curtain-panel curtain-left"></div><div class="curtain-panel curtain-right"></div><span class="curtain-mark">BEAVER DAM</span></div><p class="curtain-caption">${mode === 'closing' ? '다음 대응 단계로 이동합니다' : '행동 카드를 준비하고 있어요'}</p></section>`;
  }

  function actionsView() {
    const scenario = game.scenario;
    const round = game.round;
    return `<section class="incident-screen incident-actions" aria-labelledby="actions-title">
      <div class="incident-topline"><div><span class="incident-kicker">대응 작전</span><p class="incident-stage-note">화면 순서는 정답 순서가 아니에요. 상황에 맞게 꼬치에 배열해 보세요.</p></div>${stageControls('대응을 생각할 시간', 'actions')}</div>
      <div class="action-heading"><div><span class="incident-alert">${esc(scenario.topic)}</span><h1 id="actions-title" tabindex="-1">어떤 순서로 대응할까요?</h1></div><span class="action-count">행동 카드 6장</span></div>
      <div class="action-grid" aria-label="무작위 순서로 섞인 재료별 대응 행동">${round.actions.map(action => `<article class="action-card" data-ingredient="${action.token}">${food(action.token, 'action-icon')}<div class="action-copy"><h2>${names[action.token]}</h2><p>${esc(action.label)}</p></div></article>`).join('')}</div>
      <p class="action-footnote">행동을 읽고 손잡이 쪽부터 바깥쪽 끝까지, 실제 꼬치에 순서대로 끼워요.</p>
    </section>`;
  }

  function finishedView() {
    return `<section class="incident-screen incident-finished" aria-labelledby="finished-title"><div class="finished-card"><span class="finished-emblem">${icon('check')}</span><p class="incident-kicker">대응 시간이 끝났어요</p><h1 id="finished-title" tabindex="-1">끝!</h1><p>꼬치를 완성하고 정답과 대응 이유를 확인해 보세요.</p><button class="primary answer-button" data-action="reveal">${icon('bulb')}정답 보기 ${icon('arrow')}</button></div></section>`;
  }

  function recipeMarkup(scenario, round) {
    const steps = round.recipe;
    const labels = steps.map(step => names[step.token]).join(', ');
    return `<section class="recipe-card answer-card" aria-labelledby="recipe-title"><div class="recipe-heading"><h2 id="recipe-title">이번 회차의 정답 꼬치</h2><span class="direction">손잡이 쪽 → 꼬치 끝</span></div>
      <div class="recipe-items" style="--count:${steps.length}" aria-label="손잡이 쪽부터 ${esc(labels)} 순서"><div class="skewer-track" aria-hidden="true"></div>
      ${steps.map((step, index) => `<div class="ingredient-step"><span class="recipe-position">${index + 1}</span>${food(step.token, 'food-icon')}<span class="ingredient-name">${names[step.token]}</span><span class="ingredient-action">${esc(step.label)}</span></div>`).join('')}</div></section>`;
  }

  function acceptedMarkup(scenario, round) {
    if (round.accepted.length < 2) return '';
    const alternatives = round.accepted.slice(1).map(order => order.map(step => names[step.token]).join(' → '));
    return `<p class="accepted-note">격리와 자료 보존처럼 함께 시작할 수 있는 조치는 순서를 바꾼 배열도 인정해요: ${alternatives.map(esc).join(' / ')}</p>`;
  }

  function resultView() {
    const scenario = game.scenario;
    const round = game.round;
    return `<section class="incident-result" aria-labelledby="page-title"><div class="result-heading"><div><span class="incident-kicker">사고 대응 정리 · ${esc(scenario.topic)}</span><h1 id="page-title" tabindex="-1">정답은 이렇게!</h1><p>${esc(scenario.title)}</p></div><button class="secondary" data-action="next-team">다음 팀 준비 ${icon('arrow')}</button></div>
      ${recipeMarkup(scenario, round)}
      <section class="debrief-card"><h2>왜 이 순서일까요?</h2><p>${esc(scenario.debrief)}</p></section>
      ${scenario.cloudDiff ? `<section class="cloud-diff-card"><span class="cloud-diff-icon">${icon('cloud')}</span><div><h2>클라우드라서 일반 침해사고 대응과 달라요</h2><p>${esc(scenario.cloudDiff)}</p></div></section>` : ''}
      <details class="answer-explanation"><summary>행동별 설명과 사고 자세히 보기</summary><div class="explanation-body"><div class="original-case"><h2>사고 상황</h2><p>${esc(scenario.story)}</p>${scenario.glossary ? `<p>${esc(scenario.glossary)}</p>` : ''}</div>${round.recipe.map((step, index) => `<div class="explain-step"><strong>${index + 1}. ${names[step.token]} · ${esc(step.label)}</strong><p>${esc(step.reason)}</p></div>`).join('')}${acceptedMarkup(scenario, round)}<p class="accepted-note">이 배열은 사고 상황에 맞춘 대표 대응 흐름이에요. 실제 사고에서는 격리와 자료 보존처럼 여러 조치를 함께 진행할 수 있어요.</p></div></details>
      ${scenarioCode(scenario)}</section>`;
  }

  // A made-up incident used only in the guide, so real answers are never shown before a round.
  const SAMPLE = {
    topic: '예시 · 계정 탈취',
    title: '(예시) 직원 계정으로 수상한 로그인이 일어났어요',
    summary: '새벽에 해외 주소에서 직원 계정으로 클라우드 관리 화면에 로그인한 기록이 발견됐어요. 무엇을 바꿨는지는 아직 몰라요.',
    recipe: [
      ['tomato', '의심 계정의 로그인을 잠시 막아요'],
      ['pepper', '로그인·활동 기록을 보존해요'],
      ['meat', '바뀐 설정과 접근 범위를 확인해요'],
      ['shrimp', '비밀번호와 접속 키를 교체해요'],
      ['cheese', '다중 인증(MFA)을 켜요'],
      ['bacon', '이상 로그인이 다시 없는지 지켜봐요']
    ],
    shown: [3, 0, 5, 2, 4, 1]
  };

  function sampleTimer(label, seconds) {
    return `<div class="incident-timer${seconds <= 10 ? ' urgent' : ''}"><span class="timer-caption">${label}</span><strong class="timer-digits">00:${String(seconds).padStart(2, '0')}</strong><span class="timer-unit">초</span></div>`;
  }

  function sampleRecipe(filled, title, direction) {
    return `<section class="recipe-card answer-card"><div class="recipe-heading"><h2>${title}</h2><span class="direction">${direction}</span></div>
      <div class="recipe-items" style="--count:6"><div class="skewer-track"></div>
      ${SAMPLE.recipe.map(([kind, label], index) => index < filled
        ? `<div class="ingredient-step"><span class="recipe-position">${index + 1}</span>${food(kind, 'food-icon')}<span class="ingredient-name">${names[kind]}</span><span class="ingredient-action">${label}</span></div>`
        : `<div class="ingredient-step sample-empty"><span class="recipe-position">${index + 1}</span><span class="sample-slot">?</span><span class="ingredient-name">빈 칸</span><span class="ingredient-action">어떤 행동이 올까요?</span></div>`).join('')}</div></section>`;
  }

  function samplePreview(step) {
    const screens = [
      `<section class="incident-screen incident-situation"><div class="incident-topline"><span class="incident-kicker">사고 브리핑</span>${sampleTimer('상황을 읽을 시간', 7)}</div>
        <div class="incident-panel"><span class="incident-alert">클라우드 침해사고</span><h1>${SAMPLE.title}</h1><p class="incident-summary">${SAMPLE.summary}</p></div>
        <p class="incident-footnote">지금은 제목과 상황만 읽어 주세요. 대응 행동은 잠시 뒤 공개돼요.</p></section>`,
      `<section class="incident-screen incident-actions"><div class="incident-topline"><div><span class="incident-kicker">대응 작전</span><p class="incident-stage-note">화면 순서는 정답 순서가 아니에요. 상황에 맞게 꼬치에 배열해 보세요.</p></div>${sampleTimer('대응을 생각할 시간', 42)}</div>
        <div class="action-heading"><div><span class="incident-alert">${SAMPLE.topic}</span><h1>어떤 순서로 대응할까요?</h1></div><span class="action-count">행동 카드 6장</span></div>
        <div class="action-grid">${SAMPLE.shown.map(index => { const [kind, label] = SAMPLE.recipe[index]; return `<article class="action-card" data-ingredient="${kind}">${food(kind, 'action-icon')}<div class="action-copy"><h2>${names[kind]}</h2><p>${label}</p></div></article>`; }).join('')}</div></section>`,
      `<section class="incident-screen sample-assembly"><div class="incident-topline"><span class="incident-kicker">실제 꼬치 조립 중</span>${sampleTimer('대응을 생각할 시간', 15)}</div>
        <div class="incident-result">${sampleRecipe(3, '손잡이 쪽부터 하나씩 끼워요', '손잡이 쪽 → 꼬치 끝')}</div>
        <p class="incident-footnote sample-note">${mini('cheese')}${mini('bacon')}치즈·베이컨은 접어서 각각 한 칸에 끼워요.</p></section>`,
      `<div class="sample-pair"><section class="incident-screen incident-finished"><div class="finished-card"><span class="finished-emblem">${icon('check')}</span><p class="incident-kicker">대응 시간이 끝났어요</p><h1>끝!</h1><span class="primary answer-button">${icon('bulb')}정답 보기 ${icon('arrow')}</span></div></section>
        <span class="sample-arrow">${icon('arrow')}</span>
        <section class="incident-result">${sampleRecipe(6, '이번 회차의 정답 꼬치', '손잡이 쪽 → 꼬치 끝')}</section></div>`
    ];
    return `<figure class="guide-preview"><figcaption><span class="preview-dots"><i></i><i></i><i></i></span>예시 화면 · 실제 게임과 같은 모양이에요</figcaption><div class="guide-preview-screen" aria-hidden="true" inert><div class="guide-preview-inner">${screens[step]}</div></div></figure>`;
  }

  function tutorialView() {
    const titles = ['사고 상황을 읽어요', '행동 카드가 무작위로 나와요', '실제 꼬치를 완성해요', '끝! 뒤에 정답을 확인해요'];
    const tabs = ['01 상황', '02 행동', '03 조립', '04 정답'];
    const details = [
      ['10초 동안 제목과 상황만 보여요.', '이때는 대응 행동이나 정답 순서를 보여주지 않아요.'],
      ['커튼이 닫혔다 열리면 재료와 행동 카드 6장이 나와요.', '카드가 놓인 순서와 꼬치에 끼울 순서는 다를 수 있어요.'],
      ['50초 동안 각 행동을 읽고 실제 꼬치에 배열해요.', '손잡이 쪽부터 시작하고, 치즈와 베이컨은 접어 각각 한 칸에 끼워요.'],
      ['시간이 끝나면 큰 “끝!” 표시가 나와요.', '정답 보기 버튼을 눌러야 해당 회차의 정답 꼬치와 해설이 공개돼요.']
    ];
    const [main, note] = details[guideStep];
    return `<section class="help-stage" aria-labelledby="page-title"><div class="help-heading"><div><span class="incident-kicker">게임 방법</span><h1 id="page-title" tabindex="-1">${titles[guideStep]}</h1></div><button class="tutorial-close" data-action="guide-close" aria-label="게임 안내 닫기">${icon('close')}</button></div>
      <nav class="help-progress" aria-label="게임 방법 단계">${tabs.map((title, index) => `<button data-action="guide-step-${index}" ${guideStep === index ? 'aria-current="step"' : ''}>${title}</button>`).join('')}</nav>
      <div class="help-body"><article class="help-card"><span class="help-number">0${guideStep + 1}</span><div><h2>${main}</h2><p>${note}</p></div></article>${samplePreview(guideStep)}</div>
      <div class="help-flow" aria-label="게임 단계"><span>상황 10초</span>${icon('arrow')}<span>행동 50초</span>${icon('arrow')}<span>정답 확인</span></div>
      <div class="tutorial-navigation"><button class="secondary" data-action="${guideStep ? 'guide-prev' : 'guide-close'}">${guideStep ? '이전' : '돌아가기'}</button><span>${guideStep + 1} / 4</span>${guideStep < 3 ? `<button class="primary" data-action="guide-next">다음 ${icon('arrow')}</button>` : `<button class="primary" data-action="guide-finish">게임 시작 ${icon('play')}</button>`}</div>
    </section>`;
  }

  function openGuide() {
    guideOpen = true;
    guideStep = 0;
    if (location.hash !== '#guide') location.hash = 'guide';
    render(true);
    announce('게임 방법 안내입니다. 사고 읽기, 행동 카드, 꼬치 조립, 정답 확인 순서를 살펴보세요.');
  }

  function closeGuide() {
    guideOpen = false;
    if (location.hash === '#guide') location.hash = '';
    render(true);
  }

  function render(moveFocus = false) {
    const phase = game.state.phase;
    const view = guideOpen ? tutorialView()
      : phase === 'home' ? homeView()
      : phase === 'situation' ? situationView()
      : phase === 'curtain-close' || phase === 'curtain-open' ? curtainView()
      : phase === 'actions' ? actionsView()
      : phase === 'finished' ? finishedView()
      : phase === 'result' ? resultView()
      : homeView();
    app.innerHTML = view;
    document.body.dataset.screen = guideOpen ? 'guide' : phase;
    updateHeader();
    if (moveFocus) {
      document.getElementById('page-title')?.focus({preventScroll: true});
      window.scrollTo({top: 0, behavior: 'instant'});
    }
  }

  function showDialog(dialog) {
    previousFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('dialog-open');
  }

  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
    if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open');
  }

  function act(action) {
    if (action === 'guide-open') { openGuide(); return; }
    if (action === 'guide-close') { closeGuide(); return; }
    if (action === 'guide-next' || action === 'guide-prev' || /^guide-step-[0-3]$/.test(action)) {
      if (!guideOpen) return;
      guideStep = action === 'guide-next' ? Math.min(3, guideStep + 1)
        : action === 'guide-prev' ? Math.max(0, guideStep - 1)
        : Number(action.slice(-1));
      render(true);
      return;
    }
    if (action === 'guide-finish') {
      closeGuide();
      if (game.state.phase === 'home') act('draw');
      return;
    }
    if (guideOpen) return;
    if (action === 'skip-stage') { skipStage(); return; }
    if (action === 'draw') {
      if (!game.draw() || !game.start()) return;
      beep();
      save();
      render(true);
      announce('사고 상황을 10초 동안 읽어 주세요. 대응 행동은 이후에 공개됩니다.');
    } else if (action === 'reveal') {
      if (!game.reveal()) return;
      save();
      render(true);
      beep('end');
      announce('정답 꼬치를 공개합니다. 행동별 설명을 펼쳐 확인할 수 있어요.');
    } else if (action === 'next-team') {
      if (!game.nextTeam()) return;
      save();
      render(true);
      announce('다음 팀을 위한 새 사고를 시작할 수 있어요.');
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button && !button.disabled) act(button.dataset.action);
  });

  document.getElementById('brand-home').addEventListener('click', event => {
    event.preventDefault();
    if (guideOpen) { closeGuide(); return; }
    if (game.state.phase === 'home') { window.scrollTo({top: 0, behavior: 'smooth'}); return; }
    toast('현재 사고를 마친 뒤 ‘다음 팀 준비’를 눌러 주세요.');
  });

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1b2b' : '#f4f9fc');
  }

  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('beaver-dam-theme', next); } catch (_) {}
    updateHeader();
    toast(next === 'dark' ? '어두운 테마로 바꿨어요.' : '밝은 테마로 바꿨어요.');
  });

  function skipStage() {
    if (guideOpen) return;
    const before = game.state.phase;
    if (!game.skip()) return;
    save();
    if (game.state.phase === 'finished') {
      render(true);
      beep('end');
      announce('대응 시간을 끝냈어요. 정답 보기를 눌러 답안 꼬치와 해설을 확인하세요.');
    } else {
      render(before === 'situation' && game.state.phase === 'actions');
      announce('상황 시간을 건너뛰고 행동 카드로 넘어가요.');
    }
  }

  document.getElementById('sound-toggle').addEventListener('click', () => {
    sound = !sound;
    save();
    updateHeader();
    if (sound) beep();
    toast(sound ? '시간 알림 소리를 켰어요.' : '알림 소리를 껐어요.');
  });

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_) { toast('브라우저에서 F11을 눌러 전체 화면으로 볼 수 있어요.'); }
  }

  document.getElementById('fullscreen-toggle').addEventListener('click', fullscreen);

  document.getElementById('settings-open').addEventListener('click', () => {
    if (game.state.phase !== 'home') return;
    settingsDialog.innerHTML = `<div class="settings-heading"><h2 id="settings-title">오늘은 어떤 사고를 만날까요?</h2><button class="close-button" data-settings="close" aria-label="설정 닫기">${icon('close')}</button></div><p>무작위로 뽑을 사고 묶음을 선택해요.</p><button class="pool-all" data-settings="all">모두 선택</button><div class="pool-options">${groups.map(group => `<label class="pool-option"><input type="checkbox" name="pool" value="${esc(group.id)}" ${game.pool.includes(group.id) ? 'checked' : ''}><span class="pool-name">${esc(group.name)}</span><span class="pool-count">${group.count}종</span></label>`).join('')}</div><p class="pool-help">선택한 사고를 한 번씩 무작위로 뽑고, 모두 나온 뒤 다시 섞어요.<br>같은 사고가 다시 나올 때는 재료 배정과 카드 순서도 새로 섞여요.</p><div class="settings-error" id="settings-error" role="status"></div><button class="primary blue" data-settings="save">이 설정으로 준비하기 ${icon('check')}</button><div class="settings-small">진행 중에는 설정을 바꾸지 않아요.</div>`;
    showDialog(settingsDialog);
  });

  settingsDialog.addEventListener('click', event => {
    const button = event.target.closest('[data-settings]');
    if (!button) return;
    if (button.dataset.settings === 'close') { closeDialog(settingsDialog); previousFocus?.focus(); }
    if (button.dataset.settings === 'all') settingsDialog.querySelectorAll('input[name=pool]').forEach(input => { input.checked = true; });
    if (button.dataset.settings === 'save') {
      const pool = [...settingsDialog.querySelectorAll('input[name=pool]:checked')].map(input => input.value);
      if (!pool.length) { document.getElementById('settings-error').textContent = '사고 묶음을 하나 이상 선택해 주세요.'; return; }
      if (pool.join('|') !== game.pool.join('|')) game.setPool(pool);
      closeDialog(settingsDialog);
      save();
      render();
      document.getElementById('settings-open').focus();
      toast(`${game.eligible.length}종의 사고로 준비했어요.`);
    }
  });

  settingsDialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));

  document.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || document.querySelector('dialog[open]')) return;
    if (event.target.matches('input,textarea,select')) return;
    if (guideOpen && event.key === 'Escape') { event.preventDefault(); closeGuide(); return; }
    if (event.code === 'Space') {
      if (guideOpen || activePhase()) return;
      if (event.target.matches('button,a,summary')) return;
    } else if (event.key.toLowerCase() === 'f') { event.preventDefault(); fullscreen(); }
  });

  window.addEventListener('pagehide', save);
  window.addEventListener('hashchange', () => {
    const open = location.hash === '#guide';
    if (open !== guideOpen) { guideOpen = open; if (open) guideStep = 0; render(true); }
  });

  function updateCountdown() {
    const element = document.getElementById('countdown-value');
    if (!element || !activePhase()) return;
    const seconds = game.remainingSeconds;
    element.textContent = `00:${String(seconds ?? 0).padStart(2, '0')}`;
    const timer = element.closest('.incident-timer');
    if (timer) {
      timer.classList.toggle('urgent', seconds <= 10);
      timer.setAttribute('aria-label', `${game.state.phase === 'situation' ? '상황을 읽을 시간' : '대응을 생각할 시간'} ${seconds ?? 0}초 남음`);
    }
  }

  game.advance();
  render();
  save();
  setInterval(() => {
    const previousPhase = game.state.phase;
    if (game.advance()) {
      save();
      render(game.state.phase === 'actions' || game.state.phase === 'finished');
      if (game.state.phase === 'actions') announce('행동 카드가 공개됐어요. 50초 안에 꼬치 순서를 정해 주세요.');
      else if (game.state.phase === 'finished') { beep('end'); announce('끝! 정답 보기를 눌러 답안 꼬치와 해설을 확인하세요.'); }
      else if (previousPhase === 'curtain-open') announce('');
    } else updateCountdown();
  }, 100);
})();
