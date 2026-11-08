import { createVolley, pickProjectile, getAttackTiming, VOLLEY_STAGGER } from './projectiles.js';
import { HUNDRED_MODES, getHundredPairs } from './hundred.js';

export const HEROES = [
  { id: 'bunny', name: '小兔子', image: './assets/companions/classic-bunny-ref-v4.png' },
  { id: 'chick', name: '小鸡', image: './assets/companions/classic-chick-ref-v4.png' },
  { id: 'pig', name: '小猪', image: './assets/companions/classic-pig-ref-v4.png' },
  { id: 'ref-dog', name: '小狗', image: './assets/companions/ref-dog.png' },
  { id: 'ref-cat', name: '三花猫', image: './assets/companions/ref-cat.png' },
  { id: 'ref-pigeon', name: '小鸽子', image: './assets/companions/ref-pigeon.png' },
  { id: 'ref-clownfish', name: '小丑鱼', image: './assets/companions/ref-clownfish.png' },
  { id: 'ref-hamster', name: '小仓鼠', image: './assets/companions/ref-hamster.png' },
  { id: 'ref-sprout', name: '豆芽鸡', image: './assets/companions/ref-sprout.png' },
  { id: 'ref-dinosaur', name: '小恐龙', image: './assets/companions/ref-dinosaur.png' },
  { id: 'ref-penguin', name: '小企鹅', image: './assets/companions/ref-penguin.png' },
];
export const ENEMIES = [
  { id: 'fox', name: '小狐狸', col: 0, row: 1 },
  { id: 'tiger', name: '小老虎', col: 1, row: 1 },
  { id: 'wolf', name: '小狼', col: 2, row: 1 },
];
export const ROUND_LENGTH = 10;
export const ATTACK_DURATION = getAttackTiming().attackDuration;
export const DIAMOND_DURATION = 1670;
export const DIAMOND_STAGGER = 80;
export const AUTO_NEXT_DELAY = 1000;
export const MODES = [
  { id: 'within20', name: '20以内加法', description: '一位数相加，练习凑十' },
  { id: 'within30', name: '20以上到30以内加法', description: '答案21～30，练习进位' },
  { id: 'subtract20', name: '20以内减法（破十法）', description: '先用10减，再加剩下的几', operation: 'subtract' },
  { id: 'make10', name: '10的分解', description: '选出另一半，合起来等于10', operation: 'complement' },
  ...HUNDRED_MODES,
];
export const getMode = id => MODES.find(mode => mode.id === id) || MODES[0];
export const HOME_SECTIONS = [
  { title: '', modeIds: ['make10', 'within20', 'within30', 'subtract20'] },
  { title: '100以内加法', modeIds: ['add100NoCarry', 'add100Carry'] },
  { title: '100以内减法', modeIds: ['subtract100NoBorrow', 'subtract100Borrow'] },
];

export function randomInt(min, max, random = Math.random) {
  return min + Math.floor(random() * (max - min + 1));
}

