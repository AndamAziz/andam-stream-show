/**
 * Server-only helpers for the admin-managed "featured priority" list.
 *
 * The homepage hero and "Live now" row lead with well-known channel brands
 * (beIN Sports, National Geographic, …). Admins edit the patterns from the
 * Content section, so nothing is hardcoded in the UI.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export type FeaturedRow = { id: string; pattern: string; sort_order: number };

export async function listFeatured(): Promise<FeaturedRow[]> {
  const { data, error } = await supabaseAdmin
    .from('featured_channels')
    .select('id, pattern, sort_order')
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[featured]', error.message);
    return [];
  }
  return (data ?? []) as FeaturedRow[];
}

export async function saveFeatured(pattern: string, sortOrder: number): Promise<void> {
  const value = pattern.trim();
  if (!value) throw new Error('Pattern is required');
  const { error } = await supabaseAdmin
    .from('featured_channels')
    .upsert({ pattern: value, sort_order: sortOrder }, { onConflict: 'pattern' });
  if (error) throw new Error(error.message);
}

export async function removeFeatured(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('featured_channels').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
