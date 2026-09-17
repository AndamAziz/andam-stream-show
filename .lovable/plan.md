# Bulk stream audit tool (admin only)

A new admin-only page that probes a sample of IPTV channels automatically and reports
what each one really is (playlist, raw stream, error page) plus the video codec for raw
streams. Read-only: no playback behaviour changes for regular viewers.

## What you get

New page **Stream audit** in the admin panel (`/admin/stream-audit`, hidden from regular users):

- Pick the playlist source and sample size (100 / 250 / 500 / all), plus first-N or random sample.
- "Run audit" button with a progress bar (X of N probed) and a stop button.
- Summary cards: counts and % by detected type — HLS, MPEG-TS, FLV, DASH, bad (error page), timeout/error.
- Codec breakdown for MPEG-TS channels: H.264/AVC, H.265/HEVC, audio-only (no video track), unknown/timeout.
- Full table: channel name, group, detected type, codec, resolution, pass/fail, error message.
  Sortable by column, filterable by type/codec/text search.
- Export buttons: CSV and JSON.

## How the probing works

1. Load the channel list for the chosen source, take the sample.
2. Fetch playback tokens for the sample in bulk.
3. For each channel, run the **existing** `sniffStream()` byte-probe against
   `/api/public/xtream-play?t=…` to classify the type.
4. Channels classified as MPEG-TS get a second short probe: a hidden off-screen `<video>`
   plus mpegts.js, waiting up to 3s for the codec info event, then torn down immediately.
5. Concurrency capped at 6 in flight (configurable 3–10) so neither the browser nor the
   relay is flooded. Each channel is hard-capped in time so one dead channel can't stall the run.

## Technical notes

- `sniffStream`/`classifyHead`/`hexOf` move out of the inline script in `public/andam.html`
  into a new shared `public/stream-sniff.js` (exposed as `window.AndamSniff`), loaded by
  `andam.html` via a `<script src>` tag. Logic is unchanged and reused by the audit page —
  not duplicated. `probeKind` and all engine/mount code stay where they are.
- New route `src/routes/_authenticated/admin/stream-audit.tsx` under the existing admin
  gate (role re-checked server-side); added to `AdminShell` nav.
- Probe runner lives in `src/lib/stream-audit.ts` (client-only): loads `/stream-sniff.js`
  and `/vendor/mpegts.js` on demand, runs the worker pool, emits progress.
- `src/routes/api/public/iptv.ts` gains one additive action, `action=tokens&ids=…`
  (batched sealed tokens, capped at 500 ids), so 500 channels don't need 500 list rebuilds.
  Existing `sources`/`channels`/`play` actions untouched.
- No changes to `stream-proxy.server.ts`, `m3u.server.ts`, Live TV, Movies or Shows.
