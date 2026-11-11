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
  return changed ? {...settings, site} : settings;
}
