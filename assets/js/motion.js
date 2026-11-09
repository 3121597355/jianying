// Match the portfolio's soft deceleration, with a shorter rhythm for editing.
const timing = {duration:360, easing:'cubic-bezier(.22,1,.36,1)'};
const animations = new WeakMap();
const runningAnimations = new Set();
const media = matchMedia('(prefers-reduced-motion: reduce)');
let motionMode = 'system';
export function applyMotionPreference(mode) {
  motionMode=['system','soft','reduce'].includes(mode)?mode:'system';
  document.documentElement.dataset.motion=motionMode==='system'?(media.matches?'reduce':'soft'):motionMode;
  if (document.documentElement.dataset.motion==='reduce') {
    runningAnimations.forEach(animation=>animation.cancel());
    runningAnimations.clear();
  }
}
try {motionMode=JSON.parse(localStorage.getItem('qmj-clone:ui')||'{}').motionMode||'system';} catch {}
applyMotionPreference(motionMode);
media.addEventListener('change',()=>applyMotionPreference(motionMode));
const reduced = () => document.documentElement.dataset.motion==='reduce';

function play(element,keyframes,options=timing) {
  animations.get(element)?.cancel();
  const animation=element.animate(keyframes,options);
  animations.set(element,animation);
  runningAnimations.add(animation);
  const clean=()=>{runningAnimations.delete(animation);if(animations.get(element)===animation)animations.delete(element);};
  animation.onfinish=clean;
  animation.oncancel=clean;
  return animation;
}

/** Read the visible position before cancelling an interrupted transition. */
export function captureElement(element) {
  if (!element) return null;
  const bounds=element.getBoundingClientRect();
  const style=getComputedStyle(element);
  const snapshot={bounds,opacity:Number(style.opacity),visibility:style.visibility};
  animations.get(element)?.cancel();
  return snapshot;
}

export function animateIn(element) {
  if (!element || reduced()) return;
  play(element,[
    {opacity:0, transform:'translateY(6px)'},
    {opacity:1, transform:'none'},
  ], {...timing,duration:240});
}

/** Reveal inside the viewport, and rearm only after content has fully left it. */
export function revealOnScroll(items) {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  const targets = new Map(items.filter(item => item.element).map(item => [item.element, {delay:item.delay || 0, ready:true}]));
  const pendingClass = 'scroll-reveal-pending';
  const prepare = (element, state) => {
    if (element.contains(document.activeElement)) return;
    state.ready = true;
    animations.get(element)?.cancel();
    element.classList.add(pendingClass);
  };
  targets.forEach((state, element) => {
    // Only prepare below-the-fold content; without JS/CSS support it stays readable.
    if (element.getBoundingClientRect().top >= innerHeight - 80) prepare(element, state);
  });
  const observer = new IntersectionObserver(entries => {
    for (const {target, isIntersecting} of entries) {
      const state = targets.get(target);
      // Background loading must not consume an entrance before the user can see it.
      if (!isIntersecting || !state?.ready || document.hidden) continue;
      state.ready = false;
      target.classList.remove(pendingClass);
      if (reduced() || target.contains(document.activeElement)) continue;
      play(target, [
        {opacity:0, transform:'translateY(32px)'},
        {opacity:1, transform:'none'},
      ], {...timing, duration:850, delay:state.delay, fill:'backwards'});
    }
  }, {threshold:0, rootMargin:'0px 0px -80px 0px'});
  // The wider boundary prevents repeated playback from tiny scroll reversals.
  const resetObserver = new IntersectionObserver(entries => {
    if (document.hidden) return;
    for (const {target, isIntersecting} of entries) {
      if (!isIntersecting && targets.has(target)) prepare(target, targets.get(target));
    }
  }, {threshold:0, rootMargin:'100px 0px 100px 0px'});
  targets.forEach((_, element) => { observer.observe(element); resetObserver.observe(element); });
  const showFocused = event => {
    targets.forEach((state, element) => {
      if (!element.contains(event.target)) return;
      state.ready = false;
      animations.get(element)?.cancel();
      element.classList.remove(pendingClass);
    });
  };
  const resumeVisible = () => {
    if (document.hidden) {
      targets.forEach((state, element) => {
        if (!animations.has(element)) return;
        state.ready = true;
        animations.get(element)?.cancel();
      });
      return;
    }
    // Force a fresh observation when switching back from a background tab.
    observer.disconnect();
    resetObserver.disconnect();
    targets.forEach((_, element) => { observer.observe(element); resetObserver.observe(element); });
  };
  document.addEventListener('focusin', showFocused);
  document.addEventListener('visibilitychange', resumeVisible);
  return () => {
    observer.disconnect();
    resetObserver.disconnect();
    document.removeEventListener('focusin', showFocused);
    document.removeEventListener('visibilitychange', resumeVisible);
    targets.forEach((_, element) => { animations.get(element)?.cancel(); element.classList.remove(pendingClass); });
  };
}

/** 在最终布局上平移、缩放纸张，避免每帧修改宽度并反复排版。 */
export function capturePaper(element) {
  return captureElement(element)?.bounds || null;
}
export function moveElement(element, before, {scale=false}={}) {
  if (!element || !before || reduced()) return;
  const after = element.getBoundingClientRect();
  if (!after.width || !before.width) return;
  const zoom = Number(getComputedStyle(element).zoom) || 1;
  const x = (before.left-after.left)/zoom, y = (before.top-after.top)/zoom;
  const ratio = scale?before.width/after.width:1;
  if (Math.abs(x)<.5 && Math.abs(y)<.5 && Math.abs(ratio-1)<.001) return;
  play(element,[
    {transform:`translate(${x}px,${y}px) scale(${ratio})`},
    {transform:'none'},
  ]);
}
export function movePaper(element,before) {
  moveElement(element,before,{scale:true});
}

/** Slide the full-width sidebar; its inputs never squeeze into the collapsed rail. */
export function slideSidebar(element,before,open) {
  if (!element || !before || reduced()) return;
  const after=element.getBoundingClientRect();
  const hidden=before.visibility==='hidden' || before.opacity<=0;
  const x=hidden?after.width+36:before.bounds.left-after.left;
  const y=hidden?0:before.bounds.top-after.top;
  play(element,[
    {transform:`translate(${x}px,${y}px)`,opacity:hidden?0:before.opacity,visibility:'visible'},
    {transform:open?'none':`translateX(${after.width+36}px)`,opacity:open?1:0,visibility:'visible'},
  ]);
}

/** 先应用最终状态，再由旧高度过渡；结束后恢复内容自己的高度。 */
export function animateDisclosure(element, change) {
  const previous = animations.get(element);
  const height = element.getBoundingClientRect().height;
  previous?.cancel();
  change();
  if (reduced()) return;
  const next = element.getBoundingClientRect().height;
  play(element,[{height:`${height}px`,overflow:'hidden'},{height:`${next}px`,overflow:'hidden'}]);
}
