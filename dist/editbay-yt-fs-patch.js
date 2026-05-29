// ============================================================
// editbay-yt-fs-patch.js — YouTube iframe letterboxing in fullscreen
// ============================================================
// editbay.js sets YT iframe to 100%/100% of its wrap. In fullscreen
// the wrap = viewport. On portrait phones the viewport is much taller
// than 16:9, so YT renders the video at iframe-width × 16:9 height
// and uses the remaining tall space for its own branding bar +
// recommended thumbnails. Yana saw this on iOS Safari/Chrome:
// "video sits at top, huge black area, YouTube logo at the bottom —
// looks broken."
//
// Fix: force the iframe to be 16:9 and letterbox it inside the wrap.
// YT then has no extra space to fill with chrome — the video
// perfectly matches the iframe box (centered, with black bars).
//
// Uses min() so the iframe fits either dimension:
//   landscape (wide):  height = 100vh, width  = 100vh × 16/9
//   portrait (tall):   width  = 100vw, height = 100vw ×  9/16
//
// Hooks both fullscreen mechanisms:
//   · native Fullscreen API → fullscreenchange / webkitfullscreenchange
//   · CSS fallback           → MutationObserver on .editbay-video class
// ============================================================
(function () {
  'use strict';

  const FS_CSS =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'width:min(100vw,calc(100vh * 16 / 9));' +
    'height:min(100vh,calc(100vw * 9 / 16));' +
    'border:0;display:block;background:#000;';
  const BASE_CSS =
    'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;';

  function applyToWrap(wrap, isFullscreen) {
    if (!wrap) return;
    const iframe = wrap.querySelector('iframe');
    if (!iframe) return;
    iframe.style.cssText = isFullscreen ? FS_CSS : BASE_CSS;
  }

  function isWrapFullscreen(wrap) {
    if (!wrap) return false;
    if (wrap.classList && wrap.classList.contains('is-css-fullscreen')) return true;
    if (wrap.classList && wrap.classList.contains('is-native-fullscreen')) return true;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    return wrap === fsEl;
  }

  // Native Fullscreen API: triggers on enter AND exit.
  const onFsChange = () => {
    document.querySelectorAll('.editbay-video').forEach((wrap) => {
      applyToWrap(wrap, isWrapFullscreen(wrap));
    });
  };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  // CSS fallback: editbay.js toggles .is-css-fullscreen class on the wrap.
  const mo = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      const wrap = m.target;
      if (!wrap.classList || !wrap.classList.contains('editbay-video')) return;
      applyToWrap(wrap, isWrapFullscreen(wrap));
    });
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
