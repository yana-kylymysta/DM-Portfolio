// ============================================================
// smooth-scroll.js — Lenis smooth scroll + ScrollTrigger sync
// Must load BEFORE reel.js / motion-system.js / reel-overlay.js
// Exposes window.__lenis for other scripts that need scroll events.
// ============================================================

(function () {
  'use strict';

  // Bail-out: reduced motion users get the native scroll
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Bail-out: no Lenis loaded (CDN failed) → graceful degrade
  if (typeof Lenis === 'undefined') {
    console.warn('[smooth-scroll] Lenis not available — using native scroll');
    return;
  }

  // ── Lenis instance ─────────────────────────────────────────
  // duration: how long an inertia roll lasts after the user lets go.
  // 1.05 feels editorial — fast enough to follow intent, slow enough
  // to be cinematic. Easing is the standard "expo out" curve.
  //
  // syncTouch: true — critical for iOS / mobile WebKit. Without it,
  // native touch scroll bypasses Lenis' ticker, so the 'scroll' event
  // never fires during a finger drag → ScrollTrigger.update() never
  // runs → reveal triggers fire late or skip frames ("jumping" anims).
  // syncTouchLerp keeps the native feel by using a near-zero smoothing
  // factor; we're syncing for ScrollTrigger's sake, not smoothing touch.
  const lenis = new Lenis({
    duration: 1.05,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 1,
    syncTouch: true,
    syncTouchLerp: 0.075,
    touchInertiaMultiplier: 25,
  });

  window.__lenis = lenis;

  // ── GSAP / ScrollTrigger sync ──────────────────────────────
  // ScrollTrigger reads window.scrollY each tick. Lenis writes to it
  // via requestAnimationFrame. We must drive Lenis from the same
  // ticker GSAP uses, so they're always in lockstep — otherwise the
  // pinned section drifts a frame behind and the parallax stutters.
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    lenis.on('scroll', ScrollTrigger.update);

    gsap.ticker.add((time) => {
      // gsap.ticker uses seconds; Lenis raf expects ms
      lenis.raf(time * 1000);
    });

    // Don't lag — we already drive it on every tick
    gsap.ticker.lagSmoothing(0);

    // NOTE: removed visualViewport.resize → ScrollTrigger.refresh().
    // Address bar slide on iOS fires it continuously, and each refresh
    // can re-invalidate tweens that haven't fired yet — re-applying
    // their from-state inline → producing the visible "appear → hide →
    // animate" stutter Yana caught on video. ScrollTrigger handles the
    // standard window 'resize' event natively, which is sufficient for
    // genuine viewport changes (orientation, real resize).
  } else {
    // GSAP not present yet — fallback to plain RAF loop
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  // ── Anchor links: route through Lenis for smooth jumps ─────
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: 0, duration: 1.2 });
  });
})();
