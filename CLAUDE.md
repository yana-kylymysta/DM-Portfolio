# DM Portfolio — Dmytro Mushynskyi

Sound designer & music editor based in Kyiv. Freelances on Upwork.
Core concept: "Controls emotion through sound."
Target: international clients in film, advertising, documentary, brand audio.

---

## Stack

Pure HTML / CSS / JavaScript. No frameworks, no build tools.
Single-file architecture: `index.html` (or `index-new.html` for active work).

---

## Design Tokens

```
Colors:
  --off-white:  #F5F2ED
  --black:      #0A0A0A
  --orange:     #FF3B00
  --blue:       #0A0AFF
  --border:     #D8D4CD

Fonts:
  Display:  Bebas Neue / Barlow Condensed
  Body:     DM Sans / Barlow
  Mono:     Space Mono

Theme: Light. Brutalist grid. Minimalist, bold, typographic.
```

---

## Site Structure

Fixed nav → Hero → Ticker → Philosophy → Services →
Video Reel → Process → Selected Work (table) →
Audio Player (simulated) → Testimonials → CTA/Contact → Footer

---

## Critical Rules

### Files
- Always edit the **uploaded source file** — never intermediate outputs
- Active file is whichever was last uploaded by Yana; confirm before editing

### Mobile / Responsive
- `min-width: 0` on ALL grid and flex containers — prevents grid blowout
- `overflow: hidden` on sections that contain SVG or animated elements
- `word-break: break-word` on large display text
- Test at 375px, 600px, 900px breakpoints

### CSS Architecture
- No overrides, no `!important` unless absolutely unavoidable
- Clean structure — no cascade chaos
- Use CSS custom properties for all design tokens

### Animation
- Subtle, purposeful — no decorative noise
- Use `cubic-bezier` for all transitions
- Scroll animations: `IntersectionObserver` or sticky scroll with `clip-path`
- JS animation init: `setTimeout` ~600–800ms delay before SVG/knob elements start
- Always use `requestAnimationFrame` for DOM writes

### Performance
- Non-blocking font loading (`font-display: swap`)
- LCP image: `<link rel="preload">`
- Video: `preload="none"`, YouTube iframe as background (not file-based video)
- Lazy load heavy sections via `IntersectionObserver`
- `content-visibility: auto` on `.reveal` elements

---

## Known Patterns & Solutions

| Problem | Solution |
|---|---|
| Mobile horizontal overflow | `overflow: hidden` on section + `min-width: 0` on grid children |
| Waveform SVG causes overflow | Simplify positioning, contain inside wrapper |
| Hero grid blowout on mobile | `min-width: 0` on `.hero-bottom` children |
| Philosophy image hover zoom | Inner wrapper + `transform: scale(1.06)` + cubic-bezier |
| Video reel reveal | `clip-path: inset()` over `250vh` sticky scroll container |
| Burger menu mobile | Fullscreen drawer `<601px`; right panel `min(420px, 80vw)` at `601–900px` |
| Background video not working | Use YouTube iframe only — file-based video unreliable |

---

## Anti-Patterns (Never Do)

- Don't add frameworks or dependencies
- Don't add decorative animations that break UX
- Don't apply edits to output files — always the source
- Don't use `!important` to fix cascade issues — fix the cascade
- Don't inline everything — keep structure readable
- Don't suggest converting JPEGs to WebP — Yana handles asset conversion

---

## Yana's Work Style

- Communicates concisely, often in Ukrainian
- Works block-by-block, iteratively
- Expects confirmation of file state before edits
- Values clean, minimal implementation
- Identifies bug suspects — confirm and implement, don't just advise
