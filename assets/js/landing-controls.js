// Navigation and theme must work before the optional site configuration loads.
(()=>{
const themeButton = document.querySelector('.theme-toggle');
const menuButton = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('#mainNav');
function closeMenu() {
  menuButton.setAttribute('aria-expanded','false');
  menuButton.setAttribute('aria-label','打开导航菜单');
  mainNav.classList.remove('is-open');
}
menuButton.addEventListener('click',()=>{
  const open=menuButton.getAttribute('aria-expanded')!=='true';
  menuButton.setAttribute('aria-expanded',String(open));
  menuButton.setAttribute('aria-label',open?'关闭导航菜单':'打开导航菜单');
  mainNav.classList.toggle('is-open',open);
});
mainNav.addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
document.addEventListener('click',event=>{if(!event.target.closest('.header-inner'))closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuButton.getAttribute('aria-expanded')==='true'){closeMenu();menuButton.focus();}});
matchMedia('(max-width:700px)').addEventListener('change',closeMenu);
function paintTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeButton.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
  themeButton.setAttribute('aria-pressed', String(dark));
  document.querySelector('meta[name="theme-color"]').content=dark?'#15171c':'#ffffff';
  themeButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${dark ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>' : '<path d="M20.5 13a8.6 8.6 0 0 1-9.5-9.5A8.6 8.6 0 1 0 20.5 13Z"/>'}</svg>`;
}
themeButton.onclick = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try {const ui=JSON.parse(localStorage.getItem('qmj-clone:ui')||'{}');ui.theme=theme;localStorage.setItem('qmj-clone:ui',JSON.stringify(ui));} catch {}
  paintTheme();
};
paintTheme();

window.addEventListener('storage',event=>{if(event.key==='qmj-clone:ui'){try{document.documentElement.dataset.theme=JSON.parse(event.newValue||'{}').theme==='dark'?'dark':'light';paintTheme();}catch{}}});
})();
