// The filtering deployment finished at 2026-11-16 03:10:01.486 (UTC+8).
// Use the next complete minute as a conservative, fixed reporting boundary.
// This must not move on subsequent deployments or delete stored events.
export const ANALYTICS_FILTERED_SINCE = Date.parse('2026-11-15T19:11:00.000Z');
export const ANALYTICS_FILTERED_LABEL = '2026-11-16 03:11（北京时间）';
const boundaryDay = '2026-11-16';
const invalidScope = () => Object.assign(new Error('请选择新周期或历史数据。'), {status:400});
export function analyticsScope(params) {
  const scope = params.get('scope') ?? 'current';
  if (!['current','history'].includes(scope)) throw invalidScope();
  return scope;
}
export function selectAnalyticsPeriod({events=[],visits=[],range,scope='current'}) {
  if (!['current','history'].includes(scope)) throw invalidScope();
  const current = scope === 'current';
  const reportRange = current
    ? {from:range.from > boundaryDay ? range.from : boundaryDay,to:range.to}
    : {from:range.from,to:range.to < boundaryDay ? range.to : boundaryDay};
  const selectedEvents = events.filter(e=>Number.isFinite(e.time) && (current ? e.time >= ANALYTICS_FILTERED_SINCE : e.time < ANALYTICS_FILTERED_SINCE));
  // A visit's visible duration cannot be accurately split at the boundary.
  // Exclude straddling visits from both periods instead of estimating it.
  const selectedVisits = visits.filter(v=>Number.isFinite(v.startedAt) && Number.isFinite(v.updatedAt) && (current ? v.startedAt >= ANALYTICS_FILTERED_SINCE : v.updatedAt < ANALYTICS_FILTERED_SINCE));
  const collection = {
    scope,
    label:current ? '新周期' : '历史数据',
    since:new Date(ANALYTICS_FILTERED_SINCE).toISOString(),
    boundaryLabel:ANALYTICS_FILTERED_LABEL,
    range:reportRange.from <= reportRange.to ? reportRange : null,
    notice:current
      ? '仅统计过滤规则上线后的记录，已排除历史数据。匿名会话仍不等于真人数，无法保证识别所有自动化访问。'
      : '过滤规则上线前的记录，包含无法准确剥离的本人访问、调试与自动化流量，不作为真实用户量证明。',
    durationNotice:'跨分界时间的页面停留不参与两侧时长统计；操作事件按发生时间划分。'
  };
  return {events:selectedEvents,visits:selectedVisits,range:reportRange,collection};
}
export function analyticsCsvNotes(collection) {
  if (!collection) return [];
  return [[],['数据口径',collection.label],['分界时间',collection.boundaryLabel],['实际统计日期',collection.range ? `${collection.range.from} 至 ${collection.range.to}` : '所选日期与该周期无交集'],['数据说明',collection.notice],['时长说明',collection.durationNotice]];
}
