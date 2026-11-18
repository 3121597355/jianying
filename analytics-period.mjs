// 统计口径只保留一条时间线：过滤部署（2026-11-16 03:10 UTC+8）前后的记录合并统计，
// 不再把「新周期 / 历史数据」拆成两份。分界之前混有本人访问、调试与自动化流量，
// 所以只在说明和 CSV 里标注，不用它来宣称真实用户量。
export const ANALYTICS_CLEAN_SINCE = Date.parse('2026-11-15T19:11:00.000Z');
export const ANALYTICS_CLEAN_LABEL = '2026-11-16 03:11（北京时间）';
/** 清洁分界所在的北京日期，干净口径从这里开始取数。 */
export const ANALYTICS_CLEAN_DAY = new Date(ANALYTICS_CLEAN_SINCE + 8 * 3600000).toISOString().slice(0, 10);
const validTime = value => Number.isFinite(value);
export function analyticsScope() {
  return 'all';
}
export function selectAnalyticsPeriod({events=[],visits=[],range,scope='all'}) {
  // scope=clean：只保留清洁分界之后的记录，把早期本人访问、调试与自动化流量整体排除。
  const clean = scope === 'clean';
  const after = time => validTime(time) && (!clean || time >= ANALYTICS_CLEAN_SINCE);
  const selectedEvents = events.filter(event=>after(event.time));
  // 时长快照无法在分界处准确切分，过去会被两侧排除；现在整段都保留。
  const selectedVisits = visits.filter(visit=>validTime(visit.startedAt)&&validTime(visit.updatedAt)&&(!clean||visit.startedAt>=ANALYTICS_CLEAN_SINCE));
  const collection = clean ? {
    scope:'clean',
    label:'干净记录',
    cleanSince:ANALYTICS_CLEAN_LABEL,
    range,
    notice:`只统计 ${ANALYTICS_CLEAN_LABEL} 之后的记录，之前的本人访问、调试与自动化流量已排除。天数变少，日均和转化率对单日波动更敏感。`,
    durationNotice:'页面停留按每次访问快照统计，跨零点不切分。'
  } : {
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

export const ANALYTICS_RETENTION_DAYS = 90;

/**
 * 后台一次概览请求到底要读多久的数据：
 * 概览要跟「等长的上一期」对比，所以必须盖住 所选区间 + 上一期；
 * 不要再像以前那样一律读 90 天，否则看 7 天也要搬整季的明细。
 * 返回值是毫秒时间戳，下限仍是 90 天保留期。
 */
export function analyticsWindowStart(range, now = Date.now()) {
  const day = 86400000;
  const from = Date.parse(`${range?.from || ''}T00:00:00Z`);
  const to = Date.parse(`${range?.to || ''}T00:00:00Z`);
  const valid = Number.isFinite(from) && Number.isFinite(to) && to >= from;
  const span = valid ? to - from + day : 30 * day;
  const start = (valid ? from : now - 30 * day) - span;
  return Math.max(now - ANALYTICS_RETENTION_DAYS * day, Math.min(now, start));
}
