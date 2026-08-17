# Andam Streamer Hub

Build



ROLE

You are a senior frontend designer-engineer. Build a single self-contained HTML file

(inline CSS + JS, no build step, no external framework) for a streaming-app homepage

called "Andam" Match every spec below exactly — colors, type, layout, copy, and

interaction. Do not simplify or substitute your own defaults.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DESIGN TOKENS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Colors (CSS variables):

  --void: #08090C        (page background, true cinematic black)

  --surface: #141419      (card background)

  --surface-2: #1D1E24

  --hair: rgba(255,255,255,0.09)   (hairline borders)

  --ember: #FF3B4E         (primary accent — live badges, brand mark, primary CTAs)

  --ember-dim: rgba(255,59,78,0.16)

  --gold: #F5C56B          (ratings, premium meta text)

  --teal: #38E1C6          (secondary accent — "new" tags, Quran icon)

  --teal-dim: rgba(56,225,198,0.16)

  --lavender: #B79CFF      (Prayer Times / Qibla accent, avatar gradient)

  --lavender-dim: rgba(183,156,255,0.14)

  --text: #F6F6F8

  --muted: #9A9CA6

  --faint: #5E6068



Typography (Google Fonts):

  Display / headings: 'Space Grotesk', weights 500/600/700

  Body: 'Inter', weights 400/500/600/700

  Numeric / mono (badges, timestamps, chips): 'IBM Plex Mono'



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PAGE STRUCTURE (top to bottom)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━



