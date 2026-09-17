/**
 * Client-only bulk stream audit runner for the admin diagnostic page.
 *
 * Read-only: it reuses the player's own sniffer (`/stream-sniff.js`) and
 * mpegts.js codec reporting to classify channels, and never changes playback
 * behaviour for viewers.
 */

export type AuditKind = 'hls' | 'mpegts' | 'flv' | 'dash' | 'file' | 'bad' | 'error';

export type AuditRow = {
  id: string;
  num: number;
  name: string;
  group: string;
  kindOf: AuditKind;
  status: number | null;
  contentType: string;
  first16: string;
  videoCodec: string;
  audioCodec: string;
  resolution: string;
  ok: boolean;
  error: string;
};

type SniffResult = {
  ok: boolean;
  status: number;
  ct: string;
  kindOf: AuditKind;
  first16?: string;
  text?: string;
};

type Sniffer = {
  sniffStream: (src: string, opts?: { timeout?: number; quiet?: boolean }) => Promise<SniffResult>;
};

type ChannelMeta = { id: string; num: number; name: string; group: string };

const IPTV_API = '/api/public/iptv';

function loadScript(src: string, globalKey: string): Promise<unknown> {
  const w = window as unknown as Record<string, unknown>;
  if (w[globalKey]) return Promise.resolve(w[globalKey]);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const el = existing ?? document.createElement('script');
    el.addEventListener('load', () => resolve(w[globalKey]));
    el.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
    if (!existing) {
      el.src = src;
      document.head.appendChild(el);
    }
  });
}

async function api<T>(path: string, token: string | null): Promise<T> {
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok || body.error) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export async function listAuditSources(token: string | null) {
  const data = await api<{ sources: { id: string; name: string }[] }>(
    `${IPTV_API}?action=sources`,
    token,
  );
  return data.sources;
}

async function listChannels(source: string, token: string | null): Promise<ChannelMeta[]> {
  const data = await api<{ channels: ChannelMeta[] }>(
    `${IPTV_API}?action=channels&source=${encodeURIComponent(source)}`,
    token,
  );
  return data.channels;
}

async function fetchTokens(
  source: string,
  ids: string[],
  token: string | null,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const data = await api<{ tokens: { id: string; token: string }[] }>(
      `${IPTV_API}?action=tokens&source=${encodeURIComponent(source)}&ids=${slice
        .map(encodeURIComponent)
        .join(',')}`,
      token,
    );
    for (const t of data.tokens) out.set(t.id, t.token);
  }
  return out;
}

/**
 * Short-lived offscreen mpegts.js probe: attaches to a hidden <video>, waits
 * for the MEDIA_INFO event (up to `waitMs`), then tears everything down.
 */
function probeCodec(
  url: string,
  waitMs: number,
): Promise<{ videoCodec: string; audioCodec: string; resolution: string; error: string }> {
  return loadScript('/vendor/mpegts.js', 'mpegts').then((loaded) => {
    const mp = loaded as {
      createPlayer: (a: unknown, b: unknown) => Record<string, (...args: unknown[]) => void> & {
        on: (ev: string, cb: (...args: unknown[]) => void) => void;
        attachMediaElement: (v: HTMLVideoElement) => void;
        load: () => void;
        play: () => Promise<void> | void;
        destroy: () => void;
        unload?: () => void;
        detachMediaElement?: () => void;
      };
      Events: Record<string, string>;
      isSupported?: () => boolean;
    };
    return new Promise<{
      videoCodec: string;
      audioCodec: string;
      resolution: string;
      error: string;
    }>((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.style.position = 'fixed';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      video.style.left = '-9999px';
      document.body.appendChild(video);

      let done = false;
      let player: ReturnType<typeof mp.createPlayer> | null = null;
      const finish = (r: {
        videoCodec: string;
        audioCodec: string;
        resolution: string;
        error: string;
      }) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          player?.unload?.();
          player?.detachMediaElement?.();
          player?.destroy();
        } catch {
          /* teardown is best-effort */
        }
        try {
          video.removeAttribute('src');
          video.remove();
        } catch {
          /* already gone */
        }
        resolve(r);
      };
      const timer = setTimeout(
        () => finish({ videoCodec: '', audioCodec: '', resolution: '', error: 'codec timeout' }),
        waitMs,
      );

      try {
        player = mp.createPlayer(
          { type: 'mpegts', isLive: true, url },
          {
            enableWorker: false,
            enableStashBuffer: true,
            stashInitialSize: 1024 * 128,
            liveBufferLatencyChasing: true,
            lazyLoad: false,
            fixAudioTimestampGap: true,
            reuseRedirectedURL: true,
          },
        );
        player.on(mp.Events['MEDIA_INFO'] ?? 'media_info', (...args: unknown[]) => {
          const info = (args[0] ?? {}) as {
            videoCodec?: string;
            audioCodec?: string;
            width?: number;
            height?: number;
          };
          finish({
            videoCodec: info.videoCodec ?? '',
            audioCodec: info.audioCodec ?? '',
            resolution: info.width && info.height ? `${info.width}x${info.height}` : '',
            error: '',
          });
        });
        player.on(mp.Events['ERROR'] ?? 'error', (...args: unknown[]) => {
          finish({
            videoCodec: '',
            audioCodec: '',
            resolution: '',
            error: `mpegts ${String(args[0] ?? 'error')}`,
          });
        });
        player.attachMediaElement(video);
        player.load();
        void player.play();
      } catch (e) {
        finish({
          videoCodec: '',
          audioCodec: '',
          resolution: '',
          error: e instanceof Error ? e.message : 'probe failed',
        });
      }
    });
  });
}

