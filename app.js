import { HEROES, ENEMIES, ROUND_LENGTH, upgradeRound, ATTACK_DURATION, DIAMOND_DURATION, DIAMOND_STAGGER, createRound, getDecomposition, hasHint, toggleHint, getWrongAttempts, getReward, answerRound, advanceRound, summarizeRound, getFeedbackState, collectRoundReward } from './game.js';
import { loadSave, saveProgress } from './db.js';
import { getProjectile, IMPACT_DELAY, getAttackTiming, VOLLEY_STAGGER } from './projectiles.js';
import { retryRound } from './game.js';
import { advanceStudyClock, finishStudyBreak } from './study.js';
import { HOME_SECTIONS, getMode, getBreakTen } from './game.js';
import { getHundredHint } from './hundred.js';
import { ENTRY_COST, buyPlatformRun, isPlatformEnabled } from './platform-engine.js';
import { preparePlatformer, mountPlatformer } from './platform-view.js';

const platformEnabled=isPlatformEnabled(location.search);
const app = document.querySelector('#app');
const total = document.querySelector('#diamond-total');
const announcer = document.querySelector('#announcer');
let save;
let view = 'lobby';
let audio;
let audioMaster;
const audioVoices = new Set();
let toastTimer;
const rewardAnimations = new Set();
let platformController;
let platformAssets;
let platformStarting = false;
let platformResuming = false;

const diamond = `<svg class="diamond" viewBox="0 0 48 42" aria-hidden="true"><path d="M12 3h24l10 12-22 24L2 15Z" fill="#b89aff" stroke="#9870dc" stroke-width="3" stroke-linejoin="round"/><path d="m12 3 6 12 6 24 6-24 6-12M2 15h44" fill="none" stroke="#dccbff" stroke-width="2.5"/></svg>`;
const star = filled => `<svg class="star ${filled ? 'filled' : ''}" viewBox="0 0 64 64" aria-hidden="true"><path d="m32 5 8 17 19 3-14 14 3 19-16-9-17 9 4-19L5 25l19-3Z" stroke-linejoin="round" stroke-width="4"/></svg>`;
const getHero = id => HEROES.find(hero => hero.id === id) || HEROES[0];
const getEnemy = id => ENEMIES.find(enemy => enemy.id === id) || ENEMIES[0];
const animal = (character, className = '') => {
  const paint = character.image ? `--animal-image:url('${character.image}');--animal-size:${character.imageSize || 'contain'};--animal-x:${character.imageSize ? character.col * 50 : 50}%;--animal-y:50%` : `--animal-x:${character.col * 50}%;--animal-y:${character.row * 100}%`;
  return `<span class="animal-art ${className}" role="img" aria-label="${character.name}" style="${paint}"></span>`;
};
const stars = count => `<span class="star-row" role="img" aria-label="${count}颗星">${[0, 1, 2].map(i => star(i < count)).join('')}</span>`;

function announce(message) { announcer.textContent = message; }
function toast(message) {
  const element = document.querySelector('#toast');
  clearTimeout(toastTimer);
  element.textContent = message;
  element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, 4500);
}

async function persist() {
  try { await saveProgress(save); }
  catch { toast('进度暂时没能保存，请保持页面打开。'); }
}

function playSound(kind, impactDelay = IMPACT_DELAY, projectileCount = 1) {
  if (!save.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (!audioMaster) { audioMaster = audio.createGain(); audioMaster.connect(audio.destination); }
    audioMaster.gain.setTargetAtTime(save.volume, audio.currentTime, .02);
    void audio.resume();
    const notes = kind === 'correct' ? [523, 659, 784] : kind === 'finish' ? [523, 659, 784, 1047] : kind === 'wrong' ? [392, 294] : kind === 'jump' ? [440, 660] : kind === 'hit' ? [180, 90] : kind === 'shoot' ? [880] : [660];
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + index * 0.1;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      oscillator.connect(gain).connect(audioMaster);
      oscillator.start(start);
      oscillator.stop(start + 0.22);
      audioVoices.add(oscillator);
      oscillator.onended = () => audioVoices.delete(oscillator);
    });
    if (kind === 'correct') {
      const effect = (delay, duration, from, to, type, volume) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = audio.currentTime + delay;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(from, start);
        oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + .012);
        gain.gain.exponentialRampToValueAtTime(.001, start + duration);
        oscillator.connect(gain).connect(audioMaster);
        oscillator.start(start); oscillator.stop(start + duration + .01);
        audioVoices.add(oscillator);
        oscillator.onended = () => audioVoices.delete(oscillator);
      };
      for (let i = 0; i < projectileCount; i++) effect((impactDelay + i * VOLLEY_STAGGER) / 1000, .11, 180 + i % 3 * 20, 50, 'triangle', .10 / Math.sqrt(projectileCount));
      effect((impactDelay + (projectileCount - 1) * VOLLEY_STAGGER) / 1000 + .08, .35, 900, 120, 'sine', .045);
    }
  } catch { /* 无声模式不影响答题。 */ }
}

