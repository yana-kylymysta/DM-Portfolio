/* ═══════════════════════════════════════════════════════════
   wow-effects.js — Hero visual enhancements (additive layer)
   ─────────────────────────────────────────────────────────────
   Desktop / trackpad
   1. Custom cursor (dot + ring) — global, hides in editbay zones
   2. Oscilloscope BG layer (2 sine waves, subtle, opacity 0.07)
   3. Parallax: grid + labels + scroll-driven depth (Variant A)
   4. Main SVG wave reacts to mouse  +  autonomous LFO when idle
   5. Glitch burst on "FEELING." (every 3–7 s)
   6. Magnetic CTA stamp (within 150 px radius)

   Touch (no hover, coarse pointer)
   • Cursor replaced by tap-pulse (orange ring blooms on every touch)
   • Wave responds to finger position, drifts back to LFO 800 ms after release
   • Parallax: scroll-driven only (Variant A)
   • Magnetic CTA replaced by autonomous breathing + tap-bounce + haptic
   • Effects 2, 5 work everywhere
   ─────────────────────────────────────────────────────────────
   Notes
   • Hero waveform is SVG (not canvas), so Effect 4 is adapted:
     mouse position drives a subtle CSS transform on the SVG
     element — no fight with the wave-draw entrance animation.
   • All dynamic transforms wait 2.5 s so they never collide with
     hero entrance animations (cut-in, waveform-rise, stamp-in).
   • Custom cursor lives in document.body but only visible while
     hovering inside .hero — does not interfere with the existing
     [data-cursor-zone] cursor used in editbay.
   ═══════════════════════════════════════════════════════════ */

