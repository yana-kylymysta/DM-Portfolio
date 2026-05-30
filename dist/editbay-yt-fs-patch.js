// ============================================================
// editbay-yt-fs-patch.js — Fullscreen behavior patch for editbay
// ============================================================
// Fixes two bugs editbay.js's CSS fullscreen fallback misses on iOS Safari:
//
// 1. Wrap isn't actually pinned to viewport.
//    .editbay-video.is-css-fullscreen CSS uses `position: fixed; inset: 0;`
//    but a transformed ancestor (transform/filter/will-change-transform/etc.
//    somewhere up the .editbay → .editbay-stage → .editbay-tracks chain)
//    creates a containing block — fixed degrades to absolute relative to
//    that ancestor. Visible result: wrap fills the slot box, not the
//    viewport — user can scroll past it and see the next section.
//
//    Fix: PORTAL the wrap into <body> on enter (no transformed ancestor
//    above body), apply position:fixed inline, lock body scroll. On
//    exit, restore the wrap to its original DOM location via a
//    placeholder marker.
//
// 2. YouTube iframe renders YT's native branding bar in the extra portrait
//    space (huge black area + "YouTube" logo at the bottom).
//
//    Fix: force the iframe itself to be 16:9 letterboxed inside the wrap.
//    YT has no extra space to fill — video fills the iframe exactly.
//
// Touches no CSS files. Hooks both fullscreen mechanisms:
//   · native Fullscreen API → fullscreenchange / webkitfullscreenchange
//   · CSS fallback           → MutationObserver on .editbay-video class
// ============================================================
(function () {
  'use strict';

  // ── iframe inline styles ─────────────────────────────────────
  // Min() keeps iframe 16:9 inside any aspect-ratio viewport:
  //   landscape (wide):  height = 100vh, width  = 100vh × 16/9
  //   portrait (tall):   width  = 100vw, height = 100vw ×  9/16
  const IFRAME_FS_CSS =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'width:min(100vw,calc(100vh * 16 / 9));' +
    'height:min(100vh,calc(100vw * 9 / 16));' +
    'border:0;display:block;background:#000;';
  const IFRAME_BASE_CSS =
    'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;';

  // Inline fullscreen styles forced onto the portaled wrap. Inset:0 plus
  // a max z-index put it above page nav regardless of nav's z-index.
  const WRAP_FS_INLINE =
    'position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;' +
    'width:100vw!important;height:100vh!important;height:100dvh!important;' +
    'inset:0!important;margin:0!important;z-index:2147483647!important;' +
    'background:#000!important;border:none!important;border-radius:0!important;' +
    'transform:none!important;display:block!important;';

  function applyIframeFrame(wrap, isFullscreen) {
    if (!wrap) return;
    const iframe = wrap.querySelector('iframe');
    if (!iframe) return;
    iframe.style.cssText = isFullscreen ? IFRAME_FS_CSS : IFRAME_BASE_CSS;
  }

  // ── Body scroll lock (iOS-safe) ──────────────────────────────
  // Setting body position:fixed prevents iOS Safari address-bar bounce
  // from scrolling the underlying page while the fullscreen wrap is up.
  function lockScroll() {
    if (document.body.dataset.editbayFsLock === '1') return;
    const y = window.scrollY || window.pageYOffset || 0;
    document.body.dataset.editbayFsLock = '1';
    document.body.dataset.editbayFsScrollY = String(y);
    document.body.style.cssText +=
      `;position:fixed;top:-${y}px;left:0;right:0;width:100%;overflow:hidden;`;
    document.documentElement.style.overflow = 'hidden';
  }
  function unlockScroll() {
    if (document.body.dataset.editbayFsLock !== '1') return;
    const y = parseInt(document.body.dataset.editbayFsScrollY || '0', 10);
    delete document.body.dataset.editbayFsLock;
    delete document.body.dataset.editbayFsScrollY;
    // Remove the styles we added. Keeping anything else the page set.
    const s = document.body.style;
    s.position = ''; s.top = ''; s.left = ''; s.right = ''; s.width = '';
    s.overflow = '';
    document.documentElement.style.overflow = '';
    window.scrollTo(0, y);
  }

  // ── Portal: move wrap into <body>, leave a placeholder ───────
  function portalIn(wrap) {
    if (wrap.dataset.editbayPortaled === '1') return;
    if (wrap.parentNode === document.body) {
      // Already a child of body (rare, but possible). Mark and continue.
      wrap.dataset.editbayPortaled = '1';
      return;
    }
    const placeholder = document.createElement('div');
    placeholder.dataset.editbayFsPlaceholder = '1';
    placeholder.style.cssText = 'display:none';
    // Insert placeholder where wrap was; then move wrap to body
    wrap.parentNode.insertBefore(placeholder, wrap);
    wrap.dataset.editbayPortaled = '1';
    // Save the wrap's existing inline cssText so we can restore exactly.
    wrap.dataset.editbayPrevStyle = wrap.getAttribute('style') || '';
    wrap.setAttribute('style', WRAP_FS_INLINE);
    document.body.appendChild(wrap);
  }

  function portalOut(wrap) {
    if (wrap.dataset.editbayPortaled !== '1') return;
    delete wrap.dataset.editbayPortaled;
    // Restore the wrap's previous inline style
    const prev = wrap.dataset.editbayPrevStyle || '';
    if (prev) wrap.setAttribute('style', prev);
    else wrap.removeAttribute('style');
    delete wrap.dataset.editbayPrevStyle;
    // Move wrap back to its original location (replace placeholder).
    const placeholder = document.querySelector(
      '[data-editbay-fs-placeholder="1"]'
    );
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(wrap, placeholder);
      placeholder.remove();
    }
    // If placeholder was lost (e.g. parent re-rendered), wrap stays
    // in body — editbay.js's syncVideoPlacement() will pick it up
    // on the next track switch.
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
    // Native FS API is browser-managed — element pins to viewport on its own.
    // Portal/scroll-lock is ONLY needed for the CSS fallback path.
    const isCssFs = wrap.classList && wrap.classList.contains('is-css-fullscreen');
    if (fs) {
      if (isCssFs) {
        portalIn(wrap);
        lockScroll();
      }
      applyIframeFrame(wrap, true);
    } else {
      applyIframeFrame(wrap, false);
      if (wrap.dataset.editbayPortaled === '1') {
        portalOut(wrap);
        unlockScroll();
      }
    }
  }

  // Native Fullscreen API: triggers on enter AND exit.
  const onFsChange = () => {
    document.querySelectorAll('.editbay-video').forEach(apply);
  };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  // CSS fallback: editbay.js toggles .is-css-fullscreen class on the wrap.
  const mo = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      const wrap = m.target;
      if (!wrap.classList || !wrap.classList.contains('editbay-video')) return;
      apply(wrap);
    });
  });

  // ── Boot ────────────────────────────────────────────────────
  function start() {
    document.querySelectorAll('.editbay-video').forEach((wrap) => {
      mo.observe(wrap, { attributes: true, attributeFilter: ['class'] });
    });
    // The wrap moves between mobile-slot and desktop-stage on track switch
    // (editbay.js's syncVideoPlacement). Re-attach observer on any new
    // .editbay-video that may appear later, just in case.
    const docMo = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches('.editbay-video')) {
            mo.observe(node, { attributes: true, attributeFilter: ['class'] });
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('.editbay-video').forEach((w) => {
              mo.observe(w, { attributes: true, attributeFilter: ['class'] });
            });
          }
        });
      });
    });
    docMo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
