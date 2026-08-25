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
- Success signals: a PC user can move from a room URL to the local video-only player without setup; an iPhone user can import a ready-made Shortcut; an Android user can reach PiP after one-time bookmarklet setup; a returning user can start from history

## Personas and jobs

- Primary personas: a single owner using Chrome/Edge on PC, Safari on iPhone, or Chrome on Android
- User jobs: open a live room; watch the video without SHOWROOM chrome; resize or fullscreen it on PC; enter PiP on mobile; reopen a recent room
- Key contexts of use: personal device, one-handed mobile use, desktop multitasking on Windows or macOS

## Information architecture

- Primary navigation: no global navigation
- Core routes/screens: launcher at `/app/`; player at `/player/`
- Content hierarchy: platform-specific note, mobile-only setup when required, room input and one primary action, recent rooms

## Design principles

- Show only the next action: platform-specific setup and labels replace generic architecture explanations
- Pay setup cost only where necessary: iPhone imports a signed Shortcut and Android saves a bookmarklet; PC has no setup
- Make video the destination: desktop navigation stays in the PWA and opens `/player/`, never the decorated SHOWROOM page
- Keep infrastructure narrow: the resolver returns live metadata and the public HLS URL; media travels directly from SHOWROOM's CDN to the browser
- Tradeoffs: PC playback depends on a small stateless resolver; iPhone and Android retain their existing platform handoffs for PiP

## Visual language

- Color: near-black surface, muted gray copy, purple only for the primary action
- Typography: system sans-serif, compact labels, one clear page title
- Spacing/layout rhythm: 8px base rhythm; one main card; dividers instead of nested cards
- Shape/radius/elevation: 12–18px radii; minimal shadow; no glass panels for ordinary sections
- Motion: a small loading pulse and auto-hiding player overlay; honor reduced-motion preferences
- Imagery/iconography: existing PiP icon; no illustrative assets

## Components

- Existing components to reuse: room form, history rows, install guide, player controls
- New/changed components: desktop `プレイヤーで見る` action, full-viewport video stage, minimal overlay, stateless HLS resolver, signed iPhone Shortcut installer, Android bookmarklet copy setup
- Variants and states: iOS Shortcut, Android bookmarklet, desktop setup-free launcher; mobile setup completion remains user-managed
- Token/component ownership: `src/style.css` owns the small local visual system

## Accessibility

- Target standard: practical WCAG 2.2 AA
- Keyboard/focus behavior: all actions remain links, buttons, or inputs; visible focus styles; form submission opens the dedicated player
- Contrast/readability: primary and muted text retain readable contrast on dark surfaces
- Screen-reader semantics: section headings, visible numbered steps, live status, explicit labels
- Reduced motion and sensory considerations: no essential motion or color-only status

## Responsive behavior

- Supported breakpoints/devices: desktop Chrome/Edge, Android Chrome, current iPhone Safari/PWA
- Layout adaptations: the launcher stacks on narrow screens; the player always fills the visual viewport and letterboxes video without cropping
- Touch/hover differences: the overlay remains available on touch devices and auto-hides while playing on hover-capable devices

## Interaction states

- Loading: Player reports HLS loading and keeps PiP disabled until metadata exists
- Empty: history says that no rooms have been opened
- Error: invalid room, clipboard failure, and HLS failure appear in the live status
- Success: Android bookmarklet copy, desktop Player navigation, and Player readiness use short outcome text
- Disabled: PiP remains disabled until supported and ready
- Offline/slow network: cached launcher may open; SHOWROOM resolution and playback require network

## Content voice

- Tone: short Japanese instructions written as actions
- Terminology: user-facing copy says `SHOWROOM`, `プレイヤー`, `全画面`, `PiP`; `ブックマーク` appears only on Android; hide `HLS`, `CORS`, `scope`, and `roomId` outside help content
- Microcopy rules: one sentence per action; say “初回だけ” for setup; say exactly where the next click happens

## Implementation constraints

- Framework/styling system: Vite, TypeScript, plain HTML/CSS
- Design-token constraints: extend current local colors and radii; do not add a component library
- Performance constraints: no new runtime dependency; the Android bookmarklet remains generated locally
- Compatibility constraints: the PWA stays on GitHub Pages; a Vercel Function resolves only live metadata for the desktop player; mobile API resolution stays inside the signed Apple Shortcut or the SHOWROOM-origin bookmarklet
- The installed iOS Shortcut name is `SHOWROOM-PiP`, derived from the distributed filename; the launcher must use that exact name
- Test/screenshot expectations: unit-test resolver validation, dedicated-player routing, and generated bookmarklet behavior; verify full-viewport desktop and mobile layouts plus the public Pages build

## Open questions

- [ ] If direct signed-file import proves unreliable on current iOS, publish the same reviewed Shortcut through an iCloud share link / owner / iPhone first-run cost
- [ ] Confirm bookmarklet installation and PiP on a physical Android device / owner / mobile acceptance
- [ ] Deploy and own a stable free-tier resolver URL, then set the GitHub repository `RESOLVER_URL` variable / owner / deployment
- [ ] Confirm HLS playback and fullscreen in current Windows Chrome and Edge / owner / desktop acceptance
