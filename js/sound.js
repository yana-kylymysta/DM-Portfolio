// ════════════════════════════════════════════════════════════════
//  sound.js — single source of truth for ALL video audio
// ════════════════════════════════════════════════════════════════
//  Default state on page load: MUTED.
//  Every <video> and YT.Player on the page registers with
//  soundManager. The header toggle flips one boolean and every
//  registered target is muted/unmuted in lockstep.
//
//  Public API — window.soundManager
//    .enabled                  → boolean (true = sound on)
//    .toggle()                 → flip + sync everything
//    .setEnabled(bool)         → set + sync everything
//    .register(target)         → start tracking a target
//    .unregister(target)       → stop tracking
//    .subscribe(fn)            → listen for state changes
//                                returns an unsubscribe function
//
//  A target is one of:
//    • HTMLMediaElement      (regular <video>/<audio>)
//    • YT.Player             (already-instantiated YouTube player)
//    • { type:'yt', getPlayer: () => YT.Player|null }
//        — for editbay: the YT.Player can be destroyed/recreated
//          on track switch, so we ask for it lazily on every sync.
//
//  Legacy compatibility — kept so older modules keep working:
//    window.globalSoundOn   ← mirrors soundManager.enabled
//    window.applyGlobalSound(on)  → soundManager.setEnabled(on)
//    window.syncVolBtn(on)        → updates legacy main-player vol icons
// ════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Shared AudioContext (lazy; reused by hero fader + chime) ──
  let _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  }
  window.getDMAudioCtx = getAudioCtx;

  // Subtle UI chime: ascending tone for ON, descending for OFF.
  function playToggleChime(on) {
    try {
      const ctx  = getAudioCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(on ? 880 : 660, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(on ? 1100 : 440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  }

  // ── Target registry ──────────────────────────────────────────
  const targets   = new Set();
  const listeners = new Set();

  const isVideoEl = t => t instanceof HTMLMediaElement;
  const isYTPlayer = t =>
    t && typeof t.mute === 'function' && typeof t.unMute === 'function';
  const isYTLazy = t =>
    t && t.type === 'yt' && typeof t.getPlayer === 'function';

  function applyToTarget(target, on) {
    try {
      if (isVideoEl(target)) {
        target.muted = !on;
      } else if (isYTPlayer(target)) {
        on ? target.unMute() : target.mute();
      } else if (isYTLazy(target)) {
        const p = target.getPlayer();
        if (p && typeof p.mute === 'function') {
          on ? p.unMute() : p.mute();
        }
      }
    } catch (e) {}
  }

  function syncAll() {
    const on = manager.enabled;
    // 1. Registered targets (handles YT players, lazy refs, etc.)
    targets.forEach(t => applyToTarget(t, on));
    // 2. Safety sweep — any <video> in the DOM not explicitly registered
    //    (covers dynamically-created videos in portfolio.js / player.js)
    document.querySelectorAll('video').forEach(v => { v.muted = !on; });
  }

  function syncUI() {
    const on = manager.enabled;
    const navBtns = [
      document.getElementById('nav-sound-btn'),
      document.getElementById('nav-sound-btn-mobile'),
    ];
    navBtns.forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('sound-on', on);
      btn.title = on ? 'Sound on' : 'Sound off';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    // Reel sound button — now a shortcut to the global toggle
    const reelBtn = document.getElementById('reel-sound-btn');
    if (reelBtn) {
      reelBtn.classList.toggle('sound-on', on);
      reelBtn.classList.toggle('globally-muted', !on);
      reelBtn.title = on ? 'Mute video' : 'Unmute video';
      const lbl = document.getElementById('reel-sound-label');
      if (lbl) lbl.textContent = on ? 'Mute' : 'Sound';
    }
    // Editbay vol button — reflects global state too
    document.querySelectorAll('.epc-vol-btn').forEach(btn => {
      btn.classList.toggle('is-muted', !on);
      btn.setAttribute('aria-label', on ? 'Mute' : 'Unmute');
    });
    // Legacy main-player vol icons (used by player.js)
    syncVolBtnLegacy(on);
  }

  function syncVolBtnLegacy(on) {
    const off    = document.getElementById('vp-vol-icon-off');
    const onI    = document.getElementById('vp-vol-icon-on');
    const volBtn = document.getElementById('vp-vol-btn');
    if (off)    off.style.display = on ? 'none' : 'block';
    if (onI)    onI.style.display = on ? 'block' : 'none';
    if (volBtn) volBtn.style.color = on ? 'rgba(255,255,255,0.9)' : '';
  }

  function notify() {
    listeners.forEach(fn => { try { fn(manager.enabled); } catch (e) {} });
  }

  // ── Public API ───────────────────────────────────────────────
  const manager = {
    enabled: false,

    setEnabled(on) {
      const next = !!on;
      if (next === this.enabled) return;
      this.enabled = next;
      window.globalSoundOn = next;     // legacy mirror
      syncAll();
      syncUI();
      notify();
    },

    toggle() {
      const audible = Array.from(document.querySelectorAll('video')).some(
        v => !v.paused && !v.muted && v.volume > 0
      );
      this.setEnabled(!this.enabled);
      if (!audible) playToggleChime(this.enabled);
    },

    register(target) {
      if (!target) return;
      targets.add(target);
      applyToTarget(target, this.enabled);
    },

    unregister(target) { targets.delete(target); },

    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      try { fn(this.enabled); } catch (e) {}
      return () => listeners.delete(fn);
    },
  };

  window.soundManager = manager;

  // ── Legacy shims (other modules read these directly) ─────────
  window.globalSoundOn   = false;
  window.applyGlobalSound = (on) => manager.setEnabled(on);
  window.syncVolBtn       = syncVolBtnLegacy;

  // ── Boot ─────────────────────────────────────────────────────
  function init() {
    // Wire header toggles
    const navBtn       = document.getElementById('nav-sound-btn');
    const navBtnMobile = document.getElementById('nav-sound-btn-mobile');
    navBtn       && navBtn.addEventListener('click',       () => manager.toggle());
    navBtnMobile && navBtnMobile.addEventListener('click', () => manager.toggle());

    // Auto-register every static <video> on the page so they are
    // muted from the start and stay in lockstep with the toggle.
    document.querySelectorAll('video').forEach(v => manager.register(v));

    syncUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
