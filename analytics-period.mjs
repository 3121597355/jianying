// 统计口径只保留一条时间线：过滤部署（2026-11-16 03:10 UTC+8）前后的记录合并统计，
// 不再把「新周期 / 历史数据」拆成两份。分界之前混有本人访问、调试与自动化流量，
// 所以只在说明和 CSV 里标注，不用它来宣称真实用户量。
export const ANALYTICS_CLEAN_SINCE = Date.parse('2026-11-15T19:11:00.000Z');
export const ANALYTICS_CLEAN_LABEL = '2026-11-16 03:11（北京时间）';
const validTime = value => Number.isFinite(value);
export function analyticsScope() {
  return 'all';
}
export function selectAnalyticsPeriod({events=[],visits=[],range}) {
  const selectedEvents = events.filter(event=>validTime(event.time));
  // 时长快照无法在分界处准确切分，过去会被两侧排除；现在整段都保留。
  const selectedVisits = visits.filter(visit=>validTime(visit.startedAt)&&validTime(visit.updatedAt));
  const collection = {
    scope:'all',
    label:'全部记录',
    cleanSince:ANALYTICS_CLEAN_LABEL,
    range,
    notice:`已合并 ${ANALYTICS_CLEAN_LABEL} 前后的记录一起统计。这个时间点之前的访问混有本人访问、调试与自动化流量，那几天的数字会偏高，不能直接当作真实用户量。`,
    durationNotice:'页面停留按每次访问快照统计，跨零点不切分。'
  };
  return {events:selectedEvents,visits:selectedVisits,range,collection};
}
export function analyticsCsvNotes(collection) {
  if (!collection) return [];
  return [[],['数据口径',collection.label],['清洁记录起点',collection.cleanSince||''],['统计日期',collection.range?`${collection.range.from} 至 ${collection.range.to}`:'所选日期没有记录'],['数据说明',collection.notice]];
}