function updateHeader() {
  const modeId = view === 'lobby' ? save.selectedMode : save.activeRound?.modeId;
  const sectionName = view === 'platform' ? '水果跳跳乐' : getMode(modeId).name;
  document.querySelector('.brand-subtitle').textContent = sectionName;
  document.title = `凑十大冒险 · ${sectionName}`;
  total.textContent = save.diamonds;
  total.parentElement.setAttribute('aria-label', `累计${save.diamonds}个钻石`);
  const button = document.querySelector('#sound-button');
  const label = save.sound ? '关闭声音' : '开启声音';
  button.classList.toggle('muted', !save.sound);
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.setAttribute('aria-pressed', String(save.sound));
  const percentage = Math.round(save.volume * 100);
  document.querySelector('#volume-slider').value = percentage;
  document.querySelector('#volume-value').textContent = `${percentage}%`;
  document.querySelector('#volume-slider').setAttribute('aria-valuetext', `${percentage}%`);
}

function renderLobby() {
  const active = save.activeRound && save.activeRound.status !== 'complete';
  app.innerHTML = `
    <section class="welcome-card" aria-labelledby="welcome-title">
      <span class="little-eyebrow"><span aria-hidden="true">✦</span> 今天也要闪闪发光</span>
      <h1 id="welcome-title">和小伙伴一起，<span>快乐学数学！</span></h1>
      <p class="welcome-description">选一个喜欢的伙伴，开始${ROUND_LENGTH}道题的数学冒险</p>
      <div class="lesson-groups" role="group" aria-label="选择练习内容">${HOME_SECTIONS.map(section => `<section class="lesson-group" ${section.title ? `aria-label="${section.title}"` : 'aria-label="基础练习"'}>${section.title ? `<h2>${section.title}</h2>` : ''}<div class="mode-choices">${section.modeIds.map(id => { const mode = getMode(id); return `<button class="mode-choice ${save.selectedMode === mode.id ? 'selected' : ''}" data-mode="${mode.id}" aria-pressed="${save.selectedMode === mode.id}"><strong>${mode.shortName || mode.name}</strong><span>${mode.description}</span>${mode.example ? `<span class="mode-example">${mode.example}</span>` : ''}</button>`; }).join('')}</div></section>`).join('')}</div>
      <p class="oral-motto">十位和十位算，个位和个位算；<br class="mobile-break">个位不够减，向十位借1当10。</p>
      <div class="hero-choices" role="group" aria-label="选择本轮伙伴">
        ${HEROES.map(hero => `<button class="hero-choice ${save.selectedHero === hero.id ? 'selected' : ''}" data-hero="${hero.id}" aria-pressed="${save.selectedHero === hero.id}">${animal(hero)}<strong>${hero.name}</strong><span class="choice-check" aria-hidden="true">✓</span></button>`).join('')}
      </div>
      <div class="start-actions"><button class="primary-button" data-action="start">${active ? '开启新一轮' : '开始冒险'}<span aria-hidden="true"> →</span></button>${active ? `<button class="text-button" data-action="resume">继续上次冒险</button><span class="resume-mode">上次：${getMode(save.activeRound.modeId).name}</span>` : ''}</div>
      <div class="welcome-rules"><span>${ROUND_LENGTH}题一轮</span><i></i><span>点击💡看提示</span><i></i><span>${diamond} 收集钻石</span></div>
      <p class="reward-guide">每题答对得3个钻石，每答错一次，本题奖励少1个，最低0个。慢慢想，答对最重要。</p>
      <p class="reward-guide">每练习10分钟，休息5分钟，保护小眼睛。</p>
    </section>
    ${renderPlatformEntry()}
    ${renderHistory()}`;
}

function renderPlatformEntry() {
  if(!platformEnabled)return '';
  const active = save.platformRun?.status === 'playing';
  const affordable = save.diamonds >= ENTRY_COST;
  return `<section class="platform-entry" aria-labelledby="platform-entry-title">
    <div class="platform-entry-art">${animal(getHero(save.selectedHero))}</div>
    <div><span class="little-eyebrow">第1关 · 青芽果园 · 2屏卷轴关卡</span><h2 id="platform-entry-title">水果跳跳乐</h2><p>← → 左右移动，Space跳跃，J发射水果。跳上平台，抵达城堡！</p><p>${affordable ? '3颗桃心 · 20只小怪，击败不重生 · 可以踩怪和打蚊子' : `还差${ENTRY_COST-save.diamonds}个钻石，先做几道口算吧！`}</p></div>
    <div class="platform-entry-actions"><button class="primary-button" data-action="platform-start" ${!affordable || platformStarting ? 'disabled' : ''}>${platformStarting ? '正在准备果园…' : (ENTRY_COST===0?'开始冒险 · 免费测试':`开始冒险 · ${ENTRY_COST}钻石`)}</button>${active ? `<button class="text-button" data-action="platform-resume">继续${getHero(save.platformRun.heroId).name}的冒险</button>` : ''}</div>
  </section>`;
}

