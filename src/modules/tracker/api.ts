import { supabase } from '@/lib/supabase'
import type { AdCount } from './classification'

export interface Offer {
  id: string
  name: string
  link: string
  tags?: string[] | string | null
  category?: string | null
  last_ad_count?: number | null
  last_ad_count_timestamp?: string | null
  oldest_ad_date?: string | null
  days_running?: number | null
  last_scrape_status?: string | null
  is_archived?: boolean | null
}

export interface DiscoveredOffer {
  id: string
  name?: string
  page_name?: string
  link?: string
  ad_count?: number
  days_running?: number
  status?: string
  keyword?: string
}

export interface Keyword {
  id: string
  keyword: string
  active?: boolean
}

function db() {
  const sb = supabase()
  if (!sb) throw new Error('Supabase não conectado')
  return sb
}

export async function getOffers(): Promise<Offer[]> {
  const { data, error } = await db().from('offers').select('*')
  if (error) throw new Error(error.message)
  return (data || []) as Offer[]
}

export async function getAdCounts(offerId: string): Promise<AdCount[]> {
  const { data, error } = await db()
    .from('ad_counts')
    .select('count,timestamp')
    .eq('offer_id', offerId)
    .order('timestamp', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []) as AdCount[]
}

/** Histórico de várias ofertas de uma vez → { offerId: AdCount[] } */
export async function getAllAdCounts(offerIds: string[]): Promise<Record<string, AdCount[]>> {
  if (!offerIds.length) return {}
  const { data, error } = await db()
    .from('ad_counts')
    .select('offer_id,count,timestamp')
    .in('offer_id', offerIds)
    .order('timestamp', { ascending: true })
  if (error) throw new Error(error.message)
  const out: Record<string, AdCount[]> = {}
  ;(data || []).forEach((r: any) => {
    ;(out[r.offer_id] = out[r.offer_id] || []).push({ count: r.count, timestamp: r.timestamp })
  })
  return out
}

/** Adiciona uma contagem manual (ad do dia) e atualiza o snapshot da oferta. */
export async function addAdCount(offerId: string, count: number, timestamp: string) {
  const sb = db()
  const { error } = await sb.from('ad_counts').insert([{ offer_id: offerId, count, timestamp }])
  if (error) throw new Error(error.message)
  await sb.from('offers').update({ last_ad_count: count, last_ad_count_timestamp: timestamp }).eq('id', offerId)
}

/** Dispara o scraper (servidor local na rede ou Railway). Retorna um resumo da resposta. */
export async function runScrape(url: string): Promise<string> {
  const r = await fetch(url, { method: 'POST' }).catch(() => fetch(url)) // tenta POST, cai pra GET
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  try {
    const j = await r.json()
    return typeof j === 'object' ? JSON.stringify(j).slice(0, 160) : String(j)
  } catch {
    return 'ok'
  }
}

export async function addOffer(o: { name: string; link: string; tags?: string[]; category?: string }) {
  const { error } = await db().from('offers').insert([{ name: o.name, link: o.link, tags: o.tags || [], category: o.category || null }])
  if (error) throw new Error(error.message)
}
export async function updateOffer(id: string, patch: Partial<Offer>) {
  const { error } = await db().from('offers').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteOffer(id: string) {
  const { error } = await db().from('offers').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getComments(offerId: string) {
  const { data, error } = await db().from('comments').select('*').eq('offer_id', offerId).order('created_at', { ascending: false })
  if (error) return [] as any[]
  return data || []
}
export async function addComment(offerId: string, text: string) {
  const { error } = await db().from('comments').insert([{ offer_id: offerId, text }])
  if (error) throw new Error(error.message)
}

export async function getDiscoveryKeywords(): Promise<Keyword[]> {
  const { data, error } = await db().from('discovery_keywords').select('*')
  if (error) return []
  return (data || []) as Keyword[]
}
export async function addKeyword(keyword: string) {
  const { error } = await db().from('discovery_keywords').insert([{ keyword, active: true }])
  if (error) throw new Error(error.message)
}
export async function deleteKeyword(id: string) {
  const { error } = await db().from('discovery_keywords').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getDiscoveredOffers(): Promise<DiscoveredOffer[]> {
  const { data, error } = await db().from('discovered_offers').select('*').eq('status', 'pending')
  if (error) return []
  return (data || []) as DiscoveredOffer[]
}
export async function dismissDiscovered(id: string) {
  const { error } = await db().from('discovered_offers').update({ status: 'dismissed' }).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function approveDiscovered(d: DiscoveredOffer) {
  await addOffer({ name: d.name || d.page_name || 'Oferta', link: d.link || '' })
  const { error } = await db().from('discovered_offers').update({ status: 'added' }).eq('id', d.id)
  if (error) throw new Error(error.message)
}
