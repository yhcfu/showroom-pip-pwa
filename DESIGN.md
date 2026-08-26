# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-08-27
- Primary product surfaces: `/app/` launcher and history, `/player/` video-only player
- Evidence reviewed: `README.md`, `app/index.html`, `player/index.html`, `src/main.ts`, `src/player.ts`, `src/style.css`, platform setup documents

## Brand

- Personality: quiet, direct, personal utility
- Trust signals: state that video is not proxied and that the HLS.js path keeps only a bounded, device-local playback buffer; keep platform limitations visible only where they affect the next action
- Avoid: developer terminology in the primary flow, decorative dashboards, repeated explanations, fake one-click claims

## Product goals

- Goals: reopen a known SHOWROOM room with the fewest repeat actions; show only its video in a responsive player; provide PiP on iPhone and Android; give PC users a setup-free focused player and one-action frame capture
- Non-goals: exported recordings, comments, gifts, paid streams, background notifications, account integration
- Success signals: every device uses the same room form and Player URL without initial playback setup; mobile users can enter PiP from the Player; a returning user can start from history; an HLS.js user can reload within 24 hours and continue from a still-cached position

## Personas and jobs

- Primary personas: a single owner using Chrome/Edge on PC, Safari on iPhone, or Chrome on Android
- User jobs: open a live room; watch the video without SHOWROOM chrome; resize or fullscreen it on PC; save the current video frame; enter PiP on mobile; reopen a recent room
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
- Keep resume local and bounded: persist fetched HLS segments only in browser storage for at most 24 hours, cap them at 1 GiB or a smaller quota-derived budget, and evict oldest data first
- Tradeoffs: all playback depends on a small stateless resolver; iOS Home Screen PiP still relies on `/player/` remaining outside the installed `/app/` scope

## Visual language

- Color: near-black surface, muted gray copy, purple only for the primary action
- Typography: system sans-serif, compact controls, one small product title, no marketing copy
- Spacing/layout rhythm: 8px base rhythm; one compact surface; dividers instead of nested cards
- Shape/radius/elevation: 12–18px radii; minimal shadow; no glass panels for ordinary sections
- Motion: a small loading pulse; on fine-pointer devices, hide the player overlay after 0.9 seconds without input while playback continues, then reveal it immediately on pointer or keyboard activity; honor reduced-motion preferences
- Imagery/iconography: player actions use familiar inline SVG icons with accessible names; desktop pairs icons with short labels, while compact touch layouts show icons only; no illustrative assets or icon-library dependency

## Components

- Existing components to reuse: room form, history rows, collapsed settings, player controls
- New/changed components: pinned history action, clean share-URL action, conditional L/R balance panel, screenshot action, full-viewport video stage, and a button-free cached-resume handoff
- Variants and states: playback stays identical across devices; installation guidance differs by install capability; Web Audio balance is a PC-only enhancement; copy and capture acknowledge success without changing control width, while PiP, fullscreen, and the open L/R panel expose a restrained active state
- Token/component ownership: `src/style.css` owns the small local visual system

## Accessibility

- Target standard: practical WCAG 2.2 AA
- Keyboard/focus behavior: all actions remain links, buttons, or inputs; visible focus styles; keyboard-focused player controls never auto-hide; pointer-focused controls may auto-hide and return on the next pointer movement; any keyboard input reveals the desktop overlay; form submission opens the dedicated player; desktop `S` captures the current video frame unless the user is editing a control
- Contrast/readability: primary and muted text retain readable contrast on dark surfaces
- Screen-reader semantics: concise section headings, visually hidden field labels, `aria-label` and `aria-pressed` on compact actions, live error/loading status
- Reduced motion and sensory considerations: no essential motion or color-only status

## Responsive behavior

- Supported breakpoints/devices: desktop Chrome/Edge, Android Chrome, current iPhone Safari/PWA
- Layout adaptations: the launcher stays compact on narrow screens; the player fills the visual viewport and letterboxes video without cropping; touch devices reserve one compact row for icon-only project controls above the native video surface
- Touch/hover differences: touch devices keep the custom toolbar visible outside the `<video controls>` box so native media controls cannot overlap it or resize the video when tools appear; fine-pointer devices use recent activity and input modality rather than `:hover` or raw focus state to control the overlay

## Interaction states

- Loading: Player reports HLS loading and keeps PiP disabled until metadata exists
- Playback: desktop controls stay visible while paused, buffering, keyboard-focused, or showing the L/R panel; during uninterrupted playback they fade after 0.9 seconds of inactivity and return on pointer or keyboard input; a mouse click must not pin them onscreen
- Cached resume: restore a contiguous cached run at the last saved segment and offset; let the native timeline handle rewind and chase playback; never jump forward merely because playback is near the end; join the current live stream automatically only after the saved timeline actually ends
- Empty: history says that no rooms have been opened
- Error: invalid room, clipboard failure, and HLS failure appear in the live status
- Success: successful playback removes the loading status; copy success is reflected briefly in the control itself; frame capture reports a short save confirmation
- Disabled: PiP remains disabled until supported and ready
- Offline/slow network: cached launcher may open; a saved replay can start locally, but room resolution and reconnection to live require network

## Content voice

- Tone: short Japanese instructions written as actions
- Terminology: user-facing copy says `SHOWROOM`, `プレイヤー`, `全画面`, `PiP`; hide `Shortcut`, `ブックマークレット`, `HLS`, `CORS`, `scope`, and `roomId` outside technical documentation
- Microcopy rules: prefer one- or two-word actions; hide explanatory copy in collapsed settings; never introduce device-specific playback steps unless a verified browser limitation requires them

## Implementation constraints

- Framework/styling system: Vite, TypeScript, plain HTML/CSS
- Design-token constraints: extend current local colors and radii; do not add a component library
- Performance constraints: no new runtime dependency; media never passes through the resolver; segment payloads live separately from metadata so pruning does not load the full cache; create the Web Audio graph only after an explicit L/R interaction
- Compatibility constraints: the PWA stays on GitHub Pages; every HTML surface declares `noindex`; one Vercel Function resolves live metadata and prefers SHOWROOM's fixed original-quality HLS for every platform; `/player/` remains outside the installed `/app/` scope; fine-pointer Chrome/Edge and Android use HLS.js/MSE with a device-local persistent buffer and highest-level lock for master-playlist fallbacks; mobile Safari stays on native HLS without persistent resume or L/R; frame capture requires CORS-clean video; custom and native media controls must use separate boxes on coarse-pointer devices
- Test/screenshot expectations: unit-test history normalization, balance value handling, resolver validation, shared Player routing, persistent-buffer retention/selection/playlist generation, and overlay visibility rules; verify full-viewport desktop and mobile layouts, cached resume and live handoff, idle hiding and input-driven reveal, plus the public Pages build

## Open questions

- [ ] Confirm direct `/app/` → out-of-scope `/player/` navigation and PiP from an installed iPhone Home Screen web app / owner / mobile acceptance
- [ ] Confirm direct Player PiP on a physical Android device / owner / mobile acceptance
- [ ] Confirm HLS playback and fullscreen in current Windows Chrome and Edge / owner / desktop acceptance
- [ ] Confirm L/R balance in current Windows Chrome and Edge / owner / desktop acceptance
