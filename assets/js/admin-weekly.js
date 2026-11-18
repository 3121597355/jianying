import {SOURCES} from './attribution.js';
// 周报对比：本周、上周、四周前同期并排放在一屏，省掉每周自己导 CSV 再对比。
const ratio = value => value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
const change = (current, before) => {
  if (!Number.isFinite(current) || !Number.isFinite(before)) return '<span class="delta">—</span>';
  if (before === current) return '<span class="delta">持平</span>';
  if (!before) return current > 0 ? '<span class="delta delta-up">新增</span>' : '<span class="delta">—</span>';
  const rate = (current - before) / before;
  if (Math.abs(rate) < 0.005) return '<span class="delta">持平</span>';
  return `<span class="delta ${rate > 0 ? 'delta-up' : 'delta-down'}">${rate > 0 ? '+' : '−'}${Math.abs(Math.round(rate * 100))}%</span>`;
};
const channels = report => {
  const map = new Map();
  for (const row of report?.channels || []) {
    const key = row.source + '|' + (row.medium || '');
    const item = map.get(key) || {source: row.source, medium: row.medium || '', sessions: 0, started: 0, completed: 0};
    item.sessions += row.sessions;
    item.started += row.started;
    item.completed += row.completed;
    map.set(key, item);
  }
  return map;
};
export function weeklyView(data, ui) {
  const {esc, number, metric, table, panelBox, empty} = ui;
  const weeks = data?.weeks || [];
  if (!weeks.length) return empty('还没有周数据', '记录开始后，这里会按周并排展示本周、上周和四周前同期。');
  const current = weeks[0], now = current.current, prev = current.prevWeek, month = current.prevMonth;
  const windowText = item => item ? `${item.from} 至 ${item.to}<br><small>${item.days} 天</small>` : '—';
  const compareRow = (label, item) => item
    ? [label, windowText(item), number(item.views), `${number(item.sessions)}<br><small>日均 ${item.sessionsPerDay}</small>`, number(item.started), number(item.completed), ratio(item.completionRate)]
    : [label, '—', '—', '—', '—', '—', '—'];
  // 完成率是百分号文本，metric() 会按数字格式化，所以这一张单独拼。
  const rateCard = `<article class="metric"><div class="metric-label">开始后完成率</div><strong>${ratio(now.completionRate)}</strong><small>上周 ${ratio(prev && prev.completionRate)} · 四周前 ${ratio(month && month.completionRate)}</small></article>`;
  const cards = '<div class="metric-grid">' +
    metric('页面访问', number(now.views), `日均 ${now.viewsPerDay} · ${change(now.viewsPerDay, prev && prev.viewsPerDay)} 对上周日均`) +
    metric('开始制作', number(now.started), `日均 ${now.startedPerDay} · ${change(now.startedPerDay, prev && prev.startedPerDay)}`) +
    metric('完成导出', number(now.completed), `日均 ${now.completedPerDay} · ${change(now.completedPerDay, prev && prev.completedPerDay)}`) +
    rateCard +
    '</div>';
  const compare = panelBox(
    '本周 / 上周 / 四周前同期',
    `本周 ${now.from} 至 ${now.to}，按同一长度的一周窗口比较；本周还没过完，优先看日均。`,
    table(['周期', '起止', '页面访问', '访问会话', '开始制作', '完成导出', '开始后完成率'], [
      compareRow('本周（进行中）', now),
      compareRow('上周', prev),
      compareRow('四周前同期', month)
    ])
  );
  const history = panelBox(
    `最近 ${weeks.length} 周`,
    '按周回看趋势。环比用同一口径的日均，避免本周没过完时看起来在掉。',
    table(['周', '起止', '页面访问', '访问会话', '开始制作', '完成导出', '开始后完成率', '会话环比'],
      weeks.map(item => [
        item.index === 0 ? '本周' : `${item.index} 周前`,
        `${item.from} 至 ${item.to}<br><small>${item.current.days} 天${item.inProgress ? ' · 进行中' : ''}</small>`,
        number(item.current.views),
        number(item.current.sessions),
        number(item.current.started),
        number(item.current.completed),
        ratio(item.current.completionRate),
        change(item.current.sessionsPerDay, item.prevWeek && item.prevWeek.sessionsPerDay)
      ]))
  );
  const nowChannels = channels(now), beforeChannels = channels(prev);
  const top = [...nowChannels.entries()].sort((a, b) => b[1].sessions - a[1].sessions).slice(0, 6);
  const sourceRows = top.length
    ? table(['来源', '本周会话', '上周会话', '变化', '开始制作', '完成导出'], top.map(([key, item]) => [
      `${esc(SOURCES[item.source] || (item.source === 'legacy' ? '历史来源未标记' : item.source))}${item.medium ? `<br><small>${esc(item.medium)}</small>` : ''}`,
      number(item.sessions),
      number(beforeChannels.get(key)?.sessions || 0),
      change(item.sessions, beforeChannels.get(key)?.sessions),
      number(item.started),
      number(item.completed)
    ]))
    : empty('本周还没有来源数据', '等有新访问后，这里会显示各渠道的变化。');
  const sources = panelBox('来源变化', '本周与上周同一渠道的会话对比，先看哪个渠道真的带来了开始制作。', sourceRows);
  return cards + compare + history + sources + `<p class="settings-help">${esc(data.notice || '')}</p>`;
}