(function initWowEffects() {
  'use strict';

  // ── Guard rails ─────────────────────────────────────────
  const reduceMotion  = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  const supportsHover = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const hero = document.querySelector('.hero');
  if (!hero) return;

  // Wait until DOM ready — script is deferred so DOM is parsed,
  // but other deferred scripts may still be initialising.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootWow, { once: true });
  } else {
    bootWow();
  }

  function bootWow() {

    // ── Shared mouse state ────────────────────────────────
    let mouseX = innerWidth  / 2;
    let mouseY = innerHeight / 2;
    let normX  = 0;   // −1 .. +1 (left → right)
    let normY  = 0;   // −1 .. +1 (top  → bottom)
    let isOverHero = false;
    let lastInteractTime = 0;          // ms; updated by mouse OR touch inside hero
    let scrollOffsetY = 0;             // global scroll position (for parallax)
    let heroVisible = true;
    const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;

    function markInteraction() { lastInteractTime = performance.now(); }

    addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      normX  = (mouseX / innerWidth  - 0.5) * 2;
      normY  = (mouseY / innerHeight - 0.5) * 2;
      if (isOverHero) markInteraction();
    }, { passive: true });

    hero.addEventListener('mouseenter', () => { isOverHero = true;  });
    hero.addEventListener('mouseleave', () => { isOverHero = false; });

    // ── Touch input: treat first finger as a "cursor" for the wave ──
    //    Touch is also what drives interaction-freshness, so the wave
    //    snaps to the user's finger and then drifts back to its LFO
    //    breathing pattern 800 ms after touchend.
    function readTouch(e) {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return;
      mouseX = t.clientX;
      mouseY = t.clientY;
      normX  = (mouseX / innerWidth  - 0.5) * 2;
      normY  = (mouseY / innerHeight - 0.5) * 2;
      const r = hero.getBoundingClientRect();
      isOverHero = (mouseY >= r.top && mouseY <= r.bottom);
      if (isOverHero) markInteraction();
    }
    hero.addEventListener('touchstart', readTouch, { passive: true });
    hero.addEventListener('touchmove',  readTouch, { passive: true });

    // ── Scroll-driven parallax (Variant A: hero stays 100dvh) ──
    addEventListener('scroll', () => { scrollOffsetY = window.scrollY; }, { passive: true });
    scrollOffsetY = window.scrollY;
    const heroObs = new IntersectionObserver((entries) => {
      heroVisible = entries[0].isIntersecting;
    }, { threshold: 0 });
    heroObs.observe(hero);

    // Defer transforms that could collide with entrance animations.
    let dynamicsActive = false;
    setTimeout(() => { dynamicsActive = true; }, 2500);

    // ═══════════════════════════════════════════════════
    // EFFECT 1 — Custom cursor + waveform trail
    // ═══════════════════════════════════════════════════
    let pointer = null, ring = null, trail = null, tctx = null;

    if (supportsHover) {
      pointer = document.createElement('div');
      pointer.id = 'dm-pointer';
      document.body.appendChild(pointer);

      ring = document.createElement('div');
      ring.id = 'dm-pointer-ring';
      document.body.appendChild(ring);

      let ringX = mouseX, ringY = mouseY;

      // Zone detection: hide our custom cursor where another cursor
      // system owns the visual (editbay [data-cursor-zone] / [data-cursor-hide]).
      let cursorMuted = false;
      addEventListener('mousemove', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) { cursorMuted = false; return; }
        cursorMuted = !!(t.closest('[data-cursor-zone]') ||
                         t.closest('[data-cursor-hide]'));
      }, { passive: true, capture: true });

      // Track whether the cursor is on the document at all
      // (mouse can leave viewport — hide custom cursor then).
      let onDoc = true;
      document.documentElement.addEventListener('mouseleave', () => { onDoc = false; });
      document.documentElement.addEventListener('mouseenter', () => { onDoc = true;  });

      function cursorTick() {
        // Dot follows mouse 1:1
        pointer.style.transform =
          `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;

        // Ring lerp 0.25 — snappier catch-up when the cursor stops
        ringX += (mouseX - ringX) * 0.25;
        ringY += (mouseY - ringY) * 0.25;
        ring.style.transform =
          `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;

        // Global visibility: on whole site, unless muted or off-doc
        const visible = onDoc && !cursorMuted;
        pointer.classList.toggle('is-active', visible);
        ring.classList.toggle('is-active', visible);

        requestAnimationFrame(cursorTick);
      }

      requestAnimationFrame(cursorTick);
    }

    // ═══════════════════════════════════════════════════
    // EFFECT 2 — Oscilloscope BG layer
    // ═══════════════════════════════════════════════════
    const osc  = document.getElementById('dm-osc-bg');
    let oCtx, oscPhase = 0;
    let oscCy = 0;  // canvas centerline — aligned to main SVG wave so layers harmonize

    function sizeOsc() {
      if (!osc) return;
      const r   = hero.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      osc.width        = r.width  * dpr;
      osc.height       = r.height * dpr;
      osc.style.width  = r.width  + 'px';
      osc.style.height = r.height + 'px';
      oCtx = osc.getContext('2d');
      oCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Align ghost-wave baseline to the main wave's centerline.
      // Without this, bg waves sit at H/2 of the whole hero while the
      // main wave sits lower in the right column — they read as
      // disconnected layers. Sharing the baseline lets the bg waves
      // echo the main one (same axis, different amp/freq/phase).
      const mainWave = hero.querySelector('.hero-waveform-new svg');
      if (mainWave) {
        const wr = mainWave.getBoundingClientRect();
        oscCy = (wr.top - r.top) + wr.height / 2;
      } else {
        oscCy = r.height / 2;
      }
    }
    if (osc) {
      sizeOsc();
      addEventListener('resize', sizeOsc);
    }

    // ─── Static bg oscilloscope ────────────────────────
    // Per the example reference: bg waves don't translate with
    // the cursor. They sit on the main wave's centerline (oscCy)
    // and just animate phase, so they read as harmonics of it.
    // ───────────────────────────────────────────────────
    function drawOsc() {
      if (!osc || !oCtx) return;
      const r = hero.getBoundingClientRect();
      const W = r.width;
      const H = r.height;
      const cy = oscCy || H / 2;

      oCtx.clearRect(0, 0, W, H);

      const waves = [
        { color: 'rgba(0, 196, 154, 1)', amp: 30, freq: 0.012, lw: 1,   off: 0   },
        { color: 'rgba(255, 59, 0, 1)',  amp: 18, freq: 0.022, lw: 0.7, off: 1.7 },
      ];
      for (const w of waves) {
        oCtx.strokeStyle = w.color;
        oCtx.lineWidth   = w.lw;
        oCtx.beginPath();
        for (let x = 0; x <= W; x += 4) {
          const y = cy + Math.sin(x * w.freq + oscPhase + w.off) * w.amp;
          if (x === 0) oCtx.moveTo(x, y);
          else         oCtx.lineTo(x, y);
        }
        oCtx.stroke();
      }
      oscPhase += 0.025;
      requestAnimationFrame(drawOsc);
    }
    // Match the project pattern: ~700 ms delay before SVG/canvas animations
    setTimeout(() => requestAnimationFrame(drawOsc), 700);

    // ═══════════════════════════════════════════════════
    // EFFECT 3 — Parallax grid + content + labels
    // EFFECT 4 — Wave reacts to mouse (SVG transform)
    //   Shared rAF loop, lerp for smooth follow.
    // ═══════════════════════════════════════════════════
    const heroLeft   = hero.querySelector('.hero-left');
    const waveLabels = hero.querySelectorAll('.hero-wave-label');
    const waveSvg    = hero.querySelector('.hero-waveform-new svg');

    let pNormX = 0, pNormY = 0;

    function parallaxTick() {
      // Lerp toward current mouse pos (or 0 if mouse left hero)
      const targetX = isOverHero ? normX : 0;
      const targetY = isOverHero ? normY : 0;
      pNormX += (targetX - pNormX) * 0.08;
      pNormY += (targetY - pNormY) * 0.08;

      // Grid backdrop — via CSS vars (pseudo-element transform).
      // Mouse multipliers (-40 / -28) + scroll offset for Variant A:
      // as the page scrolls, the grid drifts slower than the hero
      // contents, producing depth on touch where there's no mouse.
      const sY = heroVisible ? scrollOffsetY : 0;
      hero.style.setProperty('--dm-grid-tx', (pNormX * -40).toFixed(2) + 'px');
      hero.style.setProperty(
        '--dm-grid-ty',
        ((pNormY * -28) + sY * 0.30).toFixed(2) + 'px'
      );

      // Heavier transforms wait until entrance animations are done.
      // Effect 4 (wave) has its own rAF loop — see drawWavePath() below.
      if (dynamicsActive) {
        if (heroLeft) {
          heroLeft.style.transform =
            `translate3d(${(pNormX * -8).toFixed(2)}px, ${(pNormY * -5 + sY * 0.12).toFixed(2)}px, 0)`;
        }
        waveLabels.forEach((l) => {
          l.style.transform =
            `translate3d(${(pNormX * -22).toFixed(2)}px, ${(pNormY * -14 + sY * 0.55).toFixed(2)}px, 0)`;
        });
      }

      requestAnimationFrame(parallaxTick);
    }
    requestAnimationFrame(parallaxTick);

    // ═══════════════════════════════════════════════════
    // EFFECT 4 — Main teal SVG wave: JS-driven draw-in + LFO/mouse
    //
    //   JS owns the ENTIRE wave lifecycle — draw-in AND looping motion.
    //   This eliminates the snap that occurred when the CSS wave-draw
    //   animation ended (static cubic-bezier path) and JS took over
    //   (different sine-wave path). With JS owning both phases the path
    //   shape is continuous from first frame to last.
    //
    //   Draw-in phase (0 → DRAW_DUR ms after start):
    //     stroke-dashoffset: 1 → 0  (reveals path left-to-right)
    //     opacity:           0 → 0.85
    //   LFO / interactive phase (after draw-in):
    //     path `d` updated every frame driven by mouse or autonomous LFO.
    //     Transition between LFO and mouse is lerp-smooth (no snap).
    //
    //   stroke-dashoffset is never reset between phases — the draw-in
    //   simply finishes and the dashoffset stays at 0. No transform reset
    //   is applied here, so GSAP's scroll-driven yPercent parallax on the
    //   SVG element is never clobbered.
    // ═══════════════════════════════════════════════════
    const wavePath = waveSvg ? waveSvg.querySelector('path') : null;
    if (wavePath) {
      const W        = 600;
      const CY       = 100;
      const BASE_AMP = 80;
      const CYCLES   = 4.5;

      let wavePhase  = 0;
      let curAmp     = BASE_AMP * 0.6;
      let curFreqMul = 1;

      // Establish initial state via inline style so CSS and JS agree
      wavePath.setAttribute('stroke-linejoin', 'round');
      wavePath.style.strokeDasharray  = '1';
      wavePath.style.strokeDashoffset = '1';
      wavePath.style.opacity          = '0';

      // Draw-in timing mirrors the old CSS animation: 500 ms delay, 1800 ms duration
      const DRAW_DELAY = 500;
      const DRAW_DUR   = 1800;
      let drawStartTime = null;   // set to rAF timestamp on first draw frame
      let drawDone      = false;

      // rAF callback — receives DOMHighResTimeStamp (same timeline as performance.now)
      function drawWavePath(ts) {
        // ── Draw-in: stroke-dashoffset + opacity ──────────────────
        if (!drawDone) {
          if (drawStartTime === null) drawStartTime = ts;
          const elapsed  = ts - drawStartTime;
          const progress = Math.min(1, elapsed / DRAW_DUR);
          // ease-out-quad — matches the feel of the old CSS ease-fade
          const ease = 1 - (1 - progress) * (1 - progress);
          wavePath.style.strokeDashoffset = (1 - ease).toFixed(4);
          wavePath.style.opacity          = (ease * 0.85).toFixed(3);
          if (progress >= 1) {
            drawDone = true;
            wavePath.style.strokeDashoffset = '0';
            wavePath.style.opacity          = '0.85';
          }
        }

        // ── Shape: LFO or mouse/touch ─────────────────────────────
        // The `d` attribute is rewritten every frame regardless of draw-in
        // phase — the path shape is the JS sine wave from frame one, so
        // when draw-in completes there is no shape change (no snap).
        const lt = ts / 1000;
        const sinceInteract = ts - lastInteractTime;
        const interactive   = sinceInteract < 800;

        let targetAmp, targetFreqMul;
        if (interactive) {
          const yNorm   = (normY + 1) * 0.5;
          targetAmp     = BASE_AMP * (0.40 + yNorm * 0.85);   // 0.40·BASE .. 1.25·BASE
          targetFreqMul = 1 + normX * 0.15;                    // 0.85 .. 1.15
        } else {
          targetAmp     = BASE_AMP * (0.65 + Math.sin(lt * 0.50) * 0.15);  // 0.50·BASE .. 0.80·BASE
          targetFreqMul = 1 + Math.sin(lt * 0.38 + 1.2) * 0.10;             // 0.90 .. 1.10
        }

        curAmp      += (targetAmp     - curAmp)      * 0.06;
        curFreqMul  += (targetFreqMul - curFreqMul)  * 0.06;

        const PTS = 180;
        let d = 'M 0 ' + CY;
        for (let i = 1; i <= PTS; i++) {
          const t = i / PTS;
          const envelope = Math.sin(t * Math.PI);
          const y = CY + curAmp * envelope *
                    Math.sin(t * Math.PI * 2 * CYCLES * curFreqMul + wavePhase * 0.020);
          d += ' L ' + (t * W).toFixed(1) + ' ' + y.toFixed(2);
        }
        wavePath.setAttribute('d', d);
        wavePhase += 1;

        requestAnimationFrame(drawWavePath);
      }

      setTimeout(function () {
        requestAnimationFrame(drawWavePath);
      }, DRAW_DELAY);
    }

    // ═══════════════════════════════════════════════════
    // EFFECT 5 — Glitch burst on "FEELING."
    // ═══════════════════════════════════════════════════
    const feelingSpan = hero.querySelector(
      '.hero-headline-new .word:nth-child(2) > span'
    );
    if (feelingSpan) {
      // data-text already in HTML — fallback if it wasn't set:
      if (!feelingSpan.getAttribute('data-text')) {
        feelingSpan.setAttribute('data-text', 'FEELING.');
      }
      const scheduleGlitch = () => {
        const delay = 3000 + Math.random() * 4000;
        setTimeout(() => {
          feelingSpan.classList.add('is-glitching');
          setTimeout(() => feelingSpan.classList.remove('is-glitching'), 150);
          scheduleGlitch();
        }, delay);
      };
      // Start after entrance is fully complete
      setTimeout(scheduleGlitch, 2800);
    }

    // ═══════════════════════════════════════════════════
    // EFFECT 6 — Magnetic CTA stamp
    //   Lerp-driven for smoothness; transition disabled so CSS
    //   doesn't fight rAF updates. Spec values: RADIUS=150,
    //   pull factor 0.38, lerp 0.12.
    // ═══════════════════════════════════════════════════
    const stamp = hero.querySelector('.hero-stamp');
    if (stamp && supportsHover) {
      const RADIUS = 150;
      const PULL   = 0.38;
      let magneticEnabled = false;
      let tgtX = 0, tgtY = 0;
      let curX = 0, curY = 0;

      addEventListener('mousemove', () => {
        if (!magneticEnabled) return;
        const r  = stamp.getBoundingClientRect();
        const cx = r.left + r.width  / 2;
        const cy = r.top  + r.height / 2;
        const dx = mouseX - cx;
        const dy = mouseY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < RADIUS) {
          const pull = 1 - dist / RADIUS;
          tgtX = dx * pull * PULL;
          tgtY = dy * pull * PULL;
        } else {
          tgtX = 0;
          tgtY = 0;
        }
      }, { passive: true });

      function magneticTick() {
        if (magneticEnabled) {
          curX += (tgtX - curX) * 0.12;
          curY += (tgtY - curY) * 0.12;
          const mag = Math.hypot(curX, curY);
          const scale = 1 + (mag / (RADIUS * PULL)) * 0.07;
          // Use 3-arg translate so we don't double-translate
          stamp.style.transform =
            'translate(' + curX.toFixed(2) + 'px, ' + curY.toFixed(2) + 'px) scale(' + scale.toFixed(3) + ')';

          // Cursor ring shrinks + turns teal when CTA is pulling
          if (ring) {
            if (mag > 0.5) ring.classList.add('is-magnetic');
            else            ring.classList.remove('is-magnetic');
          }
        }
        requestAnimationFrame(magneticTick);
      }

      // Activate after stamp-in entrance (1.1 s delay + ~0.9 s duration).
      // Kill any CSS transition on .hero-stamp itself — lerp owns it now.
      setTimeout(() => {
        stamp.style.transition = 'none';
        magneticEnabled = true;
      }, 2200);
      requestAnimationFrame(magneticTick);
    }


    // ═══════════════════════════════════════════════════
    // TOUCH-ONLY: tap-pulse + CTA breathing + tap-bounce + haptic
    //   Activates on (hover: none) / (pointer: coarse) devices.
    //   Trackpad-equipped tablets (iPad with Magic Keyboard etc.)
    //   report hover: hover → they keep the desktop logic above.
    // ═══════════════════════════════════════════════════
    if (isTouch) {
      // ── Tap-pulse — ephemeral orange ring at every touchstart ──
      document.addEventListener('touchstart', (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        const pulse = document.createElement('div');
        pulse.className = 'dm-tap-pulse';
        pulse.style.left = t.clientX + 'px';
        pulse.style.top  = t.clientY + 'px';
        document.body.appendChild(pulse);
        setTimeout(() => pulse.remove(), 650);
      }, { passive: true });

      // ── CTA: switch from stamp-in → breathing → (bounce on tap) ──
      const ctaStamp = hero.querySelector('.hero-stamp');
      if (ctaStamp) {
        // Wait out the stamp-in entrance (~1.1 s delay + 0.9 s) then start breathing.
        // Set opacity inline first: adding dm-cta-breathing replaces the stamp-in
        // animation's forwards-fill, so the base opacity:0 would reappear without this.
        setTimeout(() => {
          ctaStamp.style.opacity = '1';
          ctaStamp.classList.add('dm-cta-breathing');
        }, 2300);

        ctaStamp.addEventListener('touchstart', () => {
          ctaStamp.classList.remove('dm-cta-breathing');
          ctaStamp.classList.add('dm-cta-bouncing');
          if (navigator.vibrate) {
            try { navigator.vibrate(15); } catch (e) {}    // Android haptic; iOS is a no-op
          }
        }, { passive: true });

        ctaStamp.addEventListener('animationend', (ev) => {
          if (ev.animationName === 'dm-cta-bounce') {
            ctaStamp.classList.remove('dm-cta-bouncing');
            ctaStamp.classList.add('dm-cta-breathing');
          }
        });
      }
    }


    // ═══════════════════════════════════════════════════
    // HERO → ABOUT TRANSITION — "Soft recede + splice"
    //   Hero shrinks gently as it scrolls out (scale 1 → 0.92,
    //   opacity 1 → 0.55). About fades + scales IN to focus
    //   (1.04 → 1.0, 0.5 → 1.0) — no translateY, so nothing
    //   gets clipped at the top of the viewport.
    //   A thick orange splice line sweeps across at ~50 % exit.
    // ═══════════════════════════════════════════════════
    const heroContainer = hero.querySelector('.hero-container');

    const splice = document.createElement('div');
    splice.className = 'dm-splice-line';
    document.body.appendChild(splice);
    let spliceArmed = true;

    function heroExitTick() {
      const r = hero.getBoundingClientRect();
      const exit = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height)));
      const ease = Math.pow(exit, 1.25);

      // Hero contents recede — scale + opacity + blur on .hero-container.
      // More aggressive than the original: 18 % scale-down, opacity to 0.30,
      // and a 4 px blur peak so the hero clearly sinks into depth.
      if (heroContainer) {
        const scale   = 1 - ease * 0.18;        // 1.00 → 0.82
        const opacity = 1 - ease * 0.70;        // 1.00 → 0.30
        const blurPx  = ease * 4;                // 0 → 4 px
        heroContainer.style.transform = `scale(${scale.toFixed(3)})`;
        heroContainer.style.opacity   = opacity.toFixed(3);
        heroContainer.style.filter    = blurPx > 0.1 ? `blur(${blurPx.toFixed(1)}px)` : '';
      }

      // Splice line — single orange sweep at the boundary
      if (spliceArmed && exit > 0.40 && exit < 0.75) {
        const yPx = Math.max(0, Math.min(innerHeight - 2, r.bottom));
        splice.style.top = yPx.toFixed(0) + 'px';
        splice.classList.remove('is-firing');
        void splice.offsetWidth;
        splice.classList.add('is-firing');
        spliceArmed = false;
        setTimeout(() => { splice.classList.remove('is-firing'); }, 500);
      }
      if (exit < 0.20) spliceArmed = true;

      requestAnimationFrame(heroExitTick);
    }
    requestAnimationFrame(heroExitTick);


    // ABOUT — "drives in" effect disabled.
    // The parallax card overlay (hero-parallax.js) replaces this:
    // hero scales down while about slides over as a solid card.
    // The scale 1.04→1.00 + opacity 0.55→1.0 conflicted with the
    // overlay — made the section appear to shrink when entering.


    // ═══════════════════════════════════════════════════
    // PHILOSOPHY — image scale (scroll 1.2 → 1.0, hover 1.2)
    //   GSAP parallax on .philosophy-right-img is disabled in
    //   motion-system.js, so we can write directly to the
    //   element's transform without a wrapper / composition.
    //   • JS updates `--ph-scale` on the img every frame
    //   • CSS applies transform: scale(var(--ph-scale, 1.2))
    //   • CSS `:hover` rule overrides with scale(1.2) (with transition)
    // ═══════════════════════════════════════════════════
    const philoImg = document.querySelector('.philosophy-right-img');
    if (philoImg) {
      const philoParent = philoImg.parentElement;
      let curScale = 1.2;

      function philoTick() {
        const r  = philoParent.getBoundingClientRect();
        const vh = innerHeight || document.documentElement.clientHeight;
        let progress;
        if (r.top >= vh)         progress = 0;
        else if (r.bottom <= 0)  progress = 1;
        else                     progress = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));

        const target = 1.20 - progress * 0.20;          // 1.20 → 1.00
        curScale += (target - curScale) * 0.10;
        philoImg.style.setProperty('--ph-scale', curScale.toFixed(3));

        requestAnimationFrame(philoTick);
      }
      requestAnimationFrame(philoTick);
    }

  } // /bootWow
})();
