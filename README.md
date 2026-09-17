# Andam — IPTV & Kurdish Live TV Streaming Platform

Andam is a streaming platform for live TV, movies, and series, focused on Kurdish and Middle-Eastern channels. It aggregates multiple IPTV providers (Xtream Codes panels and M3U playlists) behind a single cinematic interface with a unified player, watch progress, and a full admin panel.

**Live app**: https://andam-stream-show.lovable.app

## What it does

- **Home** — a cinematic landing page with hero carousel, live-now, trending, and continue-watching rows wired to real backend data.
- **Live TV** — multi-provider Xtream Codes support: live channels, movies, series, and replay/catch-up per provider, with per-user provider assignment.
- **IPTV** — a separate section backed by M3U playlists (10k+ channels), with category filtering and logo overrides managed by admins.
- **Movies & Shows** — TMDB-powered catalog (metadata, posters, seasons/episodes) with embedded playback.
- **Player** — auto-detects stream format (HLS, MPEG-TS, progressive MP4) and plays them all in the browser; H.265 content shows a clear device-support message instead of failing silently.
- **Prayer times, Qibla, and Quran** sections in the interface.

## Tech stack

- **Framework**: TanStack Start (React 19) with TanStack Router file-based routing and TanStack Query; Vite for build tooling.
- **Styling**: Tailwind CSS v4 with shadcn/ui-style components.
- **Backend**: Lovable Cloud (Supabase) — Postgres with Row Level Security, Auth (email + Google OAuth), and server functions via `createServerFn` / API routes.
- **Playback**: `hls.js` for HLS, `mpegts.js` for MPEG-TS live streams, native video for progressive formats; VidAPI iframe embedding for TMDB catalog playback.
- **Streaming proxy**: all provider traffic (API calls and stream segments) is relayed server-side through a proxy so provider credentials and stream URLs never reach the browser. The frontend receives opaque, single-use sealed tokens only.

## Key features

- **Admin panel** (`/admin`, CEO role only) — full control over providers, users, activation codes, content overrides, and monitoring.
- **Provider management** — add/refresh Xtream and M3U sources, fix broken channel metadata, control which providers each user sees.
- **Multi-format auto-detection player** — probes each stream, picks the right playback engine, follows provider redirects, and applies per-source content-type fixes.
- **Activation codes** — new users get IPTV by default; other sections unlock with admin-issued codes (single/multi-use, tied to providers and expiry dates). Expired or revoked codes immediately revert a user to default access.
- **Per-user provider assignment** — admins control exactly which providers each account can access.
- **Watch progress** — server-synced (database) for catalog content, shared across devices.

## Project structure

```
public/andam.html          # Streaming homepage (self-contained frontend served in an iframe)
src/routes/                # File-based routes (pages + /api/public/* endpoints)
src/routes/_authenticated/ # Auth-gated pages (account, admin panel)
src/lib/                   # Server logic: xtream.ts, m3u.server.ts, access.server.ts, admin-ops.server.ts
src/integrations/supabase/ # Generated Supabase clients (do not edit)
supabase/migrations/       # Database schema and policies
```

## Development

Requires Node.js (with npm) and a configured Lovable Cloud backend.

```sh
git clone <this-repository-url>
cd andam-stream-show
npm i
npm run dev        # start the dev server
npm run build      # production build
npm run lint       # eslint
```

The app is designed to be developed through [Lovable](https://lovable.dev) — describe changes in the editor and they sync straight to this repository.

## Live app

Continue building this project in the [Lovable editor](https://lovable.dev/projects/95d85232-db75-4159-ac2f-6879afabb373) or visit **https://andam-stream-show.lovable.app**.
