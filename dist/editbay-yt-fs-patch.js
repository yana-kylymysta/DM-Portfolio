// ============================================================
// editbay-yt-fs-patch.js — Fullscreen behavior patch for editbay
// ============================================================
// Two iOS Safari problems with editbay.js's CSS fullscreen fallback:
//
// 1. Wrap not pinned to viewport.
//    Some transformed ancestor (.editbay → .editbay-stage → .editbay-tracks
//    chain has transforms/will-change up the tree) creates a containing
//    block, so `position: fixed` on .editbay-video.is-css-fullscreen
//    degrades to absolute relative to that ancestor. User can scroll past
//    the wrap and see the next section.
//
//    Fix: PORTAL the wrap into <body> (no transformed ancestor exists
//    above body), apply fixed positioning via an injected stylesheet
//    (more reliable than setAttribute('style', ...) on iOS), restore
//    via placeholder on exit.
//
// 2. YouTube iframe renders YT's branding bar in the extra portrait space.
//    Fix: force the iframe itself to 16:9 letterboxed inside the wrap.
//
// Touches no CSS files. Hooks both fullscreen mechanisms:
//   · native Fullscreen API → fullscreenchange / webkitfullscreenchange
//   · CSS fallback           → MutationObserver on .editbay-video class
// ============================================================
(function () {
  'use strict';

  // ── Inject stylesheet ────────────────────────────────────────
  // One-time install of two utility classes the patch toggles.
  // Done via <style> rather than per-element inline so iOS Safari
  // parses the !important rules reliably and we have a clean
  // class-toggle API instead of setAttribute juggling.
  const css = `
    .editbay-fs-portal {
      position: fixed !important;
      top: 0 !important; left: 0 !important;
      right: 0 !important; bottom: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      height: 100dvh !important;
      margin: 0 !important;
      z-index: 2147483647 !important;
      background: #000 !important;
      transform: none !important;
      border-radius: 0 !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    .editbay-fs-portal iframe {
      position: absolute !important;
      top: 50% !important; left: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: min(100vw, calc(100vh * 16 / 9)) !important;
      height: min(100vh, calc(100vw * 9 / 16)) !important;
      border: 0 !important;
      display: block !important;
      background: #000 !important;
    }
    .editbay-fs-portal video {
      position: absolute !important;
      top: 50% !important; left: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: 100% !important;
      height: 100% !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      object-fit: contain !important;
      background: #000 !important;
    }
    html.editbay-fs-lock,
    html.editbay-fs-lock body {
      overflow: hidden !important;
      touch-action: none !important;
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-editbay-fs-patch', '1');
  styleEl.textContent = css;
  (document.head || document.documentElement).appendChild(styleEl);

  // ── Portal: move wrap into <body>, leave a placeholder ───────
  function portalIn(wrap) {
    if (wrap.dataset.editbayPortaled === '1') return;
    if (wrap.parentNode === document.body) {
      // Already body-level — just mark for later cleanup symmetry.
      wrap.dataset.editbayPortaled = '1';
      wrap.classList.add('editbay-fs-portal');
      return;
    }
    const placeholder = document.createElement('div');
    placeholder.dataset.editbayFsPlaceholder = '1';
    placeholder.style.cssText = 'display:none';
    wrap.parentNode.insertBefore(placeholder, wrap);
    wrap.dataset.editbayPortaled = '1';
    document.body.appendChild(wrap);
    wrap.classList.add('editbay-fs-portal');
    document.documentElement.classList.add('editbay-fs-lock');
  }

  function portalOut(wrap) {
    if (wrap.dataset.editbayPortaled !== '1') return;
    delete wrap.dataset.editbayPortaled;
    wrap.classList.remove('editbay-fs-portal');
    document.documentElement.classList.remove('editbay-fs-lock');
    const placeholder = document.querySelector(
      '[data-editbay-fs-placeholder="1"]'
    );
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(wrap, placeholder);
      placeholder.remove();
    }
    // If placeholder was lost (e.g. parent re-rendered), wrap stays
    // in body — editbay.js's track-switch logic will pull it back
    // into the new mobile slot on the next interaction.
  }

  // ── State application ────────────────────────────────────────
  function isWrapFullscreen(wrap) {
    if (!wrap || !wrap.classList) return false;
    if (wrap.classList.contains('is-css-fullscreen')) return true;
    if (wrap.classList.contains('is-native-fullscreen')) return true;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    return wrap === fsEl;
  }

  function apply(wrap) {
    if (!wrap) return;
    const fs = isWrapFullscreen(wrap);
    const isCssFs = wrap.classList && wrap.classList.contains('is-css-fullscreen');
    if (fs && isCssFs) {
      // Native Fullscreen API is browser-managed (it pins automatically),
      // so we only portal for the CSS fallback path used on iOS iframe FS.
      portalIn(wrap);
    } else if (!fs && wrap.dataset.editbayPortaled === '1') {
      portalOut(wrap);
    }
  }

  // Native Fullscreen API: triggers on enter AND exit.
  const onFsChange = () => {
    document.querySelectorAll('.editbay-video').forEach(apply);
  };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  // CSS fallback: editbay.js toggles .is-css-fullscreen on the wrap.
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
      const wrap = m.target;
      if (!wrap.classList || !wrap.classList.contains('editbay-video')) continue;
      apply(wrap);
    }
  });

  function start() {
    document.querySelectorAll('.editbay-video').forEach((wrap) => {
      mo.observe(wrap, { attributes: true, attributeFilter: ['class'] });
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
