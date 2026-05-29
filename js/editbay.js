// ============================================================
// editbay.js — "THE WORK" unified player
// Handles local video + YouTube with a single custom control bar.
// Orientation is auto-detected from video metadata (local) or
// data-orientation attribute (YouTube).
// ============================================================

(function () {
  'use strict';

  const section = document.querySelector('.editbay');
  if (!section) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 1. Mini waveforms ─────────────────────────────────────
  function seededRand(seed) {
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }

  function buildWaveform(svg, seed, bars = 60) {
    const rand = seededRand(seed || 'default');
    const w = 100, barW = w / bars * 0.55, gap = w / bars - barW;
    let out = '';
    for (let i = 0; i < bars; i++) {
      const h = Math.max(8, Math.sin((i / bars) * Math.PI) * (rand() * 0.6 + 0.4) * 100);
      const x = i * (barW + gap), y = 50 - h / 2;
      out += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" class="${rand() > 0.55 ? 'lit' : ''}"/>`;
    }
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = out;
  }

  section.querySelectorAll('.editbay-track-wave').forEach(svg =>
    buildWaveform(svg, svg.closest('.editbay-track')?.dataset.id || String(Math.random()))
  );

  // ── 2. Reveal on scroll ───────────────────────────────────
  // Entry animations (title words, video, corners, tracks stagger)
  // are owned by js/motion-system.js. Don't double-bind here.
  const videoWrap = section.querySelector('.editbay-video');
  const tracks    = Array.from(section.querySelectorAll('.editbay-track'));

  // ── 3. Control elements ───────────────────────────────────
  const mediaEl    = section.querySelector('.editbay-video-content');
  const readoutEl  = section.querySelector('.editbay-readout-track');
  const epcProg    = section.querySelector('.epc-progress');
  const epcFilled  = section.querySelector('.epc-filled');
  const epcHandle  = section.querySelector('.epc-handle');
  const epcPlayBtn = section.querySelector('.epc-play-btn');
  const epcTimeEl  = section.querySelector('.epc-time');
  const epcVolBtn  = section.querySelector('.epc-vol-btn');
  const epcVolSldr = section.querySelector('.epc-vol-slider');
  const epcFsBtn   = section.querySelector('.epc-fs-btn');

  // ── 4. Player state ───────────────────────────────────────
  let localVid  = null;   // <video> DOM element
  let ytPlayer  = null;   // YT.Player instance
  let mediaType = null;   // 'video' | 'youtube' | null
  let rafId     = null;
  let volume    = 0.7;    // 0–1, volume LEVEL only (mute is global)
  let isDragging = false;

  // Mute state is owned by window.soundManager. We never store it
  // locally — every read goes through this helper so there is one
  // source of truth on the page.
  const isSoundOn = () => !!window.soundManager?.enabled;

  // Register a lazy YT reference once. soundManager will ask for the
  // current ytPlayer on every toggle, so destroying/recreating the
  // player on track switch is transparent.
  window.soundManager?.register({ type: 'yt', getPlayer: () => ytPlayer });

  // Scroll autoplay state (Variant B — respect user's manual pause).
  // userPaused: true once the user explicitly clicks pause. Reset on every
  //             track switch so a new track always starts fresh.
  // inViewport: true when ≥50% of the video frame is visible. Drives
  //             auto play/pause as the user scrolls past the section.
  let userPaused = false;
  let inViewport = false;

  const fmt = s =>
    (isFinite(s) && s >= 0)
      ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
      : '0:00';

  // ── 5. UI sync ────────────────────────────────────────────
  function syncPlayIcon(playing) {
    epcPlayBtn?.classList.toggle('is-playing', playing);
    epcPlayBtn?.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    videoWrap?.classList.toggle('is-playing', playing);

    // Update custom cursor label to reflect current state
    const cursorText = playing ? '⏸ Pause' : '▶ Play';
    if (videoWrap) videoWrap.dataset.cursorLabel = cursorText;
    // If cursor is already hovering the main video area, refresh the label live.
    // Guard: only overwrite when the current label is a play-state label, so we
    // don't clobber "⇆ Seek" while the user is hovering the progress bar.
    const visibleLabel = document.querySelector('.dm-cursor.is-visible .dm-cursor-label');
    if (visibleLabel && /Play|Pause/.test(visibleLabel.textContent)) {
      visibleLabel.textContent = cursorText;
    }
  }

  function syncProgress(cur, dur) {
    const pct = dur > 0 ? (cur / dur) * 100 : 0;
    if (epcFilled) epcFilled.style.width = `${pct}%`;
    if (epcHandle) epcHandle.style.left  = `${pct}%`;
    if (epcTimeEl) epcTimeEl.textContent = `${fmt(cur)} / ${fmt(dur)}`;
  }

  function syncVolIcon() {
    const muted = !isSoundOn();
    epcVolBtn?.classList.toggle('is-muted', muted);
    epcVolBtn?.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    // Slider always reflects the chosen volume LEVEL — independent
    // of mute state, which is shown by the icon.
    if (epcVolSldr) epcVolSldr.value = volume;
  }

  // Re-sync icon whenever the global mute state changes.
  window.soundManager?.subscribe(() => syncVolIcon());

  // ── 6. RAF progress loop ──────────────────────────────────
  function stopRaf() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  function startRaf() {
    stopRaf();
    (function tick() {
      if (mediaType === 'video' && localVid) {
        syncProgress(localVid.currentTime, localVid.duration || 0);
        syncPlayIcon(!localVid.paused);
      } else if (mediaType === 'youtube' && ytPlayer) {
        try {
          syncProgress(ytPlayer.getCurrentTime(), ytPlayer.getDuration());
          syncPlayIcon(ytPlayer.getPlayerState() === 1);
        } catch (_) {}
      }
      rafId = requestAnimationFrame(tick);
    }());
  }

  // ── 7. Playback actions ───────────────────────────────────
  function play() {
    if (mediaType === 'video') localVid?.play().catch(() => {});
    if (mediaType === 'youtube' && ytPlayer) {
      // iOS Safari quirk: when the YT player was loaded but autoplay
      // was blocked (no user gesture), the player sits in "unstarted"
      // (-1) or "cued" (5) state where playVideo() can fail silently
      // on the first tap — that's why the user sees "click on YT
      // doesn't play immediately, need a few more taps". loadVideoById
      // under an active user gesture reliably kicks off playback.
      const state = ytPlayer.getPlayerState?.();
      if (state === -1 || state === 5) {
        const id = ytPlayer.getVideoData?.()?.video_id;
        if (id) {
          try { ytPlayer.loadVideoById(id); return; } catch (_) {}
        }
      }
      ytPlayer.playVideo?.();
    }
  }
  function pause() {
    if (mediaType === 'video')   localVid?.pause();
    if (mediaType === 'youtube') ytPlayer?.pauseVideo?.();
  }
  function isPlayingNow() {
    if (mediaType === 'video')   return !!localVid && !localVid.paused;
    if (mediaType === 'youtube') return ytPlayer?.getPlayerState?.() === 1;
    return false;
  }

  function togglePlay() {
    if (mediaType === 'video')   { localVid?.paused ? play() : pause(); }
    if (mediaType === 'youtube') { ytPlayer?.getPlayerState?.() === 1 ? pause() : play(); }
  }

  // User-initiated toggle — flags userPaused so scroll-autoplay won't override.
  function userTogglePlay() {
    if (isPlayingNow()) {
      userPaused = true;
      pause();
    } else {
      userPaused = false;
      play();
    }
  }

  // Volume LEVEL only — applies to whichever media is active.
  // Mute state is owned by soundManager and never touched here.
  function setVolumeLevel(vol) {
    volume = Math.max(0, Math.min(1, vol));
    if (mediaType === 'video' && localVid) {
      localVid.volume = volume;
    }
    if (mediaType === 'youtube' && ytPlayer && typeof ytPlayer.setVolume === 'function') {
      try { ytPlayer.setVolume(volume * 100); } catch (e) {}
    }
    syncVolIcon();
  }

  function toggleMute() { window.soundManager?.toggle(); }

  function seekTo(ratio) {
    const r = Math.max(0, Math.min(1, ratio));
    if (mediaType === 'video' && localVid)
      localVid.currentTime = r * (localVid.duration || 0);
    if (mediaType === 'youtube' && ytPlayer?.seekTo)
      ytPlayer.seekTo(r * (ytPlayer.getDuration() || 0), true);
  }

  // ── YT iframe fullscreen letterboxing ─────────────────────
  // Problem: in fullscreen the iframe is 100%/100% of the wrap (= viewport).
  // On portrait phones the wrap is much taller than 16:9, so YT renders the
  // video at iframe-width × 16:9 height and uses the remaining tall space
  // for its own branding bar + recommended thumbnails. Yana saw this on
  // iOS Safari/Chrome: "video sits at top, huge black area, YouTube logo
  // at the bottom — looks broken."
  //
  // Fix: force the iframe itself to be 16:9 and letterbox it inside the
  // wrap. YT then has no extra space to fill with chrome — the video
  // perfectly matches the iframe box (centered, with black bars).
  //
  // Uses min() so the iframe fits either dimension:
  //   landscape (wide):   height = 100vh, width = 100vh × 16/9
  //   portrait (tall):    width  = 100vw, height = 100vw ×  9/16
  // Inline only — no CSS file is touched.
  const YT_IFRAME_BASE_CSS =
    'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;';
  const YT_IFRAME_FS_CSS =
    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'width:min(100vw,calc(100vh * 16 / 9));' +
    'height:min(100vh,calc(100vw * 9 / 16));' +
    'border:0;display:block;background:#000;';
  function applyYtFullscreenFrame(fullscreen) {
    if (mediaType !== 'youtube' || !ytPlayer?.getIframe) return;
    const iframe = ytPlayer.getIframe();
    if (!iframe) return;
    iframe.style.cssText = fullscreen ? YT_IFRAME_FS_CSS : YT_IFRAME_BASE_CSS;
  }

  function goFullscreen() {
    const wrap = mediaEl?.closest('.editbay-video') || section.querySelector('.editbay-video');

    // Toggle off CSS fallback if it's currently active.
    if (wrap?.classList.contains('is-css-fullscreen')) {
      wrap.classList.remove('is-css-fullscreen');
      applyYtFullscreenFrame(false);
      if (mediaType === 'youtube' && ytPlayer?.setSize) {
        try { ytPlayer.setSize('100%', '100%'); } catch (_) {}
      }
      return;
    }

    // Toggle off native Fullscreen API if document is in fullscreen.
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { try { exit.call(document); return; } catch (e) { /* fall through */ } }
    }

    const el = mediaType === 'video' ? localVid : mediaEl?.querySelector('iframe');
    if (!el) return;

    // 1. iOS Safari: <video> only fullscreens via webkitEnterFullscreen
    //    (Enter, NOT Request — different API surface). Gives the native
    //    iOS player chrome with swipe-down to dismiss. iframe cannot
    //    fullscreen on iOS Safari, so YouTube falls through to CSS.
    if (mediaType === 'video' && typeof el.webkitEnterFullscreen === 'function') {
      try { el.webkitEnterFullscreen(); return; } catch (e) { /* fall through */ }
    }

    // 2. Standard Fullscreen API — desktop, Android Chrome, Safari ≥16.
    //    Target the wrapper (.editbay-video) so our custom controls
    //    stay overlaid in fullscreen. Falls back to the media element
    //    itself if the wrapper request is rejected.
    const target = wrap || el;
    const req = target.requestFullscreen
             || target.webkitRequestFullscreen
             || target.mozRequestFullScreen
             || target.msRequestFullscreen;
    if (req) {
      try { req.call(target); return; } catch (e) { /* fall through */ }
    }

    // 3. CSS fallback — iOS Safari iframe (YouTube), legacy browsers.
    //    Adds .is-css-fullscreen class; editbay.css makes it cover
    //    the viewport. Same button (or Escape) toggles it off.
    wrap?.classList.add('is-css-fullscreen');
    applyYtFullscreenFrame(true);
    // YT layout nudge — '100%' (string) keeps the iframe in sync with its
    // parent box via CSS. Pixel values here would lock the iframe to a fixed
    // viewport snapshot and break on address-bar resize / orientation flip.
    if (mediaType === 'youtube' && ytPlayer?.setSize) {
      try { ytPlayer.setSize('100%', '100%'); } catch (_) {}
    }
  }

  // ── Escape key exits CSS-fullscreen (native FS handles its own exit) ──
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const exited = document.querySelector('.editbay-video.is-css-fullscreen');
    if (!exited) return;
    exited.classList.remove('is-css-fullscreen');
    applyYtFullscreenFrame(false);
    // Restore YT size after CSS-fullscreen exits.
    if (mediaType === 'youtube' && ytPlayer?.setSize) {
      try { ytPlayer.setSize('100%', '100%'); } catch (_) {}
    }
  });

  // ── Sync native Fullscreen API state with .is-native-fullscreen class ──
  // Lets CSS swap the FS icon to "collapse" and enlarge the tap target so
  // the user can clearly see how to return to normal view. Covers exits
  // via Escape, native UI, or system gestures.
  const syncNativeFsState = () => {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    document.querySelectorAll('.editbay-video.is-native-fullscreen')
      .forEach((el) => { if (el !== fsEl) el.classList.remove('is-native-fullscreen'); });
    if (fsEl && fsEl.classList && fsEl.classList.contains('editbay-video')) {
      fsEl.classList.add('is-native-fullscreen');
    }

    // YT-specific: the iframe resizes via CSS when the wrap goes fullscreen,
    // but YT's internal video layout doesn't auto-detect the new viewport.
    // Nudge YT with '100%' (string) — keeps the iframe percentage-sized so
    // CSS controls the actual dimensions. Pixel values here used to lock
    // the iframe to a fullscreen snapshot and break the layout on exit
    // (and on address-bar resize on mobile). Defer to next frame so the
    // browser has actually applied the fullscreen viewport size first —
    // fullscreenchange fires *before* layout settles on some engines.
    applyYtFullscreenFrame(!!fsEl);
    if (mediaType === 'youtube' && ytPlayer?.setSize) {
      requestAnimationFrame(() => {
        try { ytPlayer.setSize('100%', '100%'); } catch (_) {}
      });
    }
  };
  document.addEventListener('fullscreenchange', syncNativeFsState);
  document.addEventListener('webkitfullscreenchange', syncNativeFsState);

  // ── 8. Progress bar interaction ───────────────────────────
  if (epcProg) {
    const ratio = e => {
      const r = epcProg.getBoundingClientRect();
      return (e.clientX - r.left) / r.width;
    };
    // Toggle a body-level class during drag so the ew-resize cursor
    // sticks across the whole document — without this, the cursor
    // reverts the moment the pointer leaves the 3px-tall bar.
    const startSeek = () => {
      isDragging = true;
      document.documentElement.classList.add('is-editbay-seeking');
    };
    const endSeek = () => {
      if (!isDragging) return;
      isDragging = false;
      document.documentElement.classList.remove('is-editbay-seeking');
    };

    epcProg.addEventListener('mousedown', e => { startSeek(); seekTo(ratio(e)); });
    window.addEventListener('mousemove',  e => { if (isDragging) seekTo(ratio(e)); });
    window.addEventListener('mouseup',    endSeek);

    epcProg.addEventListener('touchstart', e => { startSeek(); seekTo(ratio(e.touches[0])); }, { passive: true });
    window.addEventListener('touchmove',   e => { if (isDragging) seekTo(ratio(e.touches[0])); },  { passive: true });
    window.addEventListener('touchend',    endSeek);
  }

  epcPlayBtn?.addEventListener('click', userTogglePlay);
  epcVolBtn?.addEventListener('click',  toggleMute);
  epcFsBtn?.addEventListener('click',   goFullscreen);
  epcVolSldr?.addEventListener('input', e => setVolumeLevel(+e.target.value));

  // Click anywhere on the video (but not on controls) to toggle play/pause
  section.querySelector('.editbay-click-play')
    ?.addEventListener('click', userTogglePlay);

  // Init UI to default state
  syncVolIcon();
  syncProgress(0, 0);

  // ── 9. YouTube IFrame API (lazy-loaded) ───────────────────
  let ytReady = false;
  const ytQueue = [];

  function loadYouTubeApi(cb) {
    ytQueue.push(cb);
    if (ytReady) { cb(); return; }
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }

  // Chain with any pre-existing handler from other scripts
  const _prevReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    _prevReady?.();
    ytReady = true;
    ytQueue.splice(0).forEach(fn => fn());
  };

  // Warm up the YT IFrame API as soon as editbay approaches the viewport.
  // This downloads the ~80 KB script in parallel, so by the time the user
  // clicks a YouTube track, the iframe spins up instantly instead of
  // waiting on a cold script fetch.
  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) {
      loadYouTubeApi(() => {});
      obs.disconnect();
    }
  }, { rootMargin: '800px 0px' }).observe(section);

  // Scroll-driven autoplay/pause (Variant B):
  //   • ≥50% of the video frame visible → play (unless user paused manually)
  //   • <50%  → pause (auto-pause does NOT flip userPaused, so resuming on
  //                    scroll-back keeps respecting the user's intent)
  if (videoWrap) {
    new IntersectionObserver((entries) => {
      const entry = entries[0];
      inViewport = entry.isIntersecting;
      if (inViewport) {
        if (!userPaused) play();
      } else {
        pause();
      }
    }, { threshold: 0.5 }).observe(videoWrap);
  }

  // ── Tab visibility — pause on tab switch, resume on return ────────
  // Capture playback state when the tab goes hidden, then restore it
  // on return. This does NOT flip userPaused (the manual-pause intent
  // is preserved across tab switches just like scroll-pause does).
  // Works for both local <video> and YouTube iframe.
  let wasPlayingOnHide = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      wasPlayingOnHide = isPlayingNow();
      if (wasPlayingOnHide) pause();
    } else if (wasPlayingOnHide && !userPaused && inViewport) {
      play();
      wasPlayingOnHide = false;
    } else {
      wasPlayingOnHide = false;
    }
  });

  // ── 10. Track activation ──────────────────────────────────
  // Split into focused helpers (≤ 40 lines each):
  //   setActiveTrack — UI state for the track list + readout
  //   teardownCurrentMedia — destroy previous YT player / clear refs
  //   mountYouTube / mountLocalVideo / mountPlaceholder — media swappers

  const PLACEHOLDER_HTML =
    '<div class="editbay-placeholder">' +
      '<span class="editbay-placeholder-icon">▶</span>' +
      '<span class="editbay-placeholder-label">Video coming soon</span>' +
    '</div>';

  function setActiveTrack(trackEl) {
    tracks.forEach(t => t.classList.toggle('is-active', t === trackEl));
    updateCounter();
    // Keep the mobile/tablet slot under the freshly active track.
    syncVideoPlacement();
    const title = trackEl.querySelector('.editbay-track-title')?.textContent || '';
    if (readoutEl) readoutEl.textContent = title;
  }

  function teardownCurrentMedia() {
    stopRaf();
    if (ytPlayer) { try { ytPlayer.destroy(); } catch (_) {} ytPlayer = null; }
    localVid  = null;
    mediaType = null;
    syncPlayIcon(false);
    syncProgress(0, 0);
  }

  function mountYouTube(ytId) {
    mediaType = 'youtube';
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;inset:0;';
    mediaEl.appendChild(host);

    loadYouTubeApi(() => {
      // Guard: user may have switched track while API was loading
      if (!mediaEl.contains(host)) return;

      // Only pass `origin` for real http(s) pages — file:// or null origins
      // make the IFrame API throw SecurityError and the embed fails to load.
      const isWebOrigin = /^https?:$/.test(location.protocol);
      const playerVars = {
        autoplay:        0,    // autoplay handled by IntersectionObserver
        mute:            isSoundOn() ? 0 : 1,
        rel:             0,
        modestbranding:  1,
        playsinline:     1,
        controls:        0,
        disablekb:       1,
        iv_load_policy:  3,
        cc_load_policy:  0,
        fs:              0,
      };
      if (isWebOrigin) playerVars.origin = location.origin;

      ytPlayer = new YT.Player(host, {
        videoId: ytId,
        width: '100%', height: '100%',
        // nocookie skips tracking pixels on first frame → faster initial paint
        host: 'https://www.youtube-nocookie.com',
        playerVars,
        events: {
          onReady(e) {
            // Force the iframe to absolutely fill its parent — same posture as
            // the local <video> mount (which writes position:absolute; inset:0;
            // width:100%; height:100%). YT.Player otherwise drops the iframe as
            // a static block with only width/height HTML attrs, which gets
            // overridden by YT's own setSize() inline styles in fullscreen and
            // produces the broken layout Yana caught (video doesn't fill the
            // viewport on FS-toggle). With these inline styles the iframe
            // always tracks its parent's box — in-page, CSS-fullscreen,
            // and native Fullscreen API all look identical.
            const iframe = e.target.getIframe?.();
            if (iframe) {
              iframe.style.cssText =
                'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;';
            }
            e.target.setVolume((volume || 0.7) * 100);
            isSoundOn() ? e.target.unMute() : e.target.mute();
            startRaf();
            // Play only when the section is on screen and not user-paused
            if (inViewport && !userPaused) e.target.playVideo();
          },
          onStateChange(e) { syncPlayIcon(e.data === 1); },
        },
      });
    });
  }

  function mountLocalVideo(src) {
    mediaType = 'video';
    const vid = document.createElement('video');
    vid.loop        = true;
    vid.playsInline = true;
    vid.muted       = true;   // muted required for autoplay; real state set after play()
    vid.setAttribute('playsinline', '');
    vid.setAttribute('preload', 'auto');
    vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';

    vid.addEventListener('loadedmetadata', () => {
      const isPortrait = vid.videoHeight > vid.videoWidth;
      vid.style.objectFit = isPortrait ? 'contain' : 'cover';
      vid.classList.toggle('is-portrait', isPortrait);
      startRaf();
      const muted = !isSoundOn();
      if (inViewport && !userPaused) {
        vid.play()
          .then(() => { vid.muted = muted; vid.volume = volume || 0.7; })
          .catch(() => {});
      } else {
        vid.muted = muted;
        vid.volume = volume || 0.7;
      }
    }, { once: true });

    vid.addEventListener('error', () => {
      if (mediaEl.contains(vid)) mediaEl.innerHTML = PLACEHOLDER_HTML;
    }, { once: true });

    vid.src = src;
    mediaEl.appendChild(vid);
    localVid = vid;
  }

  function mountPlaceholder() {
    mediaEl.innerHTML = PLACEHOLDER_HTML;
  }

  function activateTrack(trackEl) {
    if (!trackEl) return;

    // Switching tracks resets the manual-pause flag — every new track gets
    // a fresh chance to autoplay when the section is in the viewport.
    userPaused = false;

    setActiveTrack(trackEl);

    const ytId = (trackEl.dataset.youtube || '').trim();
    const src  = (trackEl.dataset.video   || '').trim();

    teardownCurrentMedia();

    if (videoWrap && !reduceMotion) videoWrap.classList.add('is-swapping');

    setTimeout(() => {
      if (!mediaEl) return;
      mediaEl.innerHTML = '';

      if (ytId)     mountYouTube(ytId);
      else if (src) mountLocalVideo(src);
      else          mountPlaceholder();

      videoWrap?.classList.remove('is-swapping');
    }, reduceMotion ? 0 : 220);
  }

  // ── 11. Filters + More Videos ─────────────────────────────
  // NOTE: filter state must be declared BEFORE the initial activateTrack() call,
  // because activateTrack → updateCounter → matchesFilter reads currentCat/currentSub.
  // Hoisting only covers `function`/`var` — `let` lives in TDZ until this line.
  const filters    = section.querySelectorAll('.editbay-filter');
  const subFilters = section.querySelectorAll('.editbay-subfilter');
  const subRow     = section.querySelector('.editbay-subfilters');
  const moreBtn    = section.querySelector('#editbay-more-btn');
  const moreCount  = section.querySelector('#editbay-more-count');

  const INITIAL_VISIBLE = 5;
  let currentCat = 'music-editing', currentSub = 'all', listExpanded = false;

  // ── 11.5 Mobile/Tablet — slot the video under the active track ──
  // ────────────────────────────────────────────────────────────────
  // Below 1101 px the video leaves the stage and accordions in directly
  // under the active <article.editbay-track>. We MOVE the original
  // .editbay-video element (never clone) so the live <video> / YT iframe,
  // soundManager registration and IntersectionObservers all stay intact —
  // browsers preserve playback state when you re-parent a media element
  // within the same document, no reload, no re-init.
  // Defined BEFORE the first activateTrack() call below so the initial
  // auto-select correctly slots the video on mobile too.
  const mqMobile    = matchMedia('(max-width: 1100px)');
  const videoHome   = videoWrap?.parentNode || null;       // .editbay-stage
  const videoAnchor = videoWrap?.nextSibling || null;      // restore position
  let   mobileSlot  = null;

  function ensureMobileSlot() {
    if (mobileSlot) return mobileSlot;
    mobileSlot = document.createElement('div');
    mobileSlot.className = 'editbay-video-mobile-slot';
    return mobileSlot;
  }

  function destroyMobileSlot() {
    if (!mobileSlot) return;
    // Detach video back to its stage anchor before removing the slot,
    // otherwise we'd take the video out of the DOM with it.
    if (videoWrap && mobileSlot.contains(videoWrap) && videoHome) {
      videoHome.insertBefore(videoWrap, videoAnchor);
    }
    mobileSlot.remove();
    mobileSlot = null;
  }

  function slotVideoUnder(trackEl) {
    if (!videoWrap || !trackEl) return;
    const slot = ensureMobileSlot();
    // Reposition the slot if the active track changed
    if (trackEl.nextElementSibling !== slot) {
      trackEl.insertAdjacentElement('afterend', slot);
    }
    if (videoWrap.parentNode !== slot) {
      slot.appendChild(videoWrap);
    }
    // Two rAFs: the first commits the closed state, the second triggers
    // the height transition via the .is-open class.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => slot.classList.add('is-open'))
    );
  }

  function syncVideoPlacement() {
    const active = tracks.find(t => t.classList.contains('is-active'));
    if (mqMobile.matches) {
      if (active) slotVideoUnder(active);
    } else {
      // Desktop — restore video to its original position in the stage
      if (videoWrap && videoHome && videoWrap.parentNode !== videoHome) {
        videoHome.insertBefore(videoWrap, videoAnchor);
      }
      destroyMobileSlot();
    }
  }

  // Re-slot when the viewport crosses the breakpoint
  mqMobile.addEventListener('change', syncVideoPlacement);

  tracks.forEach(t => t.addEventListener('click', () => activateTrack(t)));

  // Auto-select first track that has actual media
  activateTrack(
    tracks.find(t => (t.dataset.youtube || '').trim() || (t.dataset.video || '').trim())
    || tracks[0]
  );

  // ── Counter: "01 / 06" — active index / total tracks in active tab ─
  // Total reflects ALL tracks matching the current filter (not just expanded ones),
  // so "More videos +1" correctly shows 5 / 6, not 5 / 5.
  function matchesFilter(t) {
    const catOk = currentCat === 'all' || t.dataset.cat === currentCat;
    const subOk = currentCat !== 'music-editing' || currentSub === 'all' || t.dataset.sub === currentSub;
    return catOk && subOk;
  }

  function updateCounter() {
    const el = section.querySelector('#editbay-track-count');
    if (!el) return;
    const matched   = tracks.filter(matchesFilter);
    const activeIdx = matched.findIndex(t => t.classList.contains('is-active'));
    const total     = matched.length;
    const current   = activeIdx >= 0 ? activeIdx + 1 : (total > 0 ? 1 : 0);
    el.textContent  = `${String(current).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  }

  // ── Auto-play first visible track with actual media ────────
  function activateFirstVisible() {
    const first = tracks.find(t =>
      t.style.display !== 'none' &&
      ((t.dataset.youtube || '').trim() || (t.dataset.video || '').trim())
    );
    if (first) activateTrack(first);
  }

  function applyFilters() {
    // Sync sub-f
