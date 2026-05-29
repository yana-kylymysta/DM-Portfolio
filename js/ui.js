/* ═══════════════════════════════════════════════════
   ui.js — small UI behaviours
   · Hero fader knob animation (drifts every 2–3.5s)
   · Burger menu (mobile drawer)
   · Philosophy bg lazy load (IntersectionObserver)

   Scroll reveal lives in motion-system.js — the previous
   IntersectionObserver here double-bound .reveal nodes (CSS
   transition + GSAP fromTo). Removed in v9.
   ═══════════════════════════════════════════════════ */
(function initUI() {

  // ── HERO: fader knob continuous animation ──
  const trackX  = [68, 128, 190, 252, 312];
  const knobW   = 36, knobH = 18;
  const faderRanges = [
    { min: 60, max: 360 },
    { min: 60, max: 380 },
    { min: 60, max: 380 },
    { min: 60, max: 380 },
    { min: 60, max: 360 },
  ];
  const knobClasses = ['fader-knob-1','fader-knob-2','fader-knob-3','fader-knob-4','fader-knob-5'];

  // Track hero visibility — fader audio (when re-enabled) only fires while hero is on screen
  let heroInView = true;
  const heroSection = document.querySelector('.hero');
  if (heroSection) {
    const heroObs = new IntersectionObserver((entries) => {
      heroInView = entries[0].isIntersecting;
    }, { threshold: 0.1 });
    heroObs.observe(heroSection);
  }

  function moveFader(idx) {
    const els = document.querySelectorAll('.' + knobClasses[idx]);
    if (els.length < 2) return;
    const { min, max } = faderRanges[idx];
    const newY = Math.round(min + Math.random() * (max - min));
    const rx   = trackX[idx] - knobW / 2;
    const midY = newY + Math.round(knobH / 2);
    els[0].setAttribute('y', newY);
    els[0].setAttribute('x', rx);
    els[1].setAttribute('y1', midY); els[1].setAttribute('y2', midY);
    els[1].setAttribute('x1', rx);   els[1].setAttribute('x2', rx + knobW);
    // Subtle fader tick sound — disabled (kept commented in v8); re-enable if needed.
  }

  function scheduleFader(idx) {
    const delay = 2000 + Math.random() * 1500;
    setTimeout(() => { moveFader(idx); scheduleFader(idx); }, delay);
  }

  // SVG attribute transitions (no real CSS transitions on SVG attrs without `style`)
  knobClasses.forEach(cls => {
    document.querySelectorAll('.' + cls).forEach(el => {
      el.style.transition = 'all 0.65s cubic-bezier(.4,0,.2,1)';
    });
  });

  // Start looping after entrance animation completes (~2.3s)
  setTimeout(() => {
    knobClasses.forEach((_, i) => {
      setTimeout(() => scheduleFader(i), i * 300);
    });
  }, 500);


  // ── BURGER MENU ──
  const burgerBtn      = document.getElementById('burger-btn');
  const navDrawer      = document.getElementById('nav-drawer');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');
  const drawerLinks    = document.querySelectorAll('.drawer-link');

  // Bail out if nav markup is missing — keeps the rest of ui.js working
  if (burgerBtn && navDrawer) {
    const toggleMenu = (open) => {
      burgerBtn.classList.toggle('open', open);
      navDrawer.classList.toggle('open', open);
      burgerBtn.setAttribute('aria-expanded', String(open));
      navDrawer.setAttribute('aria-hidden', String(!open));
      document.body.style.overflow = open ? 'hidden' : '';
    };

    burgerBtn.addEventListener('click', () => toggleMenu(!burgerBtn.classList.contains('open')));
    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', () => toggleMenu(false));
    drawerLinks.forEach(link => link.addEventListener('click', () => toggleMenu(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navDrawer.classList.contains('open')) toggleMenu(false);
    });
  }


  // ── PHILOSOPHY BG LAZY LOAD ──
  const philRight = document.querySelector('.philosophy-right');
  const philImg   = document.querySelector('.philosophy-right-img');
  if (philRight && philImg) {
    const philObs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        // Try WebP first, fall back to JPG
        const webp = new Image();
        webp.onload  = () => { philImg.style.backgroundImage = "url('./assets/images/philosophy-bg.webp')"; };
        webp.onerror = () => { philImg.style.backgroundImage = "url('./assets/images/philosophy-bg.jpg')";  };
        webp.src = './assets/images/philosophy-bg.webp';
        philObs.disconnect();
      }
    }, { rootMargin: '200px' });
    philObs.observe(philRight);
  }

  // Reel video play/pause is owned by reel.js (IntersectionObserver).

})();