export function codecGroup(row: AuditRow): string {
  const c = `${row.videoCodec}`.toLowerCase();
  if (/hevc|h\.?265|hvc1|hev1/.test(c)) return 'H.265 / HEVC';
  if (/avc|h\.?264/.test(c)) return 'H.264 / AVC';
  if (!row.videoCodec && row.audioCodec) return 'audio-only (no video)';
  if (!row.videoCodec) return row.error.includes('timeout') ? 'unknown (timeout)' : 'unknown';
  return row.videoCodec;
}

export type AuditOptions = {
  source: string;
  sampleSize: number;
  random: boolean;
  concurrency: number;
  probeCodecs: boolean;
  authToken: string | null;
  onProgress: (done: number, total: number) => void;
  onRow: (row: AuditRow) => void;
  shouldStop: () => boolean;
};

export async function runStreamAudit(opts: AuditOptions): Promise<AuditRow[]> {
  const sniff = (await loadScript('/stream-sniff.js', 'AndamSniff')) as Sniffer;
  const all = await listChannels(opts.source, opts.authToken);

  let sample = all;
  if (opts.sampleSize > 0 && opts.sampleSize < all.length) {
    if (opts.random) {
      const copy = [...all];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j] as ChannelMeta, copy[i] as ChannelMeta];
      }
      sample = copy.slice(0, opts.sampleSize);
    } else {
      sample = all.slice(0, opts.sampleSize);
    }
  }

  const tokens = await fetchTokens(
    opts.source,
    sample.map((c) => c.id),
    opts.authToken,
  );

  const rows: AuditRow[] = [];
  let done = 0;
  let cursor = 0;
  opts.onProgress(0, sample.length);

  async function probeOne(channel: ChannelMeta): Promise<AuditRow> {
    const row: AuditRow = {
      id: channel.id,
      num: channel.num,
      name: channel.name,
      group: channel.group,
      kindOf: 'error',
      status: null,
      contentType: '',
      first16: '',
      videoCodec: '',
      audioCodec: '',
      resolution: '',
      ok: false,
      error: '',
    };
    const tok = tokens.get(channel.id);
    if (!tok) {
      row.error = 'no playback token';
      return row;
    }
    const src = `/api/public/xtream-play?t=${encodeURIComponent(tok)}`;
    try {
      const p = await sniff.sniffStream(src, { timeout: 7000, quiet: true });
      row.status = p.status;
      row.contentType = p.ct;
      row.first16 = p.first16 ?? '';
      row.kindOf = p.kindOf;
      if (!p.ok) {
        row.error = `HTTP ${p.status}`;
        return row;
      }
      if (p.kindOf === 'bad') {
        row.error = (p.text ?? 'error page').slice(0, 160).replace(/\s+/g, ' ');
        return row;
      }
      row.ok = p.kindOf === 'hls' || p.kindOf === 'mpegts' || p.kindOf === 'flv' || p.kindOf === 'dash' || p.kindOf === 'file';
      if (opts.probeCodecs && p.kindOf === 'mpegts') {
        const codec = await probeCodec(window.location.origin + src, 3000);
        row.videoCodec = codec.videoCodec;
        row.audioCodec = codec.audioCodec;
        row.resolution = codec.resolution;
        if (codec.error) row.error = codec.error;
        if (!codec.videoCodec && codec.audioCodec) row.ok = false;
      }
      return row;
    } catch (e) {
      row.kindOf = 'error';
      const msg = e instanceof Error ? e.message : 'probe failed';
      row.error = /abort/i.test(msg) ? 'timeout' : msg;
      return row;
    }
  }

  async function worker() {
    for (;;) {
      if (opts.shouldStop()) return;
      const index = cursor++;
      const channel = sample[index];
      if (!channel) return;
      const row = await probeOne(channel);
      rows.push(row);
      opts.onRow(row);
      opts.onProgress(++done, sample.length);
    }
  }

  const lanes = Math.max(1, Math.min(10, opts.concurrency));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return rows;
}

export function rowsToCsv(rows: AuditRow[]): string {
  const head = [
    'num',
    'name',
    'group',
    'kind',
    'status',
    'content_type',
    'first16',
    'video_codec',
    'audio_codec',
    'resolution',
    'result',
    'error',
  ];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.num,
      r.name,
      r.group,
      r.kindOf,
      r.status ?? '',
      r.contentType,
      r.first16,
      r.videoCodec,
      r.audioCodec,
      r.resolution,
      r.ok ? 'pass' : 'fail',
      r.error,
    ]
      .map(esc)
      .join(','),
  );
  return [head.join(','), ...lines].join('\n');
}

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