function renderPlatform() {
  if (platformController) return;
  if (!platformAssets || !save.platformRun) { view = 'lobby'; render(); return; }
  platformController = mountPlatformer(app, {
    run: save.platformRun, assets: platformAssets, heroName: getHero(save.platformRun.heroId).name, resuming: platformResuming,
    getBalance: () => save.diamonds,
    onSave(run) {
      if (view !== 'platform' || save.platformRun?.id !== run.id) return;
      save.platformRun = run;
      if (run.status !== 'playing' && !save.platformHistory.some(record => record.id === run.id)) save.platformHistory.unshift({ id: run.id, heroId: run.heroId, status: run.status, levelId: run.levelId, collected: run.collected, elapsedMs: run.elapsedMs, completedAt: Date.now() });
      void persist();
    },
    onHome: goHome, onRetry: () => void startPlatformer(), onSound: playSound,
  });
}

async function startPlatformer() {
  if(!platformEnabled)return;
  if (!save || platformStarting || refreshStudy()) return;
  if (save.diamonds < ENTRY_COST) { toast(`需要${ENTRY_COST}个钻石，先做几道口算吧！`); return; }
  platformStarting = true;
  platformController?.pause();
  const launchButton = app.querySelector('[data-action="platform-start"]');
  if (launchButton) { launchButton.disabled = true; launchButton.textContent = '正在准备果园…'; }
  const previous = save;
  let charged = false;
  try {
    const hero = getHero(save.selectedHero);
    const assets = await preparePlatformer(hero);
    const next = buyPlatformRun(save, hero.id, assets.level);
    if (!next) { toast('暂时无法开始，请刷新后再试。'); return; }
    await saveProgress(next);
    charged = true;
    platformController?.destroy(); platformController = null;
    save = next; platformAssets = assets; platformResuming = false; view = 'platform';
    render(); window.scrollTo({ top: 0, behavior: 'instant' });
    announce('先完成体感校准，也可选择键盘。侧挥转向、举手跳跃、原地跑前进，飞翔发射水果，也可按J。');
  } catch (error) {
    if (charged) { save = previous; try { await saveProgress(save); } catch {} }
    view = 'lobby'; render(); toast(error.message || '果园暂时没能打开，请稍后再试。');
  } finally {
    platformStarting = false;
    if (view === 'lobby') render();
  }
}

async function resumePlatformer() {
  if(!platformEnabled)return;
  if (!save?.platformRun || platformStarting || refreshStudy()) return;
  platformStarting = true;
  try {
    platformAssets = await preparePlatformer(getHero(save.platformRun.heroId));
    platformResuming = true; view = 'platform'; save.lastView = 'platform';
    render(); window.scrollTo({ top: 0, behavior: 'instant' }); await persist();
  } catch (error) { toast(error.message || '果园暂时没能打开，请稍后再试。'); }
  finally { platformStarting = false; }
}

function renderHistory() {
  if (!save.history.length) return '<p class="local-note">每一次进步，都为你记在这台设备上。</p>';
  return `<section class="history-section" aria-label="最近的冒险记录"><h2>我的冒险足迹<span>最近3次</span></h2><div class="history-grid">${save.history.slice(0, 3).map(record => {
    const date = new Date(record.completedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    return `<article class="history-item">${animal(getHero(record.heroId))}<div><time>${date}</time>${stars(record.stars)}</div><div class="history-score"><b>${record.correct}/${record.total??10}</b><span>${diamond}${record.diamonds >= 0 ? '+' : ''}${record.diamonds}</span></div></article>`;
  }).join('')}</div></section>`;
}

function renderDecomposition(question, show) {
  if (question.operation === 'complement') return `<div class="hint-space ${show?'visible':''}" id="decomposition" aria-hidden="${!show}"><div class="oral-hint"><span class="method-tag">凑满10个</span><div class="ten-frame" role="img" aria-label="共有10个圆点，已知${question.a}个，数一数空心圆点还剩几个">${Array.from({length:10},(_,i)=>`<i class="${i<question.a?'filled':''}" aria-hidden="true"></i>`).join('')}</div><span class="complement-cue">数一数<br>空心的有几个？</span></div></div>`;
  const hundredHint = getHundredHint(question);
  if (hundredHint && hundredHint.method !== 'carry') return `<div class="hint-space place-hint ${show ? 'visible' : ''}" id="decomposition" aria-hidden="${!show}"><div class="oral-hint" role="img" aria-label="${hundredHint.description}"><span class="method-tag">${hundredHint.title}</span><div class="oral-steps">${hundredHint.steps.map(step => `<span>${step}</span>`).join('')}</div></div></div>`;
  if (question.operation === 'subtract') return renderBreakTen(question, show);
  const { first, rest, base, split, splitFirst, target } = getDecomposition(question);
  const firstX = splitFirst ? 185 : 375;
  const restX = splitFirst ? 55 : 525;
  return `<div class="hint-space ${show ? 'visible' : ''}" id="decomposition" aria-hidden="${!show}">
    <svg class="decomposition" viewBox="0 0 900 160" preserveAspectRatio="none" role="img" aria-label="把${split}拆成${first}和${rest}，${base}加${first}凑成${target}">
      <defs><marker id="hint-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="m2 1 5 4-5 4" fill="none" stroke="#79cf88" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
      <path class="hint-line" d="${splitFirst ? 'M68 5 55 52M112 5 175 52' : 'M428 5 390 52M472 5 510 52'}"/>
      <path class="hint-line" d="${splitFirst ? 'M450 5v65q0 38 -40 38H245' : 'M90 5v65q0 38 40 38h180'}" marker-end="url(#hint-arrow)"/>
      <rect x="${(splitFirst ? 362.5 : 172.5) - (target >= 100 ? 85 : 62.5)}" y="65" width="${target >= 100 ? 170 : 125}" height="37" rx="19" fill="#d9f6d2"/>
      <text class="hint-label" x="${splitFirst ? 362.5 : 172.5}" y="91" text-anchor="middle">凑成${target}</text>
      <circle cx="${firstX}" cy="100" r="48" fill="#d9f7d2"/><circle cx="${restX}" cy="100" r="48" fill="#d9f7d2"/>
      <text class="split-number" x="${firstX}" y="125" text-anchor="middle">${first}</text><text class="split-number" x="${restX}" y="125" text-anchor="middle">${rest}</text>
    </svg>
  </div>`;
}

