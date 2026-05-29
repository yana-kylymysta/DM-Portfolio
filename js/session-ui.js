// ============================================================
// session-ui.js — global "DAW session" UI controller
// Handles: timecode display, scroll playhead, track-header
// scan-in animations, custom cursor, scroll-velocity blur.
//
// Drop-in: <script src="js/session-ui.js" defer></script>
// Requires: nothing (vanilla). GSAP optional (used if present).
// ============================================================

(function () {
  'use strict';

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ───────────────────────────────────────────────────────
  // 1. TIMECODE — maps scroll position → SMPTE timecode
  // ───────────────────────────────────────────────────────
  const timecode = document.querySelector('.session-timecode-value');
  const SONG_LEN_FRAMES = 4 * 60 * 24 + 32 * 24; // 4:32 at 24fps
  let lastTimecodeFrame = -1;

  function frameToSMPTE(frame) {
    const f = Math.floor(frame % 24);
    const s = Math.floor((frame / 24) % 60);
    const m = Math.floor((frame / 24 / 60) % 60);
    const h = Math.floor(frame / 24 / 60 / 60);
    return [h, m, s, f].map((n) => String(n).padStart(2, '0')).join(':');
  }

  function updateTimecode() {
    if (!timecode) return;
    const max = document.documentElement.scrollHeight - innerHeight;
    const pct = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    const frame = Math.floor(pct * SONG_LEN_FRAMES);
    if (frame !== lastTimecodeFrame) {
      timecode.textContent = frameToSMPTE(frame);
      lastTimecodeFrame = frame;
    }
  }

  // ───────────────────────────────────────────────────────
  // 2. PLAYHEAD — orange scan line on section change
  // ───────────────────────────────────────────────────────
  const playhead = document.querySelector('.session-playhead');
  const sections = Array.from(document.querySelectorAll('section[id]'));
  let lastSection = null;

  const sectionObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && e.intersectionRatio > 0.45) {
        if (e.target !== lastSection) {
          lastSection = e.target;
          if (playhead && !reduceMotion) {
            playhead.classList.remove('is-active');
            void playhead.offsetWidth; // force reflow to restart anim
            playhead.classList.add('is-active');
          }
        }
      }
    });
  }, { threshold: [0.45, 0.6] });

  sections.forEach((s) => sectionObs.observe(s));

  // ───────────────────────────────────────────────────────
  // 3. TRACK-HEADER scan-in on enter
  // ───────────────────────────────────────────────────────
  const headers = document.querySelectorAll('.track-header');
  // rootMargin -40px keeps the trigger line off the exact viewport edge,
  // where iOS Safari's address-bar resize causes IO re-fires. dataset
  // guard prevents double-trigger if observe() is somehow re-bound.
  const headerObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      if (e.target.dataset.animated === 'true') {
        headerObs.unobserve(e.target);
        return;
      }
      e.target.classList.add('in-view');
      e.target.dataset.animated = 'true';
      headerObs.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -40px 0px', threshold: 0.4 });
  headers.forEach((h) => headerObs.observe(h));

  // ───────────────────────────────────────────────────────
  // 4. CUSTOM CURSOR — only inside [data-cursor-zone] elements
  //    Renders a thin orange playhead line + label.
  // ───────────────────────────────────────────────────────
  const cursor = document.createElement('div');
  cursor.className = 'dm-cursor';
  cursor.innerHTML = '<span class="dm-cursor-label">▶ Preview</span>';
  document.body.appendChild(cursor);

  let cursorX = 0, cursorY = 0;
  let cursorTargetX = 0, cursorTargetY = 0;

  function tickCursor() {
    // Smooth follow with lerp — feels less robotic than direct
    cursorX += (cursorTargetX - cursorX) * 0.22;
    cursorY += (cursorTargetY - cursorY) * 0.22;
    cursor.style.transform = `translate(${cursorX}px, ${cursorY}px) translate(-50%, -50%)`;
    requestAnimationFrame(tickCursor);
  }
  if (matchMedia('(hover: hover)').matches) tickCursor();

  // Delegated cursor logic — supports nested zones and explicit hide-zones.
  //   [data-cursor-zone]   activates the custom cursor inside that element
  //   [data-cursor-label]  sets the label (innermost wins)
  //   [data-cursor-hide]   hides the custom cursor inside that element,
  //                        even if it sits inside a parent zone (lets the
  //                        native pointer show through on player controls)
  const labelEl = cursor.querySelector('.dm-cursor-label');
  let lastLabel = '';

  // Single mousemove listener — does both position update + zone detection.
  // Keeps event-traffic minimal (was 2 separate listeners pre-v9).
  document.addEventListener('mousemove', (e) => {
    cursorTargetX = e.clientX;
    cursorTargetY = e.clientY;

    const target = e.target;
    if (!(target instanceof Element)) return;

    const hide = target.closest('[data-cursor-hide]');
    const zone = target.closest('[data-cursor-zone]');

    if (zone && !hide) {
      cursor.classList.add('is-visible');
      // Innermost label wins — descendants can override the parent zone's label.
      const labelHost = target.closest('[data-cursor-label]') || zone;
      const label = labelHost?.dataset.cursorLabel || '▶ Preview';
      if (label !== lastLabel) {
        labelEl.textContent = label;
        lastLabel = label;
      }
    } else {
      cursor.classList.remove('is-visible');
    }
  }, { passive: true });

  // ───────────────────────────────────────────────────────
  // 5. SCROLL-VELOCITY BLUR (desktop, optional, gentle)
  //    Tiny CSS-only filter when scrolling fast.
  // ───────────────────────────────────────────────────────
  if (matchMedia('(hover: hover)').matches && !reduceMotion) {
    let lastScrollY = scrollY;
    let velocity = 0;
    let velocityFalloffTimer = null;

    function trackVelocity() {
      const dy = Math.abs(scrollY - lastScrollY);
      lastScrollY = scrollY;
      velocity = dy;
      // Map: 0–60px/frame → 0–1.5px blur, capped
      const blur = Math.min(1.5, dy / 40);
      document.documentElement.style.setProperty('--scroll-blur', `${blur.toFixed(2)}px`);
      clearTimeout(velocityFalloffTimer);
      velocityFalloffTimer = setTimeout(() => {
        document.documentElement.style.setProperty('--scroll-blur', '0px');
      }, 80);
    }

    let rafScheduled = false;
    addEventListener('scroll', () => {
      updateTimecode();
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(() => {
          trackVelocity();
          rafScheduled = false;
        });
      }
    }, { passive: true });

  } else {
    addEventListener('scroll', updateTimecode, { passive: true });
  }

  updateTimecode();
})();
