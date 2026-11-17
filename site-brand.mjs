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
  if(['一纸简历 · 开源的简历与证件照一站式工具','免费在线简历制作与证件照换底 · 一纸简历'].includes(site.title)){site.title='一纸简历 · 免费在线简历制作、PDF 导出与证件照换底';changed=true;}
  if(site.description==='简约模板、实时排版、照片换底。\n无需注册，打开就能用。'){site.description='免费编辑简历、导出 PDF、制作证件照。\n无需注册，打开就能用。';changed=true;}
  const paperCopy={
    kicker:[['开源 · 简洁 · 一站式','一纸原则 · 开源 · 免费','一纸原则 · 一站准备 · 免费开源'],'简洁 · 免费 · 无广告'],
    headline:[['简历，是做取舍。\n一纸，写出重点。','简历与证件照，\n一站准备好。'],'简历与证件照\n一站准备好'],
    description:[['免费编辑简历、导出 PDF、制作证件照。\n无需注册，打开就能用。','把与岗位最相关的经历，清楚地留在一页里。\n免费编辑、导出 PDF、制作证件照，一站准备求职材料。'],'简历，是做取舍。把与岗位相关的经历，清楚地留在一页里。\n免费编辑简历、导出 PDF、制作证件照，打开就能用。'],
  };
  for(const [key,[previous,next]] of Object.entries(paperCopy)){
    if(previous.includes(site[key])){site[key]=next;changed=true;}
  }
  return changed ? {...settings, site} : settings;
}
