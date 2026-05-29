// ============================================================
// reel-overlay.js — drives the cinematic overlay on the reel:
//   • timecode counts up
//   • playhead scans across the video horizontally as you scroll
//   • in-view class triggers entrance corner reveals
//
// v8 change: playhead no longer subscribes to the scroll event.
// During pin Lenis sometimes batches scroll updates between rAF
// frames; reading getBoundingClientRect() inside the scroll
// handler gave a different value than what the GSAP timeline
// rendered → 1-frame visual desync, looked like a "stutter".
// We now poll inside a rAF loop only while the section is in
// view — single source of truth, single timing pipeline.
// ============================================================

(function () {
  'use strict';

  const section = document.querySelector('.reel-statement');
  if (!section) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 1. In-view trigger ─────────────────────────────────
  let inView = false;
  const inViewObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && e.intersectionRatio > 0.18) {
        section.classList.add('in-view');
        inView = true;
      } else if (e.intersectionRatio < 0.05) {
        inView = false;
      }
    });
  }, { threshold: [0.05, 0.18, 0.5] });
  inViewObs.observe(section);

  // ── 2. Timecode counter ────────────────────────────────
  const tcEl = section.querySelector('.reel-overlay-tc-val');
  const frameEl = section.querySelector('.reel-overlay-frame-num');
  let tcStartTime = null;

  function frameToSMPTE(f) {
    const ff = Math.floor(f % 24);
    const ss = Math.floor((f / 24) % 60);
    const mm = Math.floor((f / 24 / 60) % 60);
    const hh = Math.floor(f / 24 / 60 / 60);
    return [hh, mm, ss, ff].map(n => String(n).padStart(2, '0')).join(':');
  }

  // ── 3. Horizontal playhead — rAF, gated by inView ──────
  const playhead = section.querySelector('.reel-overlay-playhead');

  // Throttle DOM writes: only update if value changed by ≥0.5%
  let lastX = -1;

  function frame() {
    // Timecode tick
    if (tcEl && !reduceMotion) {
      if (tcStartTime === null) tcStartTime = performance.now();
      const elapsedMs = performance.now() - tcStartTime;
      const fnum = Math.floor((elapsedMs / 1000) * 24);
      tcEl.textContent = frameToSMPTE(fnum);
      if (frameEl) {
        frameEl.textContent = `FRAME ${String(1000 + fnum).padStart(4, '0')}`;
      }
    }

    // Playhead — only when in view (scroll-progress driven)
    if (playhead && inView && !reduceMotion) {
      const r = section.getBoundingClientRect();
      const winH = innerHeight;
      const total = r.height + winH;
      const traveled = winH - r.top;
      const progress = Math.max(0, Math.min(1, traveled / total));
      const x = 5 + progress * 90;
      if (Math.abs(x - lastX) > 0.5) {
        playhead.style.setProperty('--playhead-x', `${x}vw`);
        lastX = x;
      }
    }

    requestAnimationFrame(frame);
  }

  if (!reduceMotion) requestAnimationFrame(frame);
})();