function renderBreakTen(question, show) {
  const { tens, ones, subtrahend, afterSubtract } = getBreakTen(question);
  return `<div class="hint-space ${show ? 'visible' : ''}" id="decomposition" aria-hidden="${!show}">
    <svg class="decomposition break-ten" viewBox="0 0 900 160" preserveAspectRatio="none" role="img" aria-label="把${question.a}拆成10和${ones}，先算10减${subtrahend}等于${afterSubtract}，再算${afterSubtract}加${ones}">
      <path class="hint-line" d="M68 5 55 45M112 5 175 45"/>
      <circle cx="55" cy="90" r="43" fill="#d9f7d2"/><circle cx="185" cy="90" r="43" fill="#d9f7d2"/>
      <text class="split-number" x="55" y="112" text-anchor="middle" style="font-size:62px">${tens}</text><text class="split-number" x="185" y="112" text-anchor="middle" style="font-size:62px">${ones}</text>
      <rect x="665" y="40" width="205" height="50" rx="25" fill="#d9f6d2"/>
      <text class="hint-label" x="767" y="75" text-anchor="middle">先减再加</text>
      <text class="break-step" x="340" y="78">10 − ${subtrahend} = ${afterSubtract}</text>
      <text class="break-step" x="340" y="140">${afterSubtract} ＋ ${ones} = ?</text>
    </svg>
  </div>`;
}

