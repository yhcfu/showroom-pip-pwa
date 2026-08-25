# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-08-26
- Primary product surfaces: `/app/` launcher and history, `/player/` video player
- Evidence reviewed: `README.md`, `app/index.html`, `player/index.html`, `src/main.ts`, `src/player.ts`, `src/style.css`, platform setup documents

## Brand

- Personality: quiet, direct, personal utility
- Trust signals: state that video is not proxied or stored; keep platform limitations visible only where they affect the next action
- Avoid: developer terminology in the primary flow, decorative dashboards, repeated explanations, fake one-click claims

## Product goals

- Goals: get a known SHOWROOM room into PiP with the fewest repeat actions; make the one-time setup unmistakable; preserve compact local history
- Non-goals: comments, gifts, recording, paid streams, background notifications, account integration
- Success signals: a first-time PC user can install the bookmarklet without editing its URL; a returning user can start from history; the primary screen fits without explanatory cards competing for attention

## Personas and jobs

- Primary personas: a single owner using Chrome/Edge on PC, Safari on iPhone, or Chrome on Android
- User jobs: prepare the platform once; open a live room; enter PiP; reopen a recent room
- Key contexts of use: personal device, one-handed mobile use, desktop browser with bookmark bar

## Information architecture

- Primary navigation: no global navigation
- Core routes/screens: launcher at `/app/`; player at `/player/`
- Content hierarchy: current platform instruction, one-time setup, room input, recent rooms, optional advanced HLS input

## Design principles

- Show only the next action: platform-specific setup and labels replace generic architecture explanations
- Pay setup cost once: PC uses drag-to-bookmark-bar; copy/edit is a fallback, not the primary route
- Keep the launcher available: on desktop, open SHOWROOM in a second tab and reuse that tab for Player
- Tradeoffs: the static version still requires a bookmarklet on PC/Android and a Shortcut on iOS because the PWA cannot read SHOWROOM APIs cross-origin

## Visual language

- Color: near-black surface, muted gray copy, purple only for the primary action
- Typography: system sans-serif, compact labels, one clear page title
- Spacing/layout rhythm: 8px base rhythm; one main card; dividers instead of nested cards
- Shape/radius/elevation: 12–18px radii; minimal shadow; no glass panels for ordinary sections
- Motion: only native navigation and optional smooth scroll; no decorative animation
- Imagery/iconography: existing PiP icon; no illustrative assets

## Components

- Existing components to reuse: room form, history rows, install guide, player controls
- New/changed components: draggable desktop bookmarklet, compact numbered setup row, copy fallback
- Variants and states: iOS Shortcut, Android copy setup, desktop drag setup; setup complete is user-managed because bookmark installation cannot be detected
- Token/component ownership: `src/style.css` owns the small local visual system

## Accessibility

- Target standard: practical WCAG 2.2 AA
- Keyboard/focus behavior: all actions remain links, buttons, or inputs; visible focus styles; draggable bookmarklet also works as a focusable link
- Contrast/readability: primary and muted text retain readable contrast on dark surfaces
- Screen-reader semantics: section headings, visible numbered steps, live status, explicit labels
- Reduced motion and sensory considerations: no essential motion or color-only status

## Responsive behavior

- Supported breakpoints/devices: desktop Chrome/Edge, Android Chrome, current iPhone Safari/PWA
- Layout adaptations: desktop input and action share a row; mobile stacks them; platform setup is mutually exclusive
- Touch/hover differences: drag instruction appears only on desktop; mobile receives tap/copy instructions

## Interaction states

- Loading: Player reports HLS loading and keeps PiP disabled until metadata exists
- Empty: history says that no rooms have been opened
- Error: invalid room, clipboard failure, and HLS failure appear in the live status
- Success: bookmarklet copy and Player readiness use short outcome text
- Disabled: PiP remains disabled until supported and ready
- Offline/slow network: cached launcher may open; SHOWROOM resolution and playback require network

## Content voice

- Tone: short Japanese instructions written as actions
- Terminology: user-facing copy says `SHOWROOM`, `ブックマークバー`, `PiP`; hide `HLS`, `CORS`, `scope`, and `roomId` outside advanced/help content
- Microcopy rules: one sentence per action; say “初回だけ” for setup; say exactly where the next click happens

## Implementation constraints

- Framework/styling system: Vite, TypeScript, plain HTML/CSS
- Design-token constraints: extend current local colors and radii; do not add a component library
- Performance constraints: no new runtime dependency; bookmarklet remains generated locally
- Compatibility constraints: GitHub Pages only; API resolution stays inside Apple Shortcuts or the SHOWROOM-origin bookmarklet
- Test/screenshot expectations: unit-test generated bookmarklet behavior; verify desktop and mobile DOM plus public Pages build

## Open questions

- [ ] Replace the manually created iOS Shortcut with a distributable Shortcut link when a trusted publishing route is available / owner / iPhone first-run cost
- [ ] Confirm bookmarklet installation and PiP on a physical Android device / owner / mobile acceptance
