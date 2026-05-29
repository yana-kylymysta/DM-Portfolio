/* ═══════════════════════════════════════════════════
   dm-studio redesign — sections.js
   About waveform · Process timeline · Testimonial slider
   ═══════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────
   1. ABOUT — Animated Waveform Canvas
   Mouse X = frequency, Mouse Y = amplitude
   ───────────────────────────────────────────────── */
(function initAboutWave() {
  const canvas = document.getElementById('about-wave-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let raf = null, t = 0;
  let mouseX = 0.5, mouseY = 0.5;

  function resize() {
    canvas.width  = canvas.offsetWidth  || canvas.parentElement.offsetWidth;
    canvas.height = canvas.offsetHeight || canvas.parentElement.offsetHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  const panel = canvas.parentElement;
  panel.addEventListener('mousemove', function(e) {
    const r = panel.getBoundingClientRect();
    mouseX = (e.clientX - r.left) / r.width;
    mouseY = (e.clientY - r.top)  / r.height;
  });

  /* Draw one smooth sinusoidal line using Catmull-Rom-style bezier */
  function drawSine(color, lineWidth, freqBase, ampScale, phaseOffset) {
    const W = canvas.width, H = canvas.height;
    const pts = 200;
    const freq = freqBase + mouseX * 0.025;
    const amp  = H * ampScale * (0.55 + mouseY * 0.45);

    ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const x = (i / pts) * W;
      /* Smooth envelope: ramps up to centre, back down — like a breathing waveform */
      const envelope = Math.sin((i / pts) * Math.PI);
      /* Raised 40% higher: center at H*0.25 instead of H*0.5 */
      const y = H * 0.25
            + amp * envelope * Math.sin(i * freq + t + phaseOffset);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* 3 background lines — match border/rule colour #454548
       Alpha lifted ~10% for better readability on dark backgrounds. */
    drawSine('rgba(95,95,98,0.31)',  1,   0.045, 0.22, 0);
    drawSine('rgba(95,95,98,0.22)',  1,   0.038, 0.18, Math.PI * 0.7);
    drawSine('rgba(95,95,98,0.26)',  1,   0.052, 0.20, Math.PI * 1.4);

    /* Main accent line — orange, reacts most */
    drawSine('rgba(255,59,0,0.35)',  1.5, 0.055, 0.28, 0);

    t += 0.012;
    raf = requestAnimationFrame(tick);
  }

  const obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) { if (!raf) tick(); }
      else { cancelAnimationFrame(raf); raf = null; }
    });
  }, { threshold: 0.05 });
  obs.observe(canvas.closest('section') || canvas.parentElement);
})();


/* ─────────────────────────────────────────────────
   2. PROCESS — Frequency Timeline
   Single continuous waveform whose amplitude grows
   across the 4 zones: Silence → Tension → Build → Release
   ───────────────────────────────────────────────── */
