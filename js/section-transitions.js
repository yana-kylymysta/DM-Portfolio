// ============================================================
// section-transitions.js — Card-stack parallax between sections
//
// Mirrors hero-parallax.js but generalised for content sections.
// Each pair: exiting section is position:sticky inside .section-scene.
// Entering section has margin-top:-100dvh and slides up as a card.
//
// Animation: as the entering section rises from viewport bottom → top,
// the exiting section scales 1→0.92, fades 1→0.72, rounds 0→22px.
// Progress is read from entering section's getBoundingClientRect().top.
// ============================================================

(function initSectionTransitions() {
  'use strict';

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // easeOutCubic — fast entry, smooth finish
  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // Transition pairs: exitSel is the sticky section, enterSel is the card
  // Services is inside scene-services, so we target .services directly.
  const PAIRS = [
    { exit: '.philosophy',  enter: '.scene-services'      },
    { exit: '.services',    enter: '.reel-statement'      },
    { exit: '.process',     enter: '.editbay'             },
    { exit: '.projects',    enter: '.scene-testimonials'  },
    { exit: '.testimonials', enter: '.cta-block'          },
  ];

  const pairs = PAIRS
    .map(({ exit, enter }) => ({
      exitEl:  document.querySelector(exit),
      enterEl: document.querySelector(enter),
    }))
    .filter(p => p.exitEl && p.enterEl);

  if (!pairs.length) return;

  let ticking = false;

  // Per-pair memory: track last applied state so we don't write identical
  // values on every scroll frame (style invalidation cost). Also lets us
  // skip writes entirely when the pair is dormant (progress = 0).
  const state = new WeakMap();

  function update() {
    const vh = window.innerHeight;

    pairs.forEach(({ exitEl, enterEl }) => {
      const enterTop = enterEl.getBoundingClientRect().top;

      // Progress 0 → 1 as entering card travels from viewport bottom → top
      const raw      = Math.max(0, Math.min(1, 1 - enterTop / vh));
      const progress = easeOut(raw);

      const prev = state.get(exitEl) ?? -1;

      // Dormant pair: progress 0, and we either never wrote anything (-1)
      // or last write was already the rest state (0). Skip the DOM touch —
      // this kills ~5 × 3 = 15 inline-style writes per scroll frame across
      // dormant sections, removing a major source of mobile style-recalc
      // pressure that was layering over GSAP reveals as visible jitter.
      if (progress === 0 && prev === 0) return;

      // Quantize to 1/1000 — anything finer is invisible and just wastes
      // style writes on near-constant scroll micro-movements.
      const q = Math.round(progress * 1000) / 1000;
      if (q === prev) return;

      // Scale: 1.0 → 0.92  (recedes behind entering card)
      const scale        = 1 - q * 0.08;
      // Opacity: 1.0 → 0.72 (dims as it recedes)
      const opacity      = 1 - q * 0.28;
      // Border-radius: 0 → 22px (rounds to match card style)
      const borderRadius = q * 22;

      exitEl.style.transform    = `scale(${scale})`;
      exitEl.style.opacity      = String(opacity);
      exitEl.style.borderRadius = `${borderRadius}px`;

      state.set(exitEl, q);
    });

    ticking = false;
  }

  function requestUpdate() {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }

  window.addEventListener('scroll',  requestUpdate, { passive: true });
  window.addEventListener('resize',  requestUpdate, { passive: true });

  // Run once on load (handles page refresh mid-scroll)
  update();
})();
