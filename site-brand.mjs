// Upgrade saved site copy without replacing administrator settings or user data.
export function upgradeSiteBrand(settings) {
  if (!settings?.site) return settings;
  const site = {...settings.site};
  let changed = false;
  for (const key of ['title', 'kicker', 'headline', 'description']) {
    if (typeof site[key] === 'string' && site[key].includes('简影')) {
      site[key] = site[key].replaceAll('简影', '一纸简历');
      changed = true;
    }
  }
  // Upgrade only the shipped defaults; administrator-written copy remains intact.
  if(site.title==="一纸简历 · 开源的简历与证件照一站式工具"){site.title="免费在线简历制作与证件照换底 · 一纸简历";changed=true;}
  if(site.description==='简约模板、实时排版、照片换底。\n无需注册，打开就能用。'){site.description='免费编辑简历、导出 PDF、制作证件照。\n无需注册，打开就能用。';changed=true;}
  return changed ? {...settings, site} : settings;
}
