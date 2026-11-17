import './member-nav.js';
import './analytics.js';
const button=document.querySelector('.content-theme');
function paint(){
  const dark=document.documentElement.dataset.theme==='dark';
  button.setAttribute('aria-label',dark?'切换到浅色模式':'切换到深色模式');
  button.setAttribute('aria-pressed',String(dark));
  document.querySelector('meta[name="theme-color"]').content=dark?'#15171c':'#ffffff';
  button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${dark?'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>':'<path d="M20.5 13a8.6 8.6 0 0 1-9.5-9.5A8.6 8.6 0 1 0 20.5 13Z"/>'}</svg>`;
}
button.addEventListener('click',()=>{
  document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';
  try{const ui=JSON.parse(localStorage.getItem('qmj-clone:ui')||'{}');ui.theme=document.documentElement.dataset.theme;localStorage.setItem('qmj-clone:ui',JSON.stringify(ui));}catch{}
  paint();
});
window.addEventListener('storage',event=>{if(event.key==='qmj-clone:ui'){try{document.documentElement.dataset.theme=JSON.parse(event.newValue||'{}').theme==='dark'?'dark':'light';paint();}catch{}}});
paint();
