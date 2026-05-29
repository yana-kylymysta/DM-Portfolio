// ============================================================
// motion-system.js — Unified entry-animation system (v7)
// ============================================================
// Single source of truth for scroll-triggered reveals.
//
// Three patterns:
//   · REVEAL   — clip-path sweep for headlines (top → bottom)
//   · FADE-IN  — opacity + small y-shift for body text & blocks
//   · SLIDE-IN — opacity + small x-shift for labels & meta
//
// Each pattern: ONE easing, ONE duration. Lists get stagger.
// Trigger point: 'top 85%' (entry into viewport).
//
// Reel + EditBay have their own internal sequences (in reel.js
// and the editbay block below). They reuse the same easing /
// duration tokens so the whole site reads as one system.
// ============================================================

(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════
  //  EDITBAY TITLE REVEAL — independent CSS+IO system.
  //  Runs OUTSIDE any GSAP/ScrollTrigger code so it cannot be
  //  taken down by GSAP being missing, Lenis touch-sync gaps,
  //  matchMedia callbacks, or refresh races. The title has been
  //  the canary for the whole motion system — keep this isolated.
  //  CSS owns the start state (translateY(110%)) and the
  //  transition; JS only toggles the .is-title-revealed class.
  // ════════════════════════════════════════════════════════════
  (function initEditbayTitleReveal() {
    const editbay = document.querySelector('.editbay');
    if (!editbay) return;

    // Reduced motion → reveal immediately, no animation.
    const reduced = window.matchMedia &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      editbay.classList.add('is-title-revealed');
      return;
    }

    // iOS Safari note: address-bar show/hide resizes the viewport and
    // makes IO re-fire on the exact viewport boundary. rootMargin of
    // -40px pulls the trigger line inside the viewport so it stays
    // stable across that resize. disconnect() + dataset guard make
    // this a hard one-shot regardless.
    const io = new IntersectionObserver((entries) => {
      if (editbay.dataset.animated === 'true') { io.disconnect(); return; }
      if (entries[0].isIntersecting) {
        editbay.classList.add('is-title-revealed');
        editbay.dataset.animated = 'true';
        io.disconnect();
      }
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.01 });
    io.observe(editbay);
  })();

  // ── Tokens (mirror css/base.css custom properties) ─────────
  const EASE = {
    reveal: 'cubic-bezier(0.76, 0, 0.24, 1)',
    fade:   'cubic-bezier(0.22, 1, 0.36, 1)',
    slide:  'cubic-bezier(0.33, 1, 0.68, 1)',
  };
  const DUR = {
    reveal: 0.9,
    fade:   0.7,
    slide:  0.55,
  };
  const STAGGER = 0.08;
  const START   = 'top 85%';

  // ── motion-loading anti-FOUC class management ──────────────
  // <head> inline script added this class synchronously before
  // first paint. We must remove it once GSAP has set its own
  // inline start-states, OR immediately on every bail-out path
  // so content never gets stuck hidden.
  const html = document.documentElement;
  const clearMotionLoading = () => html.classList.remove('motion-loading');

  // ── GSAP-missing fallback ──────────────────────────────────
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    console.warn('[motion] GSAP missing — clearing pre-hidden states');
    clearMotionLoading();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  // Force GPU compositing on every transform tween — critical for iOS
  // WebKit, which otherwise drops to layout/paint and judders.
  gsap.config({ force3D: true });

  // ════════════════════════════════════════════════════════════
  //  GLOBAL onEnter — the safety-net IO at the bottom of this file
  //  observes every .reveal/.fx-*/.editbay-* etc. selector and
  //  rescues elements stuck at opacity:0. On fast mobile scroll the
  //  IO could fire 1–2 frames AFTER ScrollTrigger but BEFORE GSAP
  //  had time to lift opacity above the 0.05 guard — both would then
  //  write inline styles to the same element and the user saw a
  //  visible double-fire (the bug Yana caught on About).
  //
  //  Marking dataset.animated='true' the moment ScrollTrigger fires
  //  guarantees the safety-net guard short-circuits on the very next
  //  IO callback. Applies via defaults so every trigger gets it
  //  without per-config wiring. Scrub triggers (.hero parallax) also
  //  fire onEnter — marking '.hero' is harmless, it isn't observed.
  // ════════════════════════════════════════════════════════════
  ScrollTrigger.defaults({
    onEnter: (self) => {
      if (self.trigger && self.trigger.dataset) {
        self.trigger.dataset.animated = 'true';
      }
    },
  });

  const mm = gsap.matchMedia();

  mm.add({
    isReducedMotion: '(prefers-reduced-motion: reduce)',
    isDesktop:       '(min-width: 901px) and (prefers-reduced-motion: no-preference)',
    isMobile:        '(max-width: 900px) and (prefers-reduced-motion: no-preference)',
  }, (ctx) => {
    const { isDesktop, isReducedMotion } = ctx.conditions;

    if (isReducedMotion) {
      clearMotionLoading();
      // Keep inline opacity:1 / transform:none — the permanent CSS `.reveal /
      // .fx-reveal / .fx-fade / .fx-slide` rules each pre-hide their target;
      // clearProps:'all' would strip our override and re-hide everything.
      gsap.set('.reveal, .fx-reveal, .fx-fade, .fx-slide, .editbay-title .word > span, .editbay-track', {
        opacity: 1, y: 0, x: 0, clipPath: 'none'
      });
      return;
    }

    // ════════════════════════════════════════════════════════
    //  PATTERN 1 — REVEAL (headlines, clip-path sweep)
    // ════════════════════════════════════════════════════════
    // Headlines that get the clip-path top → bottom REVEAL.
    // Note: .editbay-title has its own split-word timeline below
    // (yPercent 110 → 0 per word), so it is NOT in this list.
    const revealSelectors = [
      '.about-headline',
      '.philosophy-big',
      '.services-title',
      '.process-title',
      '.testimonials-title',
      '.projects-title',
      '.cta-big',
    ];

    gsap.utils.toArray(revealSelectors.join(', ')).forEach((el) => {
      el.classList.add('fx-reveal');
      gsap.to(el, {
        clipPath: 'inset(0 0 0% 0)',
        webkitClipPath: 'inset(0 0 0% 0)',
        opacity: 1,
        y: 0,
        duration: DUR.reveal,
        ease: EASE.reveal,
        scrollTrigger: { trigger: el, start: START, once: true },
      });
    });

    // ════════════════════════════════════════════════════════
    //  PATTERN 2 — FADE-IN (body text, blocks)
    // ════════════════════════════════════════════════════════
    // 2a. Section-level .reveal containers — write inline opacity:1 / y:0 to
    //     OVERRIDE the permanent CSS `.reveal { opacity:0; translateY(24px) }`
    //     pre-hide. No scroll-trigger, no animation. Every parent .reveal
    //     section in this site contains children with their own scroll-driven
    //     reveals (.about-headline, .about-creed, .about-bio, .about-stat-row,
    //     .track-header, etc.). Running a parent fade-in on top of child
    //     reveals produced a visible "section frame fades in, then content
    //     inside fades in" double-fire — Yana caught this on mobile as the
    //     About section "appearing twice". The parent only needs to be
    //     unhidden; the children carry the motion.
    //
    //     Do NOT use clearProps here — the CSS `.reveal` rule is permanent
    //     (not motion-loading scoped), so clearing inline styles re-hides the
    //     parent and the safety-net IO refuses to rescue (we already marked
    //     dataset.animated='true' below).
    gsap.utils.toArray('.reveal').forEach((el) => {
      gsap.set(el, { opacity: 1, y: 0 });
      el.classList.add('has-animated');
      el.dataset.animated = 'true';
    });

    // 2b. Inline body text & blocks — fade + 16px y-shift
    //   Rule: only target leaf blocks (no parents of stagger groups).
    //   Otherwise child opacity = parent * own = 0, runs twice.
    // FADE-IN with clip-path sweep — for body text and slider that
    // need a clearly visible cinematic entry.
    //   start: when (element top → viewport position) animation fires
    //   y:     vertical shift in px
    //   dur:   duration in seconds
    //   clip:  if true, also sweep clip-path top → bottom (headline feel)
    const fadeSelectors = [
      // About — mantra block (cinematic clip-sweep)
      { sel: '.about-creed', start: 'top 80%', y: 32, dur: 0.65, clip: true },
      // Philosophy
      { sel: '.philosophy-body',  start: 'top 75%', y: 32, dur: 1.0, clip: true },
      { sel: '.philosophy-quote', start: 'top 75%', y: 32, dur: 1.0, clip: true },
      // Testimonials slider — full clip-path reveal
      { sel: '.testi-slider-wrap', start: 'top 75%', y: 40, dur: 1.0, clip: true },
      // CTA / Contact
      { sel: '.cta-contact-title',   start: 'top 80%', y: 24, dur: 0.9 },
      { sel: '.contact-form',        start: 'top 80%', y: 24, dur: 0.9 },
      { sel: '.contact-form-submit', start: 'top 85%', y: 16, dur: 0.7 },
    ];

    fadeSelectors.forEach(({ sel, start, y = 16, dur = DUR.fade, clip = false }) => {
      gsap.utils.toArray(sel).forEach((el) => {
        const fromState = clip
          ? { opacity: 0, y, clipPath: 'inset(0 0 100% 0)', webkitClipPath: 'inset(0 0 100% 0)' }
          : { opacity: 0, y };
        const toState = clip
          ? { opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)', webkitClipPath: 'inset(0 0 0% 0)',
              duration: dur, ease: EASE.reveal,
              immediateRender: true,
              scrollTrigger: { trigger: el, start, once: true } }
          : { opacity: 1, y: 0,
              duration: dur, ease: EASE.fade,
              immediateRender: true,
              scrollTrigger: { trigger: el, start, once: true } };
        gsap.fromTo(el, fromState, toState);
      });
    });

    // ════════════════════════════════════════════════════════
    //  PATTERN 3 — SLIDE-IN (small elements, labels)
    // ════════════════════════════════════════════════════════
    const slideSelectors = [
      '.section-label',
      '.editbay-meta',
      '.process-subtitle',
      '.testi-counter',
      '.testimonials-buttons',
    ];

    gsap.utils.toArray(slideSelectors.join(', ')).forEach((el) => {
      el.classList.add('fx-slide');
      gsap.to(el, {
        opacity: 1,
        x: 0,
        duration: DUR.slide,
        ease: EASE.slide,
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      });
    });

    // ════════════════════════════════════════════════════════
    //  TRACK-HEADER as a unit — slide-in BEFORE its rule scans
    //  (the rule scan is its own animation; this fades the row)
    // ════════════════════════════════════════════════════════
    gsap.utils.toArray('.track-header').forEach((el) => {
      gsap.fromTo(el,
        { opacity: 0, x: -12 },
        {
          opacity: 1, x: 0,
          duration: DUR.slide,
          ease: EASE.slide,
          immediateRender: true,
          scrollTrigger: { trigger: el, start: 'top 92%', once: true },
        }
      );
    });

    // ════════════════════════════════════════════════════════
    //  STAGGERED LISTS
    //
    //  Two modes:
    //   · BATCH    — one ScrollTrigger on parent, items animate
    //                in cadence. Use for short, dense groups that
    //                fit the viewport together (filters, dots, cards).
    //   · PER-ITEM — each item has its own ScrollTrigger and reveals
    //                only when it enters the viewport. Use for long
    //                lists where parent extends past the fold (tracks,
    //                projects, stats stacked vertically).
    // ════════════════════════════════════════════════════════
    const staggerGroups = [
      // BATCH — short, dense, single-row groups (all visible together)
      { sel: '.contact-link-row',       stagger: 0.08, parent: '.cta-platform-links' },
      { sel: '.contact-form-field',     stagger: 0.10, parent: '.contact-form' },
      { sel: '.editbay-filter',         stagger: 0.04, parent: '.editbay-filters', y: 0, x: -8 },
      { sel: '.editbay-filters-label',  stagger: 0,    parent: '.editbay-filters', y: 0, x: -8 },
      { sel: '.testi-dot',              stagger: 0.05, parent: '.testi-dots' },

      // RESPONSIVE — horizontal grid on desktop (BATCH cadence),
      //             stacked column on mobile (PER-ITEM scroll-driven)
      { sel: '.service-card',  parent: '.services-grid',     stagger: 0.20, perItemBelow: 900, start: 'top 80%' },
      { sel: '.process-node',  parent: '.process-timeline',  stagger: 0.20, perItemBelow: 900, start: 'top 80%' },

      // PER-ITEM — long vertical lists, each row reveals on its own scroll
      { sel: '.about-stat-row',  perItem: true, start: 'top 92%' },
      { sel: '.project-row',     perItem: true, start: 'top 92%' },
      { sel: '.editbay-track',   perItem: true, start: 'top 92%' },
    ];

    staggerGroups.forEach(({ sel, stagger, parent, y = 20, x = 0, start = START, perItem, perItemBelow }) => {
      const items = gsap.utils.toArray(sel);
      if (!items.length) return;

      // Decide mode for responsive groups based on viewport width.
      const usePerItem = perItem || (perItemBelow && window.innerWidth < perItemBelow);

      if (usePerItem) {
        // Each item is its own trigger — appearance follows the scroll.
        items.forEach((el) => {
          gsap.fromTo(el,
            { opacity: 0, y, x },
            {
              opacity: 1, y: 0, x: 0,
              duration: DUR.fade,
              ease: EASE.fade,
              immediateRender: true,
              scrollTrigger: { trigger: el, start, once: true },
            }
          );
        });
        return;
      }

      // Batch — one trigger on the parent, all items animate as one chain.
      const trigger = items[0].closest(parent) || items[0];
      gsap.fromTo(items,
        { opacity: 0, y, x },
        {
          opacity: 1, y: 0, x: 0,
          duration: DUR.fade,
          ease: EASE.fade,
          stagger,
          immediateRender: true,
          scrollTrigger: { trigger, start, once: true },
        }
      );
    });

    // ════════════════════════════════════════════════════════
    //  ABOUT BIO PARAGRAPHS — single trigger on the block,
    //  cinematic clip-sweep with stagger so both paragraphs
    //  read as a chain (not two simultaneous fires).
    // ════════════════════════════════════════════════════════
    const aboutBios = gsap.utils.toArray('.about-bio');
    if (aboutBios.length) {
      const bioBlock = aboutBios[0].closest('.about-bio-block') || aboutBios[0];
      gsap.fromTo(aboutBios,
        {
          opacity: 0, y: 32,
          clipPath: 'inset(0 0 100% 0)',
          webkitClipPath: 'inset(0 0 100% 0)',
        },
        {
          opacity: 1, y: 0,
          clipPath: 'inset(0 0 0% 0)',
          webkitClipPath: 'inset(0 0 0% 0)',
          duration: 0.65,
          ease: EASE.reveal,
          stagger: 0.25,
          immediateRender: true,
          scrollTrigger: { trigger: bioBlock, start: 'top 75%', once: true },
        }
      );
    }

    // ════════════════════════════════════════════════════════
    //  TESTIMONIAL ACTIVE-SLIDE — pull-quote + author rise
    //  Only the active slide animates; siblings stay invisible
    //  via translateX (they're off-screen anyway).
    // ════════════════════════════════════════════════════════
    const testiSection = document.querySelector('.testimonials');
    if (testiSection) {
      const activeSlide  = testiSection.querySelector('.testi-slide.is-active');
      if (activeSlide) {
        const quote  = activeSlide.querySelector('.testi-pull-quote');
        const author = activeSlide.querySelector('.testi-author-row');
        const inner  = [quote, author].filter(Boolean);
        if (inner.length) {
          gsap.fromTo(inner,
            { opacity: 0, y: 16 },
            {
              opacity: 1, y: 0,
              duration: DUR.fade,
              ease: EASE.fade,
              stagger: 0.12,
              immediateRender: true,
              scrollTrigger: { trigger: testiSection, start: START, once: true },
            }
          );
        }
      }
    }

    // ════════════════════════════════════════════════════════
    //  EDITBAY — video + corners only.
    //  Title reveal is intentionally OUTSIDE GSAP/ScrollTrigger —
    //  see initEditbayTitleReveal() below (CSS transition + IO).
    //  Reason: this title has gotten stuck 3 times in a row on
    //  iPhone due to ScrollTrigger / Lenis position-math fragility.
    //  CSS transitions on iOS WebKit are dramatically more reliable.
    // ════════════════════════════════════════════════════════
    const editbay = document.querySelector('.editbay');
    if (editbay) {
      const video = editbay.querySelector('.editbay-video');

      const tl = gsap.timeline({
        scrollTrigger: { trigger: editbay, start: 'top 75%', once: true },
      });

      if (video) {
        gsap.set(video, { opacity: 0, scale: 0.96 });
        tl.to(video, {
          opacity: 1,
          scale: 1,
          duration: DUR.reveal,
          ease: EASE.reveal,
        }, 0.05);

        const cornerPaths = editbay.querySelectorAll('.editbay-corners path');
        if (cornerPaths.length) {
          cornerPaths.forEach((p) => {
            const len = p.getTotalLength ? p.getTotalLength() : 56;
            gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
          });
          tl.to(cornerPaths, {
            strokeDashoffset: 0,
            duration: DUR.reveal,
            ease: EASE.reveal,
            stagger: 0.04,
          }, 0.25);
        }
      }
    }

    // ════════════════════════════════════════════════════════
    //  HERO HEADLINE — already CSS-driven (cut-in keyframe).
    //  We only normalize easing via tokens in hero.css.
    //  No JS reveals on hero — it loads with the page.
    // ════════════════════════════════════════════════════════

    // ════════════════════════════════════════════════════════
    //  PARALLAX (desktop only, light, transform-only)
    // ════════════════════════════════════════════════════════
    if (isDesktop) {
      const wave = document.querySelector('.hero-waveform-new svg');
      if (wave) {
        gsap.to(wave, {
          yPercent: -8,
          ease: 'none',
          scrollTrigger: {
            trigger: '.hero',
            start: 'top top',
            end: 'bottom top',
            scrub: 0.6,
          },
        });
      }

      // GSAP parallax on .philosophy-right-img is disabled —
      // wow-effects.js owns this element now (scroll scale + hover scale).
      // See it own's CSS-var driven approach in css/hero.css + wow-effects.js.
    }

    // Magnetic CTA stamp is owned entirely by wow-effects.js (Effect 6),
    // which writes style.transform directly via rAF lerp. A GSAP tween
    // here would fight that rAF loop every frame and cause snap/jitter.

    return () => { /* matchMedia auto-cleanup */ };
  });

  // ── CSS pre-hide stays ON permanently on the successful path ──
  // Earlier versions removed .motion-loading after GSAP set its inline
  // start-states. On iOS WebKit that produced a visible flash → hide →
  // animate sequence: GSAP queues its writes via its own ticker, so the
  // requestAnimationFrame that cleared the class sometimes ran BEFORE
  // the inline opacity:0 actually landed in the DOM — for one paint
  // the element had no CSS hide and no inline hide, so it flashed
  // visible at its final position, then GSAP flushed (hide), then the
  // ScrollTrigger fired (animate). Keeping the class on means CSS
  // opacity:0 holds the floor until inline writes override it. GSAP
  // inline:opacity:1 always wins over CSS by specificity, so reveals
  // work normally — there's no scenario where keeping the class hurts.
  if (document.readyState !== 'complete') {
    addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
  }

  // ════════════════════════════════════════════════════════════
  //  SAFETY NET — IntersectionObserver fallback
  //  Catches elements where ScrollTrigger's position math went
  //  stale (long page, late-loading media, transformed parents
  //  upstream). If an element is visibly inside the viewport
  //  but GSAP hasn't cleared its hidden state, force-clear it.
  //  This does NOT replace the GSAP reveals — it only rescues
  //  whatever the scroll system missed. Runs once per element.
  // ════════════════════════════════════════════════════════════
  function installRevealSafetyNet() {
    if (!('IntersectionObserver' in window)) return;

    const HIDDEN_SELECTOR = [
      '.reveal', '.fx-reveal', '.fx-fade', '.fx-slide',
      // Pre-hidden targets from animations.css (must match motion-system selectors)
      '.about-headline', '.philosophy-big', '.services-title',
      '.process-title', '.testimonials-title', '.projects-title', '.cta-big',
      '.about-creed', '.philosophy-body', '.philosophy-quote',
      '.testi-slider-wrap', '.cta-contact-title', '.contact-form',
      '.contact-form-submit', '.about-bio',
      '.section-label', '.editbay-meta', '.process-subtitle',
      '.testi-counter', '.testimonials-buttons', '.track-header',
      '.contact-link-row', '.contact-form-field', '.editbay-filter',
      '.editbay-filters-label', '.testi-dot', '.service-card',
      '.process-node', '.about-stat-row', '.project-row', '.editbay-track',
      '.editbay-video',
    ].join(', ');

    // (Transform-hidden safety net for .editbay-title removed:
    //  title reveal is now CSS+IntersectionObserver, owned by
    //  initEditbayTitleReveal() at the top of this file — does
    //  not need rescuing.)

    // Rescue uses a soft CSS transition so a "stuck" element fades in
    // rather than pops — looks intentional even when it's actually a
    // last-resort save from a missed ScrollTrigger.
    const clearHiddenState = (el) => {
      el.style.transition = 'opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), clip-path 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.opacity        = '1';
      el.style.clipPath       = 'none';
      el.style.webkitClipPath = 'none';
      el.style.transform      = 'none';
    };

    // iOS Safari: address-bar show/hide resizes the viewport mid-scroll
    // and IO re-fires on exact viewport edges. -40px pulls the line
    // inside, so resize events don't bounce elements in/out. We also
    // hard-guard against double-fire w
