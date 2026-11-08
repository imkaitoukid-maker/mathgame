export const STUDY_LIMIT = 10 * 60 * 1000;
export const BREAK_LENGTH = 5 * 60 * 1000;

export function normalizeStudy(value) {
  const elapsedMs = Number.isFinite(value?.elapsedMs) ? Math.max(0, Math.min(STUDY_LIMIT, value.elapsedMs)) : 0;
  const paused = Number.isFinite(value?.pauseStartedAt) && Number.isFinite(value?.breakUntil);
  return { elapsedMs, lastActiveAt: null, pauseStartedAt: paused ? value.pauseStartedAt : null, breakUntil: paused ? value.breakUntil : null };
}

// Only foreground time on the answering screen counts. A loaded save starts
// with no active anchor so time spent with the app closed is never counted.
export function advanceStudyClock(study, now, active) {
  if (study.pauseStartedAt !== null) return { ...study, lastActiveAt: null };
  const elapsedMs = Math.min(STUDY_LIMIT, study.elapsedMs + (study.lastActiveAt === null ? 0 : Math.max(0, now - study.lastActiveAt)));
  if (elapsedMs >= STUDY_LIMIT) return { elapsedMs, lastActiveAt: null, pauseStartedAt: now, breakUntil: now + BREAK_LENGTH };
  return { ...study, elapsedMs, lastActiveAt: active ? now : null };
}

export function finishStudyBreak(study, round, now) {
  if (study.pauseStartedAt === null || now < study.breakUntil) return null;
  const pausedMs = Math.max(0, now - study.pauseStartedAt);
  let resumedRound = round;
  if (round && round.status !== 'complete') {
    const shift = item => ({ ...item, answeredAt: (item.answeredAt ?? round.questionStartedAt + item.elapsedMs) + pausedMs });
    const feedback = round.feedback ? shift(round.feedback) : null;
    resumedRound = { ...round, questionStartedAt: round.questionStartedAt + pausedMs, feedback,
      answers: round.answers.map(answer => feedback && answer.id === feedback.id ? { ...answer, answeredAt: feedback.answeredAt } : answer) };
  }
  return { study: normalizeStudy(), round: resumedRound };
}
