// ============================================================
// hero-parallax.js — Hero scale-down as about-section overlays
//
// Mechanism:
//   .hero-scroll-scene  height: 200dvh
//   .hero               position: sticky; top: 0; height: 100dvh
//   .about              z-index: 2 — naturally slides over hero
//
// While the user scrolls through the scene's second 100dvh,
// the hero scales from 1.0 → 0.92, fades slightly, and gains
// a border-radius — creating the "app overlay" feel.
//
// Uses RAF + native scroll (works with Lenis because Lenis
// updates window.scrollY on every tick). No GSAP dependency.
// ============================================================

(function initHeroParallax() {
  'use strict';

  // Respect user preference
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const scene = document.querySelector('.hero-scroll-scene');
  const hero  = document.querySelector('.hero');
  if (!scene || !hero) return;

  let ticking = false;
  let viewportH = window.innerHeight;

  // ── Easing helper — smooth out animation curve ─────────────
  // easeOutCubic: fast start, slow finish — natural deceleration
  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // ── Core update ────────────────────────────────────────────
  function update() {
    const scrollY = window.scrollY;

    // Progress 0 → 1 over the first viewport-height of scroll.
    // Hero is fully transformed by the time about reaches top.
    const raw      = Math.max(0, Math.min(1, scrollY / viewportH));
    const progress = easeOut(raw);

    // Scale: 1.0 → 0.92  (recedes into background)
    const scale        = 1 - progress * 0.08;
    // Opacity: 1.0 → 0.72 (dims but stays readable)
    const opacity      = 1 - progress * 0.28;
    // Border-radius: 0px → 22px (rounds as about card arrives)
    const borderRadius = progress * 22;

    hero.style.transform    = `scale(${scale})`;
    hero.style.opacity      = opacity;
    hero.style.borderRadius = `${borderRadius}px`;

    ticking = false;
  }

  function requestUpdate() {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }

  // ── Listeners ──────────────────────────────────────────────
  window.addEventListener('scroll', requestUpdate, { passive: true });

  // Resize: recalculate vh so percentages stay accurate
  window.addEventListener('resize', () => {
    viewportH = window.innerHeight;
    requestUpdate();
  }, { passive: true });

  // Initial state (handles page load with hash / scroll position)
  update();
})();
