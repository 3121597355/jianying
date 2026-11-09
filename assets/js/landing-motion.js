import { revealOnScroll } from './motion.js';

export function setupLandingMotion() {
  document.querySelector('.hero-copy')?.addEventListener('focusin', event => {
    event.currentTarget.classList.add('intro-complete');
  }, {once:true});
  const reveals = [];
  const group = (selector, interval=0) => document.querySelectorAll(selector).forEach((element, index) => {
    reveals.push({element, delay:Math.min(index, 3) * interval});
  });
  group('.benefits > div', 100);
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
