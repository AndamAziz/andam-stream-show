/**
 * Server-only content-override helpers shared by the public Xtream proxy.
 *
 * Admins can hide items, force a sort position, or replace a broken logo; the
 * public API applies those rules before anything reaches a viewer.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export type OverrideKind = 'live' | 'vod' | 'series' | 'category';

export type OverrideRule = {
  hidden: boolean;
  sort_order: number | null;
  logo_url: string | null;
};

export type OverrideMap = Map<string, OverrideRule>;

export async function loadOverrides(sourceId: string, kind: OverrideKind): Promise<OverrideMap> {
  const { data, error } = await supabaseAdmin
    .from('content_overrides')
    .select('item_id, hidden, sort_order, logo_url')
    .eq('source_id', sourceId)
    .eq('kind', kind);
  if (error) {
    console.error('[overrides]', error.message);
    return new Map();
  }
  const map: OverrideMap = new Map();
  for (const row of data ?? []) {
    map.set(String(row.item_id), {
      hidden: Boolean(row.hidden),
      sort_order: row.sort_order,
      logo_url: row.logo_url,
    });
  }
  return map;
}

/** Drops hidden entries, applies logo overrides and admin ordering. */
export function applyOverrides<T extends { id: string; num?: number }>(
  items: T[],
  overrides: OverrideMap,
  logoKey?: 'logo' | 'poster',
): T[] {
  const out = items
    .filter((item) => !overrides.get(item.id)?.hidden)
    .map((item, index) => {
      const rule = overrides.get(item.id);
      const next = { ...item } as T & Record<string, unknown>;
      if (rule?.logo_url && logoKey) next[logoKey] = rule.logo_url;
      const order = rule?.sort_order;
      next['__order'] = order ?? (typeof item.num === 'number' ? item.num : index + 1);
      return next;
    });

  out.sort((a, b) => Number(a['__order']) - Number(b['__order']));
  return out.map((item, index) => {
    const { __order, ...rest } = item as Record<string, unknown>;
    void __order;
    const clean = rest as T;
    if (typeof (clean as { num?: number }).num === 'number') {
      (clean as { num: number }).num = index + 1;
    }
    return clean;
  });
}

/** Records a playback failure for the monitoring dashboard. */
export async function logPlaybackError(entry: {
  sourceId?: string | null;
  userId?: string | null;
  kind?: string | null;
  itemId?: string | null;
  status?: number | null;
  message?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('playback_errors').insert({
    source_id: entry.sourceId ?? null,
    user_id: entry.userId ?? null,
    kind: entry.kind ?? null,
    item_id: entry.itemId ?? null,
    status: entry.status ?? null,
    message: (entry.message ?? '').slice(0, 500) || null,
  });
  if (error) console.error('[playback_errors]', error.message);
}
