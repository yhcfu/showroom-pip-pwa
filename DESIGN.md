# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-08-26
- Primary product surfaces: `/app/` launcher and history, `/player/` video-only player
- Evidence reviewed: `README.md`, `app/index.html`, `player/index.html`, `src/main.ts`, `src/player.ts`, `src/style.css`, platform setup documents

## Brand

- Personality: quiet, direct, personal utility
- Trust signals: state that video is not proxied or stored; keep platform limitations visible only where they affect the next action
- Avoid: developer terminology in the primary flow, decorative dashboards, repeated explanations, fake one-click claims

## Product goals

- Goals: reopen a known SHOWROOM room with the fewest repeat actions; show only its video in a responsive player; provide PiP on iPhone and Android; give PC users a setup-free focused player
- Non-goals: comments, gifts, recording, paid streams, background notifications, account integration
- Success signals: every device uses the same room form and Player URL without initial playback setup; mobile users can enter PiP from the Player; a returning user can start from history

## Personas and jobs

- Primary personas: a single owner using Chrome/Edge on PC, Safari on iPhone, or Chrome on Android
- User jobs: open a live room; watch the video without SHOWROOM chrome; resize or fullscreen it on PC; enter PiP on mobile; reopen a recent room
- Key contexts of use: personal device, one-handed mobile use, desktop multitasking on Windows or macOS

## Information architecture

- Primary navigation: no global navigation
- Core routes/screens: launcher at `/app/`; player at `/player/`
- Content hierarchy: title, room input and one primary action, pinned/recent rooms, collapsed settings

## Design principles

- Show only the next action: one room form replaces platform-specific playback setup and instructions
- Design for repeat use: remove explanations that no longer help after the first successful playback; retain accessible names and a compact settings escape hatch
- Use one playback path: every platform opens `/player/?room=...`, which resolves and plays the stream
- Make video the destination: navigation stays on the project's Player, never the decorated SHOWROOM page
- Keep tools contextual: share is available only for a stable room URL, and L/R balance only on a pointer-based PC where the playback pipeline can support Web Audio safely
- Keep infrastructure narrow: the resolver returns live metadata and the public HLS URL; media travels directly from SHOWROOM's CDN to the browser
- Tradeoffs: all playback depends on a small stateless resolver; iOS Home Screen PiP still relies on `/player/` remaining outside the installed `/app/` scope

## Visual language

- Color: near-black surface, muted gray copy, purple only for the primary action
- Typography: system sans-serif, compact controls, one small product title, no marketing copy
- Spacing/layout rhythm: 8px base rhythm; one compact surface; dividers instead of nested cards
- Shape/radius/elevation: 12–18px radii; minimal shadow; no glass panels for ordinary sections
- Motion: a small loading pulse and auto-hiding player overlay; honor reduced-motion preferences
- Imagery/iconography: short text controls and familiar symbols with accessible names; no illustrative assets

## Components

- Existing components to reuse: room form, history rows, collapsed settings, player controls
- New/changed components: pinned history action, clean share-URL action, conditional L/R balance panel, full-viewport video stage
- Variants and states: playback stays identical across devices; installation guidance differs by install capability; Web Audio balance is a PC-only enhancement
- Token/component ownership: `src/style.css` owns the small local visual system

## Accessibility

- Target standard: practical WCAG 2.2 AA
- Keyboard/focus behavior: all actions remain links, buttons, or inputs; visible focus styles; form submission opens the dedicated player
- Contrast/readability: primary and muted text retain readable contrast on dark surfaces
- Screen-reader semantics: concise section headings, visually hidden field labels, `aria-label` and `aria-pressed` on compact actions, live error/loading status
- Reduced motion and sensory considerations: no essential motion or color-only status

## Responsive behavior

- Supported breakpoints/devices: desktop Chrome/Edge, Android Chrome, current iPhone Safari/PWA
- Layout adaptations: the launcher stays compact on narrow screens; the player fills the visual viewport and letterboxes video without cropping; touch devices reserve one compact row for project controls above the native video surface
- Touch/hover differences: touch devices keep the custom toolbar outside the `<video controls>` box so native media controls cannot overlap it; hover-capable devices retain the auto-hiding overlay

## Interaction states

- Loading: Player reports HLS loading and keeps PiP disabled until metadata exists
- Empty: history says that no rooms have been opened
- Error: invalid room, clipboard failure, and HLS failure appear in the live status
- Success: successful playback removes the loading status; copy success is reflected briefly in the control itself
- Disabled: PiP remains disabled until supported and ready
- Offline/slow network: cached launcher may open; SHOWROOM resolution and playback require network

## Content voice

- Tone: short Japanese instructions written as actions
- Terminology: user-facing copy says `SHOWROOM`, `プレイヤー`, `全画面`, `PiP`; hide `Shortcut`, `ブックマークレット`, `HLS`, `CORS`, `scope`, and `roomId` outside technical documentation
- Microcopy rules: prefer one- or two-word actions; hide explanatory copy in collapsed settings; never introduce device-specific playback steps unless a verified browser limitation requires them

## Implementation constraints

- Framework/styling system: Vite, TypeScript, plain HTML/CSS
- Design-token constraints: extend current local colors and radii; do not add a component library
- Performance constraints: no new runtime dependency; media never passes through the resolver; create the Web Audio graph only after an explicit L/R interaction
- Compatibility constraints: the PWA stays on GitHub Pages; one Vercel Function resolves live metadata for every platform; `/player/` remains outside the installed `/app/` scope; fine-pointer Chrome/Edge prefer HLS.js/MSE so L/R remains available even when the OS offers native HLS; mobile and Safari stay on native HLS without L/R; custom and native media controls must use separate boxes on coarse-pointer devices
- Test/screenshot expectations: unit-test history normalization, balance value handling, resolver validation, and shared Player routing; verify full-viewport desktop and mobile layouts plus the public Pages build

## Open questions

- [ ] Confirm direct `/app/` → out-of-scope `/player/` navigation and PiP from an installed iPhone Home Screen web app / owner / mobile acceptance
- [ ] Confirm direct Player PiP on a physical Android device / owner / mobile acceptance
- [ ] Confirm HLS playback and fullscreen in current Windows Chrome and Edge / owner / desktop acceptance
- [ ] Confirm L/R balance in current Windows Chrome and Edge / owner / desktop acceptance