function renderGame(animate = false) {
  const round = save.activeRound;
  if (!round) { view = 'lobby'; render(); return; }
  const question = round.questions[round.index];
  const feedback = round.feedback;
  const complement = question.operation === 'complement';
  const equationLabel = complement ? `${question.a}加几等于10` : `${question.a}${question.operation === 'subtract' ? '减' : '加'}${question.b}等于多少`;
  const showHint = hasHint(round);
  const hero = getHero(round.heroId);
  const enemy = getEnemy(question.enemyId);
  const feedbackState = getFeedbackState(round);
  const projectileIds = feedback?.correct ? (feedback.projectileIds?.length ? feedback.projectileIds : [feedback.projectileId || 'star']) : ['star'];
  const volleyTail = (projectileIds.length - 1) * VOLLEY_STAGGER;
  const stateClass = feedback ? `animate-${feedback.correct ? 'correct' : 'wrong'}` : '';
  app.innerHTML = `
    <section class="game-card ${feedback ? 'answered' : ''}" aria-label="${question.lesson ? getMode(question.lesson).name : complement ? '10的分解' : question.operation === 'subtract' ? '破十减法' : '凑十加法'}答题游戏">
      <span class="question-progress">第${round.index + 1}/${round.questions.length}题<button class="hint-button ${showHint?'is-open':''}" data-action="toggle-hint" aria-label="${showHint?'收起解题提示':'显示解题提示'}" title="${showHint?'收起提示':'点亮小灯泡看提示'}" aria-controls="decomposition" aria-expanded="${showHint}" ${feedback?'disabled':''}>💡</button></span>
      <div class="arena ${stateClass}" style="--feedback-age:${feedbackState?.age || 0}ms;--flight-duration:${feedback?.flightDuration || 750}ms;--impact-delay:${feedback?.impactDelay || IMPACT_DELAY}ms;--volley-tail:${volleyTail}ms;--last-impact-delay:${feedback?.lastImpactDelay || feedback?.impactDelay || IMPACT_DELAY}ms" aria-label="${hero.name}对战${enemy.name}">
        <span class="arena-spark spark-one" aria-hidden="true">✦</span><span class="arena-spark spark-two" aria-hidden="true">✦</span>
        <div class="fighter hero"><span class="grass"></span>${animal(hero)}</div>
        ${projectileIds.map((id, index) => { const p = getProjectile(id); return `<div class="projectile flight-${p.flight}" style="--shot-arc:${p.arc || -35}px;--shot-delay:${100 + index * VOLLEY_STAGGER}ms" role="img" aria-label="${p.name}" aria-hidden="${!feedback?.correct}">${p.art}</div><span class="impact-burst" style="--hit-delay:${(feedback?.impactDelay || IMPACT_DELAY) + index * VOLLEY_STAGGER}ms" aria-hidden="true">✺</span>`; }).join('')}
        <div class="fighter enemy"><span class="grass"></span>${animal(enemy)}</div>
      </div>
      <div class="math-work">
        <h1 class="equation ${question.a >= 10 || question.b >= 10 || complement ? 'wide' : ''}" id="equation" tabindex="-1" aria-label="${equationLabel}"><span>${question.a}</span><span>${question.operation === 'subtract' ? '−' : '+'}</span><span>${complement ? '？' : question.b}</span><span>=</span><span>${complement ? '10' : '?'}</span></h1>
        ${renderDecomposition(question, showHint)}
      </div>
      <div class="answer-options" role="group" aria-label="选择一个答案">${question.options.map(option => {
        let chosen = feedback && feedback.choice === option ? (feedback.correct ? ' chosen-correct' : ' chosen-wrong') : '';
        return `<button class="answer-button${chosen}" data-answer="${option}" ${feedback ? 'disabled' : ''} aria-label="答案${option}">${option}</button>`;
      }).join('')}</div>
      <div class="game-footer">${feedback ? `<p class="feedback-message ${feedback.correct ? 'correct' : 'wrong'}" role="status">${feedback.correct ? (feedback.diamonds && feedback.rewardCollected !== false ? `答对啦！获得${feedback.diamonds}个钻石` : '答对啦！') : `再试一次，本题还可得${feedback.remainingReward??getReward(true,getWrongAttempts(round))}个钻石。`}</p>${feedback.correct ? `<span class="auto-next-note">${round.index === round.questions.length-1 ? '马上查看成绩…' : '马上开始下一题…'}</span>` : ''}` : `<p class="feedback-message">${round.retryMessage||`慢慢想，本题答对可得${getReward(true,getWrongAttempts(round))}个钻石。`}</p>`}</div>
    </section>`;
  if (feedback) requestAnimationFrame(() => app.querySelector('[data-action="next"]')?.focus({ preventScroll: true }));
  const arenaBox = app.querySelector('.arena').getBoundingClientRect();
  const heroBox = app.querySelector('.hero').getBoundingClientRect();
  const enemyBox = app.querySelector('.enemy').getBoundingClientRect();
  const startX = heroBox.left + heroBox.width * .65 - arenaBox.left;
  const hitX = enemyBox.left + enemyBox.width * .5 - arenaBox.left;
  app.querySelectorAll('.projectile').forEach(shot => { shot.style.left = `${startX}px`; shot.style.setProperty('--shot-distance', `${hitX - startX}px`); });
  app.querySelectorAll('.impact-burst').forEach(burst => { burst.style.left = `${hitX}px`; });
  if (feedback?.correct) animateDiamonds(round);
}

function clearDiamondAnimations() {
  for (const item of rewardAnimations) { item.animation.cancel(); item.element.remove(); }
  rewardAnimations.clear();
}

