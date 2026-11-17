import { revealOnScroll, applyMotionPreference } from './motion.js';

/** 页脚的动效开关：站内默认为「开启」，这里只提供用户主动减弱的选择。 */
export function setupMotionToggle() {
  const button = document.querySelector('[data-motion-toggle]');
  if (!button) return;
  const paint = () => {
    const reduced = document.documentElement.dataset.motion === 'reduce';
    button.textContent = reduced ? '动效：已减弱' : '动效：开启';
    button.setAttribute('aria-pressed', String(reduced));
    button.title = reduced ? '点击恢复入场动效' : '点击减弱动效';
  };
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.motion === 'reduce' ? 'soft' : 'reduce';
    applyMotionPreference(next);
    try {
      const ui = JSON.parse(localStorage.getItem('qmj-clone:ui') || '{}');
      ui.motionMode = next;
      localStorage.setItem('qmj-clone:ui', JSON.stringify(ui));
    } catch {}
    paint();
  });
  window.addEventListener('storage', event => { if (event.key === 'qmj-clone:ui') paint(); });
  paint();
}

export function setupLandingMotion() {
  document.querySelector('.hero-copy')?.addEventListener('focusin', event => {
    event.currentTarget.classList.add('intro-complete');
  }, {once:true});
  const reveals = [];
  const group = (selector, interval=0) => document.querySelectorAll(selector).forEach((element, index) => {
    reveals.push({element, delay:Math.min(index, 3) * interval});
  });
  group('.paper-principle-heading');
  group('.paper-principle-steps > li', 80);
  group('.section-heading > div');
  group('.section-heading > .text-link', 60);
  group('.template-card', 120);
  group('.section-note');
  group('.portrait-intro > div:first-child');
  group('.mini-portrait', 120);
  group('.faq-section details', 80);
  group('.closing > h2');
  group('.closing > a', 60);
  group('footer > *', 40);
  revealOnScroll(reveals);

  const header = document.querySelector('.site-header');
  let frame = 0;
  const updateHeader = () => {
    frame = 0;
    header?.classList.toggle('is-scrolled', scrollY > 12);
  };
  window.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(updateHeader);
  }, {passive:true});
  window.addEventListener('pageshow', updateHeader);
  updateHeader();
}