1. FIXED TOP NAV (z-index 50, transparent → solid on scroll >40px, backdrop-blur 10px

   when solid, background rgba(8,9,12,0.88))

   - Left: 30x30px rounded-square brand mark "H" (gradient ember→#C4243A) + wordmark "Andam"

   - Nav links: Home (active) · Live TV · Movies · Shows · IPTV · Prayer & Qibla

   - Right: date chip "15 Aug · GB" (mono font, pill), search icon button, bell icon

     button, 32x32 rounded-square avatar (gradient lavender→#6C7BFF, initials "FZ")

   - Nav links hide below 900px width



2. HERO (86vh, min-height 560px)

   - Full-bleed background photo, object-fit cover, slow Ken Burns zoom animation

     (scale 1.0→1.08 over 26s, ease-in-out, alternate, infinite; disable under

     prefers-reduced-motion)

   - Dark gradient overlay: linear-gradient bottom-to-transparent (into --void) AND

     left-to-transparent (rgba(8,9,12,0.92) → transparent) so nav and text stay readable

   - Content bottom-left, max-width 640px:

     · Pill badge "● LIVE NOW" — ember text on ember-dim bg, pulsing dot (1.4s pulse:

       opacity 1→0.35, scale 1→0.7)

     · H1: "Real Madrid vs Man City" — Space Grotesk 700, clamp(34px, 5.4vw, 58px)

     · Meta row: "Champions League · Semi-Final, 2nd Leg" (gold) · match clock "62'"

       (ticks up +1 every 15s via setInterval, caps at 90) · "1–1" · "Full HD"

       — separated by 3px dot dividers

     · "Watching now" row: 3 overlapping 18px avatar circles (teal gradient, -6px

       overlap, border matches void) + mono text "2.1M watching now"

     · One-sentence description, muted color #C7C8D1, max-width 520px

     · Buttons: solid white "▶ Watch now" (primary) · translucent glass "ⓘ More info"

       · circular "+" icon-only button (add to list)

   - Bottom-right: 4 carousel dot indicators (22x3px pills, ember when active, clickable)



3. CONTENT ROWS (pulled up -64px over the hero to overlap, padding-bottom 70px)

   Each row: heading (Space Grotesk 600, 18px) + "See all" link, then a horizontal

   scroll strip (flex, gap 14px, hidden scrollbar, side padding 40px matching nav).



   Row order and exact content:



   a) "Live now" — 6 landscape cards (250×141px): Man City vs Real Madrid (62'),

      PGA Tour Final Round, Erbil FC vs Duhok SC, World Snooker Final, BBC News Live,

      Al Jazeera English. All carry a red pulsing "LIVE" tag top-left.



   b) "Continue watching" — 5 cards with a 3px progress bar along the bottom edge

      (ember fill, width = % complete): Nightfall Protocol S2E4 (64%), The Last

      Caravan (38%), Echoes of Erbil S1E8 (88%), Glass Horizon (20%), Desert Static

      S3E2 (50%). Subtext format: "S{season} · Ep {n} · {mins} min left" or

      "Movie · {time} left".



   c) "Trending movies" — 6 cards with gold "★ rating" badge top-right, teal "NEW"

      tag top-left where applicable: Neon Heist (NEW, 8.4), Glass Horizon (7.9),

      The Last Caravan (8.1), Salt & Silence (NEW, 7.6), Ember Road (8.7),

      Midnight in Sulav (7.3). Subtext: "{Genre} · {runtime}".



   d) "Popular shows" — 5 cards, same rating badge style: Nightfall Protocol (8.9),

      Echoes of Erbil (NEW, 8.2), Desert Static (7.8), House of Zagros (8.5),

      Border Signal (7.7). Subtext: "{Genre} · {n} season(s)".



   e) "Your IPTV channels" — 8 square 108×108px tiles (not landscape cards): NRT,

      Kurdsat, Rudaw, KurdMax, BBC, Al Araby, beIN 1, MBC. Each shows a 38×38px

      rounded-square 2-letter mark in a unique gradient (no real logos/trademarks —

      text marks only) + channel name below.



   f) "Also on Andam" — 2 cards (250×141px) with a real background photo and a dark

      scrim overlay instead of a poster crop: "Prayer Times & Qibla" (lavender icon,

      "Maghrib in 1h 42m · Erbil") and "The Holy Quran" (teal icon, "Continue Surah

      Al-Kahf").



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CARD BEHAVIOR

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Landscape poster cards: 250×141px, 12px border radius, 1px hairline border,

  background image object-fit:cover, bottom gradient scrim (black 86%→5% opacity)

  for text legibility, title (Space Grotesk 600, 13.5px) + subtext (11px, #D7D8E0)

  pinned bottom-left with 11-12px padding.

- Hover: scale(1.07) translateY(-4px), elevate z-index, large soft drop shadow,

  background image scales to 1.06 inside its frame (clipped), 0.25s ease transition.

- All images: use a single-hop reliable placeholder photo service seeded per-card

  (e.g. https://picsum.photos/seed/{unique-id}/500/282) so every card is a distinct,

  reliably-loading real photograph — not a gradient/illustration placeholder, and not

  real copyrighted poster art.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INTERACTIONS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Nav background fades to solid+blur once window.scrollY > 40.

- Live match clock increments every 15 seconds.

- Hero carousel dots are clickable and toggle .active state.

- Rows scroll horizontally via native overflow-x (touch/trackpad), no custom

  scrollbar visible.

- Respect prefers-reduced-motion: disable the hero zoom, pulse, and card-hover

  transitions.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONSTRAINTS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Single HTML file, inline <style> and <script>, no build tooling.

- No real branded logos, no real movie/show titles that are actual copyrighted

  properties — all titles above are fictional, keep them that way.

- Mobile: hero content padding drops to 20px, carousel dots hide, nav links collapse

  below 900px, categor

y grid/rows remain horizontally scrollable.

- Keyboard focus states must be visible (outline: 2px solid var(--ember)).@Create image



https://relay.andam.uk:8443/proxy?url=

X-Relay-Token: 009c95e9a8c6e50d992b8313bb90b01948b4a58e870bd69504a640b32306a5da





http://myrestreamer.com:8080/player_api.php?username=162360837276&password=6a69c61558b80



https://myrestreamer.com:2087/player_api.php?username=162360837276&password=6a69c61558b80



https://raw.githubusercontent.com/AndamAziz/Andamiptv/refs/heads/main/playlist.m3u

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://andam-stream-show.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/95d85232-db75-4159-ac2f-6879afabb373).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