function animateDiamonds(round) {
  const state = getFeedbackState(round);
  const feedback = round.feedback;
  if (!feedback.diamonds || feedback.rewardCollected !== false || state.phase === 'waiting' || state.phase === 'advance' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const enemy = app.querySelector('.enemy .animal-art').getBoundingClientRect();
  const ground = app.querySelector('.enemy .grass').getBoundingClientRect();
  const wallet = total.parentElement.getBoundingClientRect();
  const targetX = wallet.left + 24;
  const targetY = wallet.top + wallet.height / 2 - 14;
  const duration = DIAMOND_DURATION;
  for (let index = 0; index < feedback.diamonds; index++) {
    const spread = (index - (feedback.diamonds - 1) / 2) * 25;
    const startX = enemy.left + enemy.width * 0.5 - 14;
    const startY = enemy.top + enemy.height * 0.33;
    const landX = startX + spread;
    const landY = Math.max(startY + 25, ground.top + ground.height / 2 - 26);
    const element = document.createElement('span');
    element.className = 'diamond-flight';
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = diamond;
    document.body.append(element);
    const at = (x, y, rotate = 0, scale = '1') => `translate(${x}px,${y}px) rotate(${rotate}deg) scale(${scale})`;
    const frames = [
      { offset: 0, transform: at(startX, startY, -20, '.6'), opacity: 0 },
      { offset: 80 / duration, transform: at(startX + spread * .15, startY - 10, -8), opacity: 1, easing: 'cubic-bezier(.45,0,.9,.65)' },
      { offset: 500 / duration, transform: at(landX, landY, 10, '1.18,.78'), opacity: 1, easing: 'cubic-bezier(.15,.5,.4,1)' },
      { offset: 620 / duration, transform: at(landX + 4, landY - 30, -7, '.94,1.06'), opacity: 1, easing: 'cubic-bezier(.5,0,.9,.6)' },
      { offset: 740 / duration, transform: at(landX + 7, landY, 5, '1.12,.86'), opacity: 1, easing: 'ease-out' },
      { offset: 820 / duration, transform: at(landX + 9, landY - 11, -3), opacity: 1, easing: 'ease-in' },
      { offset: 900 / duration, transform: at(landX + 11, landY), opacity: 1 },
      { offset: 1020 / duration, transform: at(landX + 11, landY), opacity: 1, easing: 'cubic-bezier(.45,.05,.7,1)' },
      { offset: 1, transform: at(targetX, targetY, 180, '.25'), opacity: 0 },
    ];
    const animation = element.animate(frames, { duration, delay: (feedback.attackDuration || ATTACK_DURATION) + index * DIAMOND_STAGGER, fill: 'both' });
    animation.currentTime = state.age;
    const item = { element, animation };
    rewardAnimations.add(item);
    animation.finished.then(() => { element.remove(); rewardAnimations.delete(item); }).catch(() => {});
  }
}

function reviewEquation(question) {
  if (question.operation === 'complement') return `${question.a} ＋ <b>${question.answer}</b> = 10`;
  return `${question.a} ${question.operation === 'subtract' ? '−' : '+'} ${question.b} = <b>${question.answer}</b>`;
}

function renderResult() {
  const round = save.activeRound;
  if (!round) { view = 'lobby'; render(); return; }
  const result = summarizeRound(round);
  app.innerHTML = `<section class="result-card" aria-labelledby="result-title">
    <span class="little-eyebrow">${result.total}道题的冒险完成啦</span>
    ${animal(getHero(round.heroId), 'result-animal')}
    <h1 id="result-title">${result.stars === 3 ? '太棒啦，全部答对！' : result.stars === 2 ? '真不错，继续加油！' : '每次练习，都在进步！'}</h1>
    ${stars(result.stars)}
    <div class="result-stats"><div><b>${result.correct}<small>/${result.total}</small></b><span>一次答对</span></div><div><b>${result.defeated}</b><span>击败敌人</span></div><div class="earned-diamonds"><b>${diamond}${result.diamonds >= 0 ? '+' : ''}${result.diamonds}</b><span>本轮钻石</span></div></div>
    <p class="star-explanation">全对得3星，错1～3题得2星，其余得1星</p>
    ${result.wrong ? `<details class="mistake-review"><summary>看看这次的错题（${result.wrong}题）</summary><div>${(round.mistakes ? round.mistakes.map(index => round.questions[index]) : result.answers.filter(answer => !answer.correct)).map(answer => `<span>${reviewEquation(answer)}</span>`).join('')}</div></details>` : ''}
    <button class="primary-button" data-action="lobby">再来一轮<span aria-hidden="true"> →</span></button>
  </section>`;
}

function render(animate = false) {
  if(view==='platform'&&!platformEnabled)view='lobby';
  clearDiamondAnimations();
  document.body.classList.toggle('platform-mode', view === 'platform');
  if (view !== 'platform' && platformController) { save.platformRun = platformController.snapshot(); platformController.destroy(); platformController = null; }
  updateHeader();
  if (view === 'platform') renderPlatform();
  else if (view === 'break') renderBreak();
  else if (view === 'game') renderGame(animate);
  else if (view === 'result') renderResult();
  else renderLobby();
  app.setAttribute('aria-busy', 'false');
}

function renderBreak() {
  app.innerHTML = `<section class="break-card" aria-labelledby="break-title">
    <div class="break-friend">${animal(getHero(save.activeRound?.heroId || save.selectedHero))}<span aria-hidden="true">Z z</span></div>
    <span class="little-eyebrow">小伙伴也要充充电</span>
    <h1 id="break-title">休息一下小眼睛</h1>
    <p>已经练习10分钟啦，起来活动一下吧！</p>
    <div class="break-clock" role="timer" aria-label="休息剩余时间"></div>
    <p class="break-tip">看看远处，伸个懒腰，喝口水</p>
    <button class="primary-button" data-action="finish-break" disabled>休息好再继续</button>
    <p class="local-note">休息5分钟后，就能接着答题啦</p>
  </section>`;
  updateBreakCountdown();
}

function updateBreakCountdown() {
  if (view !== 'break') return;
  const seconds = Math.max(0, Math.ceil((save.study.breakUntil - Date.now()) / 1000));
  const clock = app.querySelector('.break-clock');
  if (clock) clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const button = app.querySelector('[data-action="finish-break"]');
  if (button) { button.disabled = seconds > 0; button.textContent = seconds > 0 ? '休息好再继续' : '休息好啦，继续答题 →'; }
}

function refreshStudy() {
  if (!save) return false;
  const before = save.study;
  save.study = advanceStudyClock(before, Date.now(), view === 'game' && !document.hidden);
  if (save.study.pauseStartedAt !== null && view !== 'break') {
    view = 'break';
    for (const voice of audioVoices) { try { voice.stop(); } catch {} }
    audioVoices.clear();
    render();
    announce('已经练习10分钟啦，休息5分钟后再继续。');
  }
  updateBreakCountdown();
  if (JSON.stringify(before) !== JSON.stringify(save.study)) void persist();
  return view === 'break';
}

function continueAfterBreak() {
  const resumed = finishStudyBreak(save.study, save.activeRound, Date.now());
  if (!resumed) return;
  save.study = resumed.study;
  save.activeRound = resumed.round;
  view = save.activeRound ? (save.activeRound.status === 'complete' ? 'result' : 'game') : 'lobby';
  refreshStudy(); render(); void persist();
  announce('休息好啦，继续冒险吧！');
}

function refreshHint() {
  const round = save?.activeRound;
  if (view !== 'game' || !round || round.status !== 'playing') return;
  const element = document.querySelector('#decomposition');
  const shown=hasHint(round),button=app.querySelector('[data-action="toggle-hint"]');
  if(button){button.classList.toggle('is-open',shown);button.setAttribute('aria-expanded',String(shown));button.setAttribute('aria-label',shown?'收起解题提示':'显示解题提示');button.title=shown?'收起提示':'点亮小灯泡看提示';}
  if(element&&!shown){element.classList.remove('visible');element.setAttribute('aria-hidden','true');}
  if (element && !element.classList.contains('visible') && shown) {
    element.classList.add('visible');
    element.setAttribute('aria-hidden', 'false');
    const question = round.questions[round.index];
    if(question.operation==='complement'){announce(`共有10个圆点，实心的是已知的${question.a}个，数一数空心圆点还剩几个。`);return;}
    const hundredHint = getHundredHint(question);
    if (hundredHint) { announce(hundredHint.description); return; }
    if (question.operation === 'subtract') {
      const { ones, subtrahend, afterSubtract } = getBreakTen(question);
      announce(`破十提示：把${question.a}拆成10和${ones}，先算10减${subtrahend}等于${afterSubtract}，再算${afterSubtract}加${ones}。`);
      return;
    }
    const { first, rest, base, split, target } = getDecomposition(question);
    announce(`凑十提示：把${split}拆成${first}和${rest}，${base}加${first}凑成${target}。`);
  }
}

async function handleAnswer(choice) {
  if (refreshStudy()) return;
  if (view !== 'game' || !save.activeRound) return;
  const card = app.querySelector('.game-card');
  const padding = getComputedStyle(card);
  const innerWidth = card.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
  const mobile = matchMedia('(max-width:700px)').matches;
  const medium = matchMedia('(max-width:1000px)').matches;
  const previousArena = Math.min(mobile ? 380 : medium ? 500 : 570, innerWidth * (mobile ? .96 : medium ? .64 : .65));
  const previousFighter = mobile ? 140 : matchMedia('(max-height:820px)').matches ? 155 : matchMedia('(min-height:950px) and (min-width:900px)').matches ? 215 : 190;
  const distance = parseFloat(app.querySelector('.projectile').style.getPropertyValue('--shot-distance'));
  const timing = getAttackTiming(distance, previousArena / 2 - previousFighter * .15);
  const next = answerRound(save.activeRound, choice, Date.now(), timing);
  if (!next) return;
  save.activeRound = next;
  render(true);
  playSound(next.feedback.correct ? 'correct' : 'wrong', next.feedback.impactDelay, next.feedback.projectileIds?.length || 1);
  await persist();
}

function refreshFeedback() {
  if (view !== 'game' || save?.activeRound?.status !== 'feedback') return;
  if (!save.activeRound.feedback?.correct) {
    if (getFeedbackState(save.activeRound)?.age >= 650) {
      save.activeRound = retryRound(save.activeRound);
      render(); void persist();
    }
    return;
  }
  const now = Date.now();
  const collected = collectRoundReward(save.activeRound, now);
  if (collected) {
    save.activeRound = collected.round;
    save.diamonds += collected.diamonds;
    updateHeader();
    const message = app.querySelector('.feedback-message');
    if (message) message.textContent = `答对啦！获得${collected.diamonds}个钻石`;
    total.parentElement.classList.remove('wallet-collected');
    void total.parentElement.offsetWidth;
    total.parentElement.classList.add('wallet-collected');
    void persist();
  }
  if (getFeedbackState(save.activeRound, now)?.phase === 'advance') void nextQuestion();
}

async function nextQuestion() {
  if (refreshStudy()) return;
  if (view !== 'game' || save.activeRound?.status !== 'feedback') return;
  save.activeRound = advanceRound(save.activeRound);
  if (save.activeRound.status === 'complete') {
    const result = summarizeRound(save.activeRound);
    if (!save.history.some(record => record.id === result.id)) save.history.unshift(result);
    view = 'result';
    playSound('finish');
    announce(`本轮完成，答对${result.correct}题，获得${result.stars}颗星。`);
  } else announce(`第${save.activeRound.index + 1}题。`);
  refreshStudy();
  render();
  await persist();
}

async function startRound() {
  if (refreshStudy()) return;
  if (save.activeRound?.status === 'feedback' && save.activeRound.feedback?.correct) {
    const timing = getFeedbackState(save.activeRound);
    const pending = collectRoundReward(save.activeRound, Math.max(Date.now(), timing.rewardEndsAt));
    if (pending) save.diamonds += pending.diamonds;
  }
  save.activeRound = createRound(save.selectedHero, Date.now(), Math.random, save.selectedMode);
  save.lastView = 'game';
  view = 'game';
  refreshStudy();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  playSound('tap');
  announce('冒险开始，第一题。');
  await persist();
}

function goHome() {
  if (!save) return;
  if (refreshStudy()) return;
  platformController?.pause();
  save.lastView = 'lobby';
  view = 'lobby';
  refreshStudy();
  render();
  void persist();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled || !save) return;
  if (button.dataset.mode) {
    if (view !== 'lobby') return;
    save.selectedMode = getMode(button.dataset.mode).id;
    render(); app.querySelector(`[data-mode="${save.selectedMode}"]`)?.focus({ preventScroll: true });
    playSound('tap'); void persist();
  } else if (button.dataset.hero) {
    if (view !== 'lobby') return;
    save.selectedHero = button.dataset.hero;
    render();
    app.querySelector(`[data-hero="${save.selectedHero}"]`)?.focus({ preventScroll: true });
    playSound('tap');
    void persist();
  } else if (button.dataset.answer !== undefined) void handleAnswer(Number(button.dataset.answer));
  else if(button.dataset.action==='toggle-hint') {if(view!=='game'||refreshStudy())return;save.activeRound=toggleHint(save.activeRound);refreshHint();playSound('tap');void persist();}
  else if (button.dataset.action === 'start') void startRound();
  else if (button.dataset.action === 'platform-start') void startPlatformer();
  else if (button.dataset.action === 'platform-resume') void resumePlatformer();
  else if (button.dataset.action === 'next') void nextQuestion();
  else if (button.dataset.action === 'lobby') goHome();
  else if (button.dataset.action === 'finish-break') continueAfterBreak();
  else if (button.dataset.action === 'resume') { if (refreshStudy()) return; save.lastView = 'game'; view = 'game'; refreshStudy(); render(); refreshHint(); window.scrollTo({ top: 0, behavior: 'instant' }); }
});