(function initProcess() {

  /* ── Waveform canvas ── */
  const canvas = document.getElementById('process-wave-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let raf2 = null, t2 = 0;

    /* Mouse tracking — same pattern as about-wave */
    let pMouseX = 0.5, pMouseY = 0.5;
    let pMouseXSmooth = 0.5, pMouseYSmooth = 0.5;

    const processSection = canvas.closest('section') || canvas.parentElement;
    processSection.addEventListener('mousemove', function(e) {
      const r = processSection.getBoundingClientRect();
      pMouseX = (e.clientX - r.left) / r.width;
      pMouseY = (e.clientY - r.top)  / r.height;
    });
    processSection.addEventListener('mouseleave', function() {
      pMouseX = 0.5;
      pMouseY = 0.5;
    });

    function resizeP() {
      canvas.width  = window.innerWidth || canvas.parentElement.offsetWidth;
      canvas.height = canvas.offsetHeight || 100;
    }
    window.addEventListener('resize', resizeP);
    resizeP();

    /*
      Strategy: draw ONE continuous smooth curve across the full width.
      Amplitude envelope is low on left (Silence), grows toward centre-right
      (Build), then settles back (Release) — matching the emotional arc.
      Mouse X nudges the frequency; Mouse Y nudges the overall amplitude.
    */
    function drawProcessWave(color, lineWidth, freqMult, ampEnvScale, phaseOff) {
      const W = canvas.width, H = canvas.height;
      const pts = 400;
      ctx.beginPath();

      /* Mouse influence: X shifts frequency slightly, Y shifts amplitude */
      const freqNudge = (pMouseXSmooth - 0.5) * 0.008;
      const ampNudge  = 0.85 + pMouseYSmooth * 0.30;

      for (let i = 0; i <= pts; i++) {
        const x  = (i / pts) * W;
        const px = i / pts; /* 0 → 1 across the full width */

        /* Amplitude envelope: smooth continuous curve using smoothstep
           Silence(0-0.25): low → Tension(0.25-0.5): rising →
           Build(0.5-0.75): peak → Release(0.75-1.0): settling
           Uses smoothstep blending to avoid discontinuities at zone boundaries.
        */
        function smoothstep(t) { return t * t * (3 - 2 * t); }
        let env;
        if (px < 0.25) {
          env = 0.05 + smoothstep(px / 0.25) * 0.22;
        } else if (px < 0.5) {
          env = 0.27 + smoothstep((px - 0.25) / 0.25) * 0.50;
        } else if (px < 0.75) {
          const tEnv = smoothstep((px - 0.5) / 0.25);
          env = 0.77 + tEnv * 0.23; /* peaks at exactly 1.0 at px=0.75 */
        } else {
          env = 1.0 - smoothstep((px - 0.75) / 0.25) * 0.48;
        }

        const amp = (H * 0.46) * ampEnvScale * env * ampNudge;
        const y   = H * 0.5 + amp * Math.sin(px * W * (freqMult + freqNudge) + t2 + phaseOff);

        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }

      ctx.strokeStyle = color;
      ctx.lineWidth   = lineWidth;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      ctx.stroke();
    }

    function tickP() {
      /* Smooth mouse interpolation — easing factor 0.06, same as about-wave feel */
      pMouseXSmooth += (pMouseX - pMouseXSmooth) * 0.06;
      pMouseYSmooth += (pMouseY - pMouseYSmooth) * 0.06;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      /* 3 background lines — match border/rule colour #454548
         Alpha lifted ~10% for better readability on dark backgrounds. */
      drawProcessWave('rgba(95,95,98,0.31)',  1,   0.018, 0.80, Math.PI * 0.7);
      drawProcessWave('rgba(95,95,98,0.22)',  1,   0.014, 0.65, Math.PI * 1.4);
      drawProcessWave('rgba(95,95,98,0.26)',  1,   0.022, 0.72, 0);
      /* Orange accent line */
      drawProcessWave('rgba(255,59,0,0.35)',    1.5, 0.024, 0.90, 0.4);

      t2 += 0.009;
      raf2 = requestAnimationFrame(tickP);
    }

    const obsP = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) { if (!raf2) tickP(); }
        else { cancelAnimationFrame(raf2); raf2 = null; }
      });
    }, { threshold: 0.05 });
    obsP.observe(canvas.closest('section') || canvas.parentElement);
  }

  /* ── Step expand ── */
  const steps = [
    {
      num:   '01',
      label: 'Stage 01 — Foundation',
      title: 'Brief & Discover',
      body:  'I start by understanding the story before touching a single track. Who is this for? What do you want the audience to feel at 00:45? What film does this remind you of emotionally? A proper brief saves weeks of wrong direction.'
    },
    {
      num:   '02',
      label: 'Stage 02 — Harmonic layer',
      title: 'Direction Map',
      body:  'A curated reference reel, each track annotated with the specific emotional function it serves — not just "I like this". You review and approve the emotional direction before any editing begins. No surprises.'
    },
    {
      num:   '03',
      label: 'Stage 03 — The craft',
      title: 'Edit & Design',
      body:  'This is where it happens. Cutting music to picture. Designing sonic transitions. Layering texture under dialogue. Shaping the emotional arc of the entire piece. Usually 1–2 rounds of feedback.'
    },
    {
      num:   '04',
      label: 'Stage 04 — Delivery',
      title: 'Refine & Deliver',
      body:  'Final mix, stems, all source files. Formatted for your platform — film, broadcast, web, podcast. Delivered on time. Documented. Available for questions after handoff, because good work builds long relationships.'
    }
  ];

  let currentStep   = -1;
  const detailEl    = document.getElementById('process-detail');
  const detailNum   = document.getElementById('process-detail-num');
  const detailLabel = document.getElementById('process-detail-label');
  const detailTitle = document.getElementById('process-detail-title');
  const detailBody  = document.getElementById('process-detail-body');

  function buildInlineDetail(s) {
    return '<div class="process-inline-detail-inner">'
      + '<div class="process-inline-detail-num">' + s.num + '</div>'
      + '<div>'
      + '<div class="process-inline-detail-label">' + s.label + '</div>'
      + '<div class="process-inline-detail-title">' + s.title + '</div>'
      + '<p class="process-inline-detail-body">' + s.body + '</p>'
      + '</div></div>';
  }

  window.processExpand = function(i) {
    const nodes    = document.querySelectorAll('.process-node');
    const isMobile = window.innerWidth < 900;
    const row1El   = document.getElementById('process-inline-detail-row1');
    const row2El   = document.getElementById('process-inline-detail-row2');

    if (currentStep === i) {
      // Close
      currentStep = -1;
      if (detailEl) detailEl.classList.remove('visible');
      if (row1El) row1El.classList.remove('visible');
      if (row2El) row2El.classList.remove('visible');
      nodes.forEach(function(n) {
        n.classList.remove('active');
        n.setAttribute('aria-expanded', 'false');
      });
      return;
    }

    currentStep = i;
    const s = steps[i];

    // Always populate desktop panel — guard each ref (markup may vary by viewport)
    if (detailNum)   detailNum.textContent   = s.num;
    if (detailLabel) detailLabel.textContent = s.label;
    if (detailTitle) detailTitle.textContent = s.title;
    if (detailBody)  detailBody.textContent  = s.body;

    if (isMobile && row1El && row2El) {
      const isSingleCol = window.innerWidth <= 600;
      const allInline   = document.querySelectorAll('.process-inline-detail');

      if (isSingleCol) {
        // Mobile 1-col: each node has its own --solo detail slot
        const targetEl = document.getElementById('process-inline-detail-' + i);
        allInline.forEach(function(el) {
          if (el !== targetEl) el.classList.remove('visible');
        });
        if (targetEl) {
          targetEl.innerHTML = buildInlineDetail(s);
          targetEl.offsetHeight;
          targetEl.classList.add('visible');
          setTimeout(function() {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 50);
        }
      } else {
        // Tablet 2-col: row1 for steps 0&1, row2 for steps 2&3
        const inRow1    = (i === 0 || i === 1);
        const targetRow = inRow1 ? row1El : row2El;
        const otherRow  = inRow1 ? row2El : row1El;

        otherRow.classList.remove('visible');
        targetRow.innerHTML = buildInlineDetail(s);
        targetRow.offsetHeight;
        targetRow.classList.add('visible');

        setTimeout(function() {
          targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      }

      if (detailEl) detailEl.classList.remove('visible');
    } else {
      // Desktop
      if (row1El) row1El.classList.remove('visible');
      if (row2El) row2El.classList.remove('visible');
      if (detailEl) detailEl.classList.add('visible');
    }

    nodes.forEach(function(n, idx) {
      n.classList.toggle('active', idx === i);
      n.setAttribute('aria-expanded', idx === i ? 'true' : 'false');
    });
  };
})();


/* ─────────────────────────────────────────────────
   3. TESTIMONIALS — Slider
   ───────────────────────────────────────────────── */
(function initTestiSlider() {
  const track = document.getElementById('testi-track');
  if (!track) return;

  const slides  = track.querySelectorAll('.testi-slide');
  const dots    = document.querySelectorAll('.testi-dot');
  const counter = document.getElementById('testi-counter');
  const prevBtn = document.getElementById('testi-prev');
  const nextBtn = document.getElementById('testi-next');
  const total   = slides.length;
  let current   = 0;

  // Cache reduced-motion preference once; goTo runs on every user input.
  const prefersReducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function goTo(idx) {
    idx = (idx + total) % total;
    const isChange = idx !== current;
    track.style.transform = 'translateX(-' + (idx * 100) + '%)';
    slides.forEach(function(s, i) { s.classList.toggle('is-active', i === idx); });
    dots.forEach(function(d, i) {
      d.classList.toggle('active', i === idx);
      d.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    if (counter) counter.textContent = String(idx + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');

    // Subtle rise-in for the new slide's content. Skipped on initial call
    // (motion-system.js owns the first reveal via scrollTrigger) and on
    // reduced-motion. overwrite:true cancels any in-flight tween if the
    // user clicks dots quickly.
    if (isChange && !prefersReducedMotion && typeof gsap !== 'undefined') {
      const inner = slides[idx].querySelectorAll('.testi-pull-quote, .testi-author-row');
      if (inner.length) {
        gsap.fromTo(inner,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.55, ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
            stagger: 0.08, overwrite: true }
        );
      }
    }
    current = idx;
  }

  if (prevBtn) prevBtn.addEventListener('click', function() { goTo(current - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function() { goTo(current + 1); });

  window.testiGoTo = goTo;

  const wrap = document.getElementById('testi-slider-wrap');
  let touchStartX = 0;
  if (wrap) {
    // Touch swipe
    wrap.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    wrap.addEventListener('touchend', function(e) {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) goTo(current + (dx < 0 ? 1 : -1));
    }, { passive: true });

    // Mouse drag (for grab cursor feedback + drag-to-slide on desktop)
    let mouseStartX = 0, isDragging = false;
    wrap.addEventListener('mousedown', function(e) {
      mouseStartX = e.clientX;
      isDragging = true;
      wrap.classList.add('is-dragging');
    });
    window.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      // Prevent text selection while dragging
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('mouseup', function(e) {
      if (!isDragging) return;
      isDragging = false;
      wrap.classList.remove('is-dragging');
      const dx = e.clientX - mouseStartX;
      if (Math.abs(dx) > 40) goTo(current + (dx < 0 ? 1 : -1));
    });
    wrap.addEventListener('mouseleave', function() {
      if (isDragging) {
        isDragging = false;
        wrap.classList.remove('is-dragging');
      }
    });
  }

  document.addEventListener('keydown', function(e) {
    const section = document.querySelector('.testimonials');
    if (!section) return;
    const r = section.getBoundingClientRect();
    if (r.top > window.innerHeight || r.bottom < 0) return;
    if (e.key === 'ArrowRight') goTo(current + 1);
    if (e.key === 'ArrowLeft')  goTo(current - 1);
  });

  goTo(0);
})();
