// ============================================================
// reel.js — REEL section: cinematic scroll choreography (v8)
//
// What changed vs v7 / why it stuttered before:
//   1. ONE pinned timeline now drives everything — reel reveal,
//      typography exit, AND the process-section curtain. No more
//      two competing ScrollTriggers fighting over the same pixels.
//   2. Pin range = +=200% (was 110%) → more room for each beat,
//      so each animation reads instead of flashing past.
//   3. scrub = true (with Lenis driving the scroll). Lenis already
//      smooths input; double-smoothing (scrub: 1 + native scroll)
//      created the "judder" feeling. Single source of inertia now.
//   4. Process section is positioned ABSOLUTELY over the reel during
//      the pinned phase using a clip-path inset reveal — it doesn't
//      arrive from elsewhere, it materializes in place. Result: it
//      can fully cover the video without any layout jump.
//   5. All transforms hit translate3d / scale via GSAP's force3D —
//      compositor-only, no layout/paint.
//   6. invalidateOnRefresh + ScrollTrigger.refresh() on full load
//      keeps measurements correct after fonts/video swap layout.
// ============================================================

(function () {
  'use strict';

  const section = document.querySelector('.reel-statement');
  if (!section) return;

  const reelVideo = document.getElementById('reel-video');

  // ── Sound — fully owned by window.soundManager ───────────────
  // The reel-sound-btn is a shortcut to the global toggle; its
  // visual state is kept in sync by soundManager.syncUI().
  const reelSoundBtn = document.getElementById('reel-sound-btn');
  if (reelSoundBtn) {
    reelSoundBtn.addEventListener('click', () => {
      window.soundManager?.toggle();
    });
  }

  // Register the reel video so its `muted` follows the global state.
  if (reelVideo && window.soundManager) {
    window.soundManager.register(reelVideo);
  }

  // ── Viewport-driven playback (threshold 0.3) ─────────────────
  // Video is paused on load (no `autoplay` attribute in HTML).
  // Plays when the section enters the viewport, pauses when it leaves.
  let reelInView = false;
  if (reelVideo) {
    const playObs = new IntersectionObserver((entries) => {
      const e = entries[0];
      reelInView = e.isIntersecting;
      if (reelInView) {
        const p = reelVideo.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } else {
        reelVideo.pause();
      }
    }, { threshold: 0.3 });
    playObs.observe(section);
  }

  // Pause when the tab is hidden — saves CPU, never plays in background.
  document.addEventListener('visibilitychange', () => {
    if (!reelVideo) return;
    if (document.hidden) {
      reelVideo.pause();
    } else if (reelInView) {
      const p = reelVideo.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  });

  // ── Route: GSAP or CSS fallback ───────────────────────────────
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    initFallback();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  // Make every transform GPU-composited by default in this module
  gsap.config({ force3D: true });

  initGSAP();

  // ══════════════════════════════════════════════════════════════
  //  CSS FALLBACK (no GSAP available)
  // ══════════════════════════════════════════════════════════════
  function initFallback() {
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        section.classList.add('rs-in-view');
        obs.unobserve(section);
      }
    }, { threshold: 0.1 });
    obs.observe(section);
  }

  // ══════════════════════════════════════════════════════════════
  //  GSAP — choreographed scroll
  // ══════════════════════════════════════════════════════════════
  function initGSAP() {
    section.classList.add('rs-gsap-active');
    const q = gsap.utils.selector(section);

    // ── Calibrate waveform path length ────────────────────────
    const wavePath = q('.rs-wave-path')[0];
    const waveLen  = wavePath ? Math.ceil(wavePath.getTotalLength()) : 4000;
    if (wavePath) {
      gsap.set(wavePath, { strokeDasharray: waveLen, strokeDashoffset: waveLen });
    }

    // ── Initial states (hidden / transformed-in) ──────────────
    gsap.set(q('.rs-tag'),                       { opacity: 0, y: 16 });
    gsap.set(q('.rs-top-right'),                 { opacity: 0 });
    gsap.set(q('.rs-frag--intro .rs-line'),      { clipPath: 'inset(0 100% 0 0)' });
    gsap.set(q('.rs-word-its'),                  { clipPath: 'inset(0 100% 0 0)' });
    gsap.set(q('.rs-word-felt'),                 { clipPath: 'inset(0 100% 0 0)' });
    gsap.set(q('.rs-frag--outro .rs-line'),      { clipPath: 'inset(0 100% 0 0)' });
    gsap.set(q('.rs-sub, .rs-actions'),          { opacity: 0, y: 20 });
    gsap.set(q('.rs-wave-label'),                { opacity: 0 });
    gsap.set(q('.rs-wave-fill'),                 { opacity: 0 });
    // Video-zone opacity:0 only on tablet+ (where the scroll-pin timeline
    // is active and the entry timeline dramatically fades video in).
    // On phone (≤768) section becomes flex-column, ScrollTrigger refresh
    // can lag, and there's no scrub timeline — keep video visible by
    // default so it always renders (CSS guarantees opacity:1 via media query).
    const _reelHasScrub = window.matchMedia('(min-width: 769px)').matches;
    if (_reelHasScrub) {
      gsap.set(q('.reel-video-zone'), { opacity: 0 });
    }
    gsap.set(q('.reel-video-tint'),              { opacity: 1 });
    gsap.set(q('.reel-video-edges'),             { opacity: 1 });
    gsap.set(q('.reel-video-reveal'),            { opacity: 1 });
    gsap.set(q('.rs-hline'),                     { scaleX: 0, transformOrigin: 'left center' });
    gsap.set(q('.rs-vline'),                     { scaleY: 0, transformOrigin: 'top center' });
    gsap.set(q('.video-reel-bg'),                { scale: 1.12, yPercent: 0 });
    gsap.set(q('.reel-cinematic-overlay'),       { opacity: 0 });


    // ──────────────────────────────────────────────────────────
    //  1. ENTRY ANIMATION — runs once when section enters
    //     (all screen sizes, plays in real time, NOT scrubbed)
    // ──────────────────────────────────────────────────────────
    let breathTween = null;

    const entryTl = gsap.timeline({
      scrollTrigger: {
        trigger:        section,
        start:          'top 80%',
        toggleActions:  'play none none none',
      },
    });

    // Easing unified with motion-system tokens:
    //   REVEAL  = power3.out  ≈ cubic-bezier(0.76, 0, 0.24, 1) (clip-path/lines)
    //   FADE    = power3.out used for body text reveals as well — single-feel
    entryTl
      .to(q('.rs-tag'),       { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0)
      .to(q('.rs-top-right'), { opacity: 1, duration: 0.7, ease: 'power3.out' }, 0.12)
      .to(q('.rs-hline--a'),  { scaleX: 1, duration: 0.9, ease: 'power3.out' }, 0.06)
      .to(q('.rs-hline--b'),  { scaleX: 1, duration: 0.9, ease: 'power3.out' }, 0.28)
      .to(q('.rs-vline'),     { scaleY: 1, duration: 0.9, ease: 'power3.out' }, 0.18)
      .to(q('.reel-video-zone'),        { opacity: 1, duration: 0.9, ease: 'power3.out' }, 0.32)
      .to(q('.reel-cinematic-overlay'), { opacity: 1, duration: 0.7, ease: 'power3.out' }, 0.80)
      .to(q('.rs-frag--intro .rs-line:nth-child(1)'),
          { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'power3.out' }, 0.30)
      .to(q('.rs-frag--intro .rs-line:nth-child(2)'),
          { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'power3.out' }, 0.46)
      .to(q('.rs-word-its'),  { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'power3.out' }, 0.52)
      .to(q('.rs-word-felt'), { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'power3.out' }, 0.70)
      .to(q('.rs-frag--outro .rs-line:nth-child(1)'),
          { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'power3.out' }, 0.64)
      .to(q('.rs-frag--outro .rs-line:nth-child(2)'),
          { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'power3.out' }, 0.80)
      .to(q('.rs-sub'),        { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.80)
      .to(q('.rs-actions'),    { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.95)
      .to(q('.rs-wave-label'), { opacity: 1, duration: 0.55, ease: 'power3.out' }, 1.02)
      .to(wavePath, { strokeDashoffset: 0, duration: 2.4, ease: 'power3.out' }, 0.85)
      .to(q('.rs-wave-fill'), { opacity: 1, duration: 0.7, ease: 'power3.out' }, 1.65);

    // Idle waveform breathing (paused once user starts the scrub timeline)
    entryTl.call(() => {
      breathTween = gsap.to(q('.rs-waveform-svg'), {
        y: -3, yoyo: true, repeat: -1, duration: 2.75, ease: 'sine.inOut',
      });
    }, [], '>');

    // ──────────────────────────────────────────────────────────
    //  2. SCROLL-DRIVEN TIMELINE — desktop / tablet only (≥769px)
    //     Single timeline. Single ScrollTrigger. Single source
    //     of truth for the whole sequence:
    //
    //     0.00 ── 0.40 : video reveals, parallax pushes deeper
    //     0.30 ── 0.65 : typography disperses & exits
    //     0.55 ── 1.00 : process section curtain-reveals over
    //                    the video, fully covering by progress 1
    // ──────────────────────────────────────────────────────────
    gsap.matchMedia().add('(min-width: 769px)', () => {

      const processSection = document.querySelector('section.process');

      // Prepare the process section to live ABOVE the reel during pin.
      // We use position: relative + a transform layer for clip-path
      // so it doesn't get torn out of the document flow.
      // (CSS handles z-index / will-change — see video-reel.css)
      if (processSection) {
        processSection.classList.remove('reveal');
        processSection.classList.add('process--curtain');
        // No GSAP initial state needed — section slides naturally
      }

      const scrollTl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger:             section,
          start:               'top top',           // pin starts exactly when expansion ends (scale:1, radius:0)
          end:                 '+=260%',            // extra room so video completes before next section enters
          pin:                 true,
          pinSpacing:          true,
          scrub:               true,               // Lenis already smooths; no double-easing
          anticipatePin:       1,
          invalidateOnRefresh: true,
          fastScrollEnd:       true,
          onEnter()      { if (breathTween) { breathTween.kill(); breathTween = null; } },
          onEnterBack()  { /* nothing — entry tween already done */ },
        },
      });

      // ── PHASE A (0.00 → 0.40): video opens up, parallax depth ──
      scrollTl
        .to(q('.reel-video-reveal'), { opacity: 0,    duration: 0.40 }, 0.00)
        .to(q('.reel-video-edges'),  { opacity: 0.18, duration: 0.40 }, 0.05)
        .to(q('.reel-video-tint'),   { opacity: 0.06, duration: 0.50 }, 0.00)
        // Parallax: video pushes UP and zooms slightly while user scrolls.
        // yPercent (transform) — never triggers layout. Range deliberately
        // small (~8%) so it reads as depth, not as motion sickness.
        .to(q('.video-reel-bg'),     { yPercent: -8, scale: 1.18, duration: 1.00 }, 0.00);

      // ── PHASE B (0.30 → 0.65): typography disperses ──
      scrollTl
        .to(q('.rs-frag--intro'), { yPercent: -180, opacity: 0, ease: 'power2.in', duration: 0.30 }, 0.30)
        .to(q('.rs-word-its'),    { xPercent: -120, yPercent: -50, opacity: 0, ease: 'power2.in', duration: 0.32 }, 0.34)
        .to(q('.rs-word-felt'),   { xPercent:  120, yPercent:  50, opacity: 0, ease: 'power2.in', duration: 0.32 }, 0.40)
        .to(q('.rs-bottom-row'),  { yPercent:  120, opacity: 0, ease: 'power2.in', duration: 0.30 }, 0.36)
        .to(q('.rs-tag, .rs-top-right, .rs-wave-label'), { opacity: 0, duration: 0.20 }, 0.30)
        .to(q('.reel-cinematic-overlay'), { opacity: 0, duration: 0.22 }, 0.46)
        .to(q('.rs-hline--a'), { scaleX: 0, transformOrigin: 'right center', duration: 0.25 }, 0.32)
        .to(q('.rs-hline--b'), { scaleX: 0, transformOrigin: 'right center', duration: 0.25 }, 0.36)
        .to(q('.rs-vline'),    { scaleY: 0, transformOrigin: 'top center',   duration: 0.22 }, 0.30)
        .to(q('.rs-waveform-svg'), { scaleX: 1.08, y: 18, opacity: 0, duration: 0.30 }, 0.34);

      // ── PHASE C (0.55 → 1.00): process section slides over reel ──
      // No GSAP needed: .process--curtain has margin-top:-100svh and z-index:5
      // so it naturally scrolls UP into view during the pin, covering the video
      // with its solid background. Standard scroll behaviour — no clipping.

      // ── Cleanup when matchMedia exits (window shrinks below 769) ──
      return () => {
        scrollTl.scrollTrigger?.kill();
        scrollTl.kill();
        if (breathTween) { breathTween.kill(); breathTween = null; }
        if (processSection) {
          processSection.classList.remove('process--curtain');
          processSection.classList.add('reveal');
          gsap.set(processSection, { clearProps: 'all' });
        }
      };
    });

    // ── Refresh after fonts + media settle ─────────────────────
    // ScrollTrigger measures positions once. If fonts swap or the
    // video metadata loads later, those measurements go stale and
    // the pin spacer ends up the wrong height → snap on entry.
    function refresh() { ScrollTrigger.refresh(); }

    if (document.readyState === 'complete') {
      refresh();
    } else {
      window.addEventListener('load', refresh, { once: true });
    }
    // Also refresh once the video has metadata (its intrinsic size
    // can change layout via object-fit on some browsers).
    if (reelVideo) {
      reelVideo.addEventListener('loadedmetadata', refresh, { once: true });
    }
    // And after web fonts finish loading — display fonts can shift
    // the typography compositions's vertical center.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(refresh);
    }
  }
}());