document.querySelector('#home-button').addEventListener('click', goHome);
document.querySelector('#brand-home').addEventListener('click', event => { event.preventDefault(); goHome(); });
document.querySelector('#sound-button').addEventListener('click', () => {
  if (!save) return;
  save.sound = !save.sound;
  if (!save.sound) { for (const voice of audioVoices) { try { voice.stop(); } catch {} } audioVoices.clear(); }
  updateHeader();
  if (save.sound) playSound('tap');
  void persist();
});

const volumeToggle = document.querySelector('#volume-settings');
const volumePanel = document.querySelector('#volume-panel');
function closeVolumePanel() { volumePanel.hidden = true; volumeToggle.setAttribute('aria-expanded', 'false'); }
volumeToggle.addEventListener('click', () => {
  volumePanel.hidden = !volumePanel.hidden;
  volumeToggle.setAttribute('aria-expanded', String(!volumePanel.hidden));
  if (!volumePanel.hidden) document.querySelector('#volume-slider').focus();
});
document.querySelector('#volume-slider').addEventListener('input', event => {
  if (!save) return;
  save.volume = Math.max(0, Math.min(2, Number(event.target.value) / 100));
  if (audioMaster) audioMaster.gain.setTargetAtTime(save.sound ? save.volume : 0, audio.currentTime, .02);
  updateHeader();
  void persist();
});
document.querySelector('#volume-slider').addEventListener('change', () => { if (save?.sound) playSound('tap'); });
document.addEventListener('click', event => { if (!event.target.closest('.volume-control')) closeVolumePanel(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !volumePanel.hidden) { closeVolumePanel(); volumeToggle.focus(); } });
document.addEventListener('visibilitychange', () => { refreshStudy(); refreshHint(); });
window.addEventListener('pageshow', () => { refreshStudy(); refreshHint(); });
window.addEventListener('pagehide', () => {
  if (!save) return;
  if (platformController) save.platformRun = platformController.snapshot();
  refreshStudy();
  save.study.lastActiveAt = null;
  void persist();
});

async function boot() {
  save = await loadSave();
  const previousRound=save.activeRound;
  const round = upgradeRound(previousRound);
  if (round && round.index >= 0 && round.index < round.questions.length) {
    save.activeRound=round;
    view = round.status === 'complete' ? 'result' : 'game';
  } else save.activeRound = null;
  if(round&&round!==previousRound)await persist();
  if (platformEnabled && save.lastView === 'platform' && save.platformRun) {
    try { platformAssets = await preparePlatformer(getHero(save.platformRun.heroId)); platformResuming = true; view = 'platform'; }
    catch { view = 'lobby'; toast('果园资源暂未加载，进度仍然保留。'); }
  }
  refreshStudy();
  render();
  setInterval(() => { refreshStudy(); refreshFeedback(); }, 1000);
  setInterval(refreshFeedback, 50);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
void boot();
