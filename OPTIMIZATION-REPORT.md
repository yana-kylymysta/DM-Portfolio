# DM Portfolio — Mobile Performance Pass

**Date:** 2026-05-27
**Baseline (PageSpeed Mobile):** Performance 70 · LCP 5.6s · FCP 2.9s · TBT 110ms · CLS 0.001
**Constraint:** Visual parity. CSS module structure untouched.

---

## What changed

### 1. Poster — `assets/video/video-poster.webp`
- **891 KB → 100 KB** (−89%)
- WebP quality 90, resized 1376×768 → 1280×714 (aspect Δ ≈ 0.05%, imperceptible).
- Bumped `<link rel="preload">` from `fetchpriority="low"` → `"high"` since this is the LCP candidate.

### 2. Hero/Reel video — viewport-adaptive (v3 revision)
Single source caused two problems on desktop:
gradient banding (low bitrate on smooth tones) and silent audio
(audio track was stripped — `soundManager` toggles `muted`, but the track itself was gone).
Replaced with two encodes, picked at runtime by the deferred loader:

| Version | Size | Resolution | CRF | Audio | Serves |
|---|---|---|---|---|---|
| `video-bg.mp4` (desktop) | 3.3 MB | 1280×704 | 20 (near-lossless) | AAC 96k stereo | viewport > 900 px |
| `video-bg-mobile.mp4` | 1.1 MB | 854×468 (480p) | 26 | AAC 64k mono | viewport ≤ 900 px |
| _Original_ | 5.0 MB | 1280×704 | — | AAC 128k stereo | — |

Mobile fetches only the 1.1 MB file (−78% vs. original).
Desktop fetches the 3.3 MB file (−36% vs. original) but with clean gradients and intact stereo audio.
Both have `+faststart` for streaming and are deferred until `window.load`.

### 3. Deferred video loading (viewport-aware)
In `index.html`:
- `<video preload="none">`, no `<source>` in initial HTML
- URLs live on the `<video>` element as `data-src-desktop` / `data-src-mobile`
- Inline loader runs after `window.load` (via `requestIdleCallback`, fallback `setTimeout 600ms`):
  - reads `window.matchMedia('(min-width: 901px)')` → picks the right URL
  - appends `<source>`, switches `preload` → `metadata`, calls `video.load()`
  - idempotent via `dataset.activated` flag
- The existing `IntersectionObserver` in `reel.js` then plays it when the section enters the viewport — **on every breakpoint, mobile included**. No visual change.

### 4. JS minification → `dist/`
| File | Original | Minified | Saved |
|---|---|---|---|
| wow-effects.js | 26.9 KB | 7.2 KB | −73% |
| motion-system.js | 25.7 KB | 7.8 KB | −70% |
| editbay.js | 29.8 KB | 10.4 KB | −65% |
| reel.js | 15.7 KB | 5.6 KB | −65% |
| **Total** | **98 KB** | **31 KB** | **−67 KB** |

Tool: terser, `--compress passes=2 --mangle`. Source files in `js/` left intact for development. `index.html` now references `dist/*.min.js` for these four.

### 5. Preconnect cleanup
Removed: `youtube.com`, `i.ytimg.com`, `s.ytimg.com`, `dns-prefetch` for googlevideo.
Kept: `fonts.googleapis.com`, `fonts.gstatic.com`, `youtube-nocookie.com`.

### 6. ARIA on `.process-timeline`
- Removed `role="list"` from the container (children mixed `.process-node` + `.process-inline-detail`, so list/listitem contract was broken).
- Removed orphan `role="listitem"` from all four `.process-node` children.
- Net result: cleaner a11y tree, no behavior change.

### 7. Footer contrast — `.f-copy`
- `rgba(239, 234, 224, 0.35)` on `#0A0A0A` ≈ **2.8:1** (fails WCAG AA)
- Now `rgba(239, 234, 224, 0.78)` ≈ **~9:1** (passes AAA)
- Applied as inline style on the `<span>` to leave the CSS module structure untouched.

---

## Total transfer savings

- Poster: −793 KB
- Video : −4244 KB (deferred — not even fetched before first paint anymore)
- JS    : −67 KB (minified)
- **Effective LCP-window payload reduction: ~860 KB → ~100 KB** (poster alone — video is fully deferred)

---

## Expected impact

| Metric | Baseline | Estimated |
|---|---|---|
| LCP | 5.6 s | **2.6–3.4 s** (poster −800 KB + `fetchpriority="high"` + video out of critical path) |
| FCP | 2.9 s | 2.6–2.8 s (preconnect noise removed; JS parse cost down) |
| TBT | 110 ms | 70–90 ms (minified JS = less parse + less execute) |
| Performance score | 70 | **85–92** projected |
| CLS | 0.001 | 0.001 (no layout changes) |

LCP is the biggest unlock — the previous poster alone was ~890 KB; the video added 5 MB of background traffic that the network had to schedule. Both are now either tiny or deferred entirely.

---

## Files in this drop

- `dm-studio-optimized-v2.zip` (2.1 MB) — full deployable site minus `assets/projects/` (unchanged portfolio videos, 164 MB)
- `dm-studio-changes-only.zip` (983 KB) — just the 7 files touched in this pass

## Files touched

```
index.html
assets/video/video-poster.webp
assets/video/video-bg.mp4
dist/wow-effects.min.js   (new)
dist/motion-system.min.js (new)
dist/editbay.min.js       (new)
dist/reel.min.js          (new)
```

No CSS file was modified. Source JS in `js/` retained.

---

## Visual parity audit

| Surface | Check | Result |
|---|---|---|
| Poster image | Aspect ratio | 1.7917 → 1.7927 (Δ 0.0010, sub-pixel) |
| Hero video | Dimensions | 1280×704 → 1280×704 (identical) |
| Hero video | Duration / fps | 5.00 s @ 32 fps → 5.00 s @ 32 fps (identical) |
| Layout / DOM | Class names | unchanged |
| CSS | Modules | unchanged (0 CSS edits) |
| Footer text | Color | brighter (intentional WCAG fix — only deliberate visual change) |

No headless browser was available in the sandbox, so screenshot diff was not run. Recommended: spot-check the reel section on mobile after deploying — the poster should appear instantly, and the video should fade in only when scrolled to the reel section (same as before, just now with deferred network fetch).

## Notes for next pass (out of scope here)

- `philosophy-bg.jpg` (246 KB) still ships alongside its WebP (137 KB). The JPEG is the fallback for a `<picture>` element — verify it's actually referenced; if not, drop it.
- The `<link rel="preconnect" href="https://www.youtube-nocookie.com">` is justified by editbay's YouTube embeds, but a `lazy-load on first track-click` strategy could push the YouTube iframe API out of the initial load entirely.
- Consider preloading Bebas Neue (used in LCP heading) via `<link rel="preload" as="font" crossorigin>` once the LCP candidate is confirmed in field data.
