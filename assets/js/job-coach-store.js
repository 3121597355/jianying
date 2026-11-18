/**
 * AI 简历建议的持久化：收起侧栏、刷新页面、切换简历之后都能把建议找回来。
 * 只保存在本机（localStorage），按「账户 + 简历」分开存，不写 API Key。
 */
const PREFIX = 'yizhi:job-coach:';
const VERSION = 1;
const JD_LIMIT = 12000;
const TITLE_LIMIT = 80;
/** 简历副本里带照片 data URL；太大时不硬塞，先试完整写入，失败再退回只存文字。 */
const RESULT_BUDGET = 3500000;
const FEEDBACK_LIMIT = 8;

const host = () => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

const text = (value, limit) => String(value ?? '').slice(0, limit);

export function jobCoachKey(ownerId, resumeId) {
  return PREFIX + String(ownerId || 'local') + ':' + String(resumeId || 'draft');
}

/** 只保留认识的结构，避免旧数据或外部写入把面板渲染搞崩。 */
function cleanResult(result) {
  if (!result || typeof result !== 'object') return null;
  const mode = ['review', 'ai', 'basic'].includes(result.mode) ? result.mode : 'ai';
  return {
    mode,
    resume: result.resume && typeof result.resume === 'object' ? result.resume : null,
    analysis: result.analysis && typeof result.analysis === 'object' ? result.analysis : null,
    findings: Array.isArray(result.findings) ? result.findings.slice(0, 20) : [],
    highlights: Array.isArray(result.highlights) ? result.highlights.slice(0, 12) : [],
    changes: Array.isArray(result.changes) ? result.changes.slice(0, 30) : [],
    warnings: Array.isArray(result.warnings) ? result.warnings.slice(0, 12) : [],
    adoptable: result.resume ? result.adoptable !== false : false
  };
}

function cleanFeedbackMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-FEEDBACK_LIMIT).map(item => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    text: text(item?.text, 2000),
    createdAt: Number(item?.createdAt) || 0
  })).filter(item => item.text);
}

export function loadJobCoach(ownerId, resumeId) {
  const store = host();
  if (!store) return null;
  try {
    const raw = JSON.parse(store.getItem(jobCoachKey(ownerId, resumeId)) || 'null');
    if (!raw || raw.version !== VERSION) return null;
    const result = cleanResult(raw.result);
    return {
      version: VERSION,
      jobTitle: text(raw.jobTitle, TITLE_LIMIT),
      jd: text(raw.jd, JD_LIMIT),
      sourceKey: text(raw.sourceKey || 'current', 120),
      baselineHash: text(raw.baselineHash, 40),
      applied: !!raw.applied,
      result,
      pendingResult: cleanResult(raw.pendingResult),
      feedbackMessages: cleanFeedbackMessages(raw.feedbackMessages),
      createdAt: Number(raw.createdAt) || 0,
      updatedAt: Number(raw.updatedAt) || 0
    };
  } catch { return null; }
}

/**
 * 保存建议。空间不够时退回「只存建议文字」的版本，
 * 调用方根据 full=false 提示用户重新生成后才能一键采用。
 */
export function saveJobCoach(ownerId, resumeId, state) {
  const store = host();
  if (!store) return { ok: false, full: false, reason: 'unavailable' };
  const key = jobCoachKey(ownerId, resumeId);
  const now = Date.now();
  const base = {
    version: VERSION,
    jobTitle: text(state?.jobTitle, TITLE_LIMIT),
    jd: text(state?.jd, JD_LIMIT),
    sourceKey: text(state?.sourceKey || 'current', 120),
    baselineHash: text(state?.baselineHash, 40),
    applied: !!state?.applied,
    opened: !!state?.opened,
    createdAt: Number(state?.createdAt) || now,
    updatedAt: now
  };
  const result = cleanResult(state?.result);
  const pendingResult = cleanResult(state?.pendingResult);
  const feedbackMessages = cleanFeedbackMessages(state?.feedbackMessages);
  const payload = { ...base, result, pendingResult, feedbackMessages };
  if (!result || JSON.stringify(payload).length <= RESULT_BUDGET) {
    const outcome = write(store, key, payload, true);
    if (outcome.ok) return outcome;
  }
  // 本机空间放不下完整简历副本时，至少把建议文字留住，提示用户重新生成后再采用。
  return write(store, key, {
    ...payload,
    result: result ? { ...result, resume: null, adoptable: false } : null,
    pendingResult: pendingResult ? { ...pendingResult, resume: null, adoptable: false } : null
  }, false);
}

function write(store, key, payload, full) {
  try {
    store.setItem(key, JSON.stringify(payload));
    return { ok: true, full };
  } catch (error) {
    return { ok: false, full: false, reason: error?.name === 'QuotaExceededError' ? 'quota' : 'error' };
  }
}

export function clearJobCoach(ownerId, resumeId) {
  const store = host();
  if (!store) return;
  try { store.removeItem(jobCoachKey(ownerId, resumeId)); } catch {}
}
