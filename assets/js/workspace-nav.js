export const WORKSPACE_NAV = [
  { id:'profile', label:'个人简介', href:'/resume/', icon:'<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3M8 21h8"/>' },
  { id:'settings', label:'简历设置', href:'/resume/?settings=1', icon:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8m-8 4h8m-8 4h5"/>' },
  { id:'templates', label:'更换模板', href:'/resume/?templates=1', icon:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M10 9v12"/>' },
  { id:'portrait', label:'证件照', href:'/portrait/', icon:'<rect x="3" y="2" width="18" height="20" rx="2"/><circle cx="12" cy="8" r="3"/><path d="M6 19v-2a6 6 0 0 1 12 0v2Z"/>' },
];
export const RESUME_ENTRY_TARGETS = WORKSPACE_NAV.filter(item=>item.href.startsWith('/resume/')).map(item=>item.href);
export function portraitNavigationMarkup() {
  return WORKSPACE_NAV.map(({id,label,href,icon})=>`<a href="${href}" ${id==='portrait'?'aria-current="page"':'data-return'}><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${label}</span></a>`).join('');
}