export function shuffled(values, random = Math.random) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i, random);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createQuestions(random = Math.random, modeId = 'within20') {
  // 加法练习个位进位；减法练习把十几拆成10和几后退位。
  const pool = [];
  const mode = getMode(modeId);
  const hundred = HUNDRED_MODES.some(item => item.id === mode.id);
  const within30 = getMode(modeId).id === 'within30';
  const subtract = getMode(modeId).operation === 'subtract';
  const complement = getMode(modeId).operation === 'complement';
  if (hundred) {
    pool.push(...getHundredPairs(mode.id));
  } else if (complement) {
    for (let a = 0; a <= 10; a++) pool.push({ a, b: 10 - a });
  } else if (subtract) {
    for (let a = 11; a <= 18; a++) {
      for (let b = a % 10 + 1; b <= 9; b++) pool.push({ a, b });
    }
  } else {
    for (let a = 2; a <= (within30 ? 19 : 9); a++) {
      for (let b = 2; b <= (within30 ? 19 : 9); b++) {
        const sum = a + b;
        if (within30 ? sum > 20 && sum <= 30 && a % 10 + b % 10 >= 10 : sum > 10) pool.push({ a, b });
      }
    }
  }
  const selected = hundred && mode.mixed
    ? shuffled([...shuffled(pool.filter(q => q.b < 10), random).slice(0, ROUND_LENGTH / 2), ...shuffled(pool.filter(q => q.b >= 10), random).slice(0, ROUND_LENGTH / 2)], random)
    : shuffled(pool, random).slice(0, ROUND_LENGTH);
  return selected.map(({ a, b }) => {
    const answer = complement ? b : subtract ? a - b : a + b;
    const distractors = [-3, -2, -1, 1, 2, 3]
      .map(offset => answer + offset)
      .filter(value => value >= (within30 ? 21 : 0) && value <= (hundred ? 100 : within30 ? 30 : complement ? 10 : 20));
    return {
      a, b, answer, operation: complement ? 'complement' : subtract ? 'subtract' : 'add',
      ...(hundred ? { lesson: mode.id } : {}),
      options: shuffled([answer, ...shuffled(distractors, random).slice(0, 2)], random),
      enemyId: ENEMIES[randomInt(0, ENEMIES.length - 1, random)].id,
    };
  });
}

export function createRound(heroId, now = Date.now(), random = Math.random, modeId = 'within20') {
  if (!HEROES.some(hero => hero.id === heroId)) throw new Error('请选择一个小伙伴');
  return {
    id: globalThis.crypto.randomUUID(),
    heroId,
    modeId: getMode(modeId).id,
    questions: createQuestions(random, modeId),
    index: 0,
    answers: [],
    startedAt: now,
    questionStartedAt: now,
    status: 'playing',
    feedback: null,
    rewardRule: 'accuracy-v1',
    wrongAttempts: {},
    hintedQuestions: [],
  };
}

export function getDecomposition(question) {
  const splitFirst = question.a < question.b;
  const base = splitFirst ? question.b : question.a;
  const split = splitFirst ? question.a : question.b;
  const target = (Math.floor(base / 10) + 1) * 10;
  const first = target - base;
  return { first, rest: split - first, base, split, splitFirst, target };
}

export function getBreakTen(question) {
  return { tens: 10, ones: question.a - 10, subtrahend: question.b, afterSubtract: 10 - question.b };
}

export function hasHint(round) {
  return Array.isArray(round.hintedQuestions)&&round.hintedQuestions.includes(round.index);
}

export function toggleHint(round) {
  if(round.status!=='playing')return round;
  const shown=hasHint(round),indices=Array.isArray(round.hintedQuestions)?round.hintedQuestions:[];
  return {...round,hintedQuestions:shown?indices.filter(i=>i!==round.index):[...indices,round.index]};
}

export function getWrongAttempts(round,index=round.index) {
  const count=round.wrongAttempts?.[index];return Number.isSafeInteger(count)&&count>0?count:0;
}

export function getReward(correct, wrongCount=0) {
  if (!correct) return 0;
  return Math.max(0,3-Math.max(0,Math.floor(wrongCount)||0));
}

export function answerRound(round, choice, now = Date.now(), timing = getAttackTiming()) {
  if (round.status !== 'playing') return null;
  const question = round.questions[round.index];
  if (!question.options.includes(choice)) return null;
  const elapsedMs = Math.max(0, now - round.questionStartedAt);
  const correct = choice === question.answer;
  const previousWrong=getWrongAttempts(round),wrongCount=previousWrong+(correct?0:1);
  const diamonds = getReward(correct, previousWrong);
  const hadMistake = (round.mistakes || []).includes(round.index) || round.answers.some(answer => !answer.correct && answer.questionIndex === round.index);
  const projectileIds = correct ? (hadMistake ? [pickProjectile().id] : createVolley(elapsedMs)) : [];
  const volleyTail = Math.max(0, projectileIds.length - 1) * VOLLEY_STAGGER;
  const feedback = {
    id: `${round.id}:${round.index}`,
    questionIndex: round.index,
    a: question.a,
    b: question.b,
    operation: question.operation || 'add',
    choice,
    answer: question.answer,
    correct,
    projectileId: projectileIds[0] || null,
    projectileIds,
    elapsedMs,
    diamonds,
    wrongCount,
    remainingReward:getReward(true,wrongCount),
    answeredAt: now,
    rewardCollected: diamonds === 0,
    enemyId: question.enemyId,
    ...timing,
    lastImpactDelay: timing.impactDelay + volleyTail,
    attackDuration: timing.attackDuration + volleyTail,
  };
  return {
    ...round,
    status: 'feedback',
    feedback,
    rewardRule:'accuracy-v1',
    wrongAttempts:{...(round.wrongAttempts||{}),[round.index]:wrongCount},
    mistakes: correct ? (round.mistakes || []) : [...new Set([...(round.mistakes || []), round.index])],
    answers: correct ? [...round.answers, feedback] : round.answers,
  };
}

export function getFeedbackState(round, now = Date.now()) {
  const feedback = round.feedback;
  if (round.status !== 'feedback' || !feedback) return null;
  const answeredAt = feedback.answeredAt ?? round.questionStartedAt + feedback.elapsedMs;
  const age = Math.max(0, now - answeredAt);
  if (!feedback.correct) return { phase: 'manual', age };
  const rewardStartsAt = answeredAt + (feedback.attackDuration || ATTACK_DURATION);
  const rewardEndsAt = rewardStartsAt + (feedback.diamonds > 0 ? DIAMOND_DURATION + (feedback.diamonds - 1) * DIAMOND_STAGGER : 0);
  const advanceAt = rewardEndsAt + AUTO_NEXT_DELAY;
  const phase = now < rewardStartsAt ? 'attack' : now < rewardEndsAt ? 'reward' : now < advanceAt ? 'waiting' : 'advance';
  return { phase, age, rewardStartsAt, rewardEndsAt, advanceAt };
}

export function collectRoundReward(round, now = Date.now()) {
  const state = getFeedbackState(round, now);
  const feedback = round.feedback;
  // 老版反馈未记录此字段，当时已经发放奖励，不能再次领取。
  if (!state || !feedback.correct || feedback.rewardCollected !== false || now < state.rewardEndsAt) return null;
  const collected = { ...feedback, rewardCollected: true };
  return {
    diamonds: feedback.diamonds,
    round: { ...round, feedback: collected, answers: round.answers.map(answer => answer.id === collected.id ? collected : answer) },
  };
}

export function advanceRound(round, now = Date.now()) {
  if (round.status !== 'feedback' || !round.feedback?.correct) return round;
  if (round.index === ROUND_LENGTH - 1) {
    return { ...round, status: 'complete', completedAt: now };
  }
  return { ...round, index: round.index + 1, status: 'playing', feedback: null, retryMessage: null, questionStartedAt: now };
}

export function retryRound(round) {
  if (round.status !== 'feedback' || round.feedback?.correct) return round;
  return { ...round, status: 'playing', feedback: null, mistakes: [...new Set([...(round.mistakes || []), round.index])], answers: round.answers.filter(a => a.correct || a.questionIndex !== round.index), retryMessage: `再想一想，本题还可得${getReward(true,getWrongAttempts(round))}个钻石。` };
}

export function summarizeRound(round) {
  const defeated = round.answers.filter(answer => answer.correct).length;
  const wrong = round.mistakes ? new Set(round.mistakes).size : round.answers.length - defeated;
  const correct = round.mistakes ? round.answers.length - wrong : defeated;
  return {
    id: round.id,
    heroId: round.heroId,
    modeId: getMode(round.modeId).id,
    correct,
    defeated,
    wrong,
    stars: wrong === 0 ? 3 : wrong <= 3 ? 2 : 1,
    diamonds: round.answers.reduce((sum, answer) => sum + answer.diamonds, 0) - (round.penalties || 0),
    startedAt: round.startedAt,
    completedAt: round.completedAt,
    answers: round.answers,
  };
}

