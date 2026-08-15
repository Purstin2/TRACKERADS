/**
 * Taxas & Custos — configuração POR PRODUTO (Kirvano), por conta de anúncio e padrão.
 *
 * Fonte de identidade do produto: o webhook da Kirvano manda `products[]` com
 * { id, name, price, is_order_bump }. O ID é estável (o nome pode mudar), então a
 * config é chaveada pelo ID quando existe; produtos antigos sem ID casam por nome.
 *
 * Resolução de taxas de uma venda: produto principal do pedido → config do produto;
 * sem config → itens padrão (global). Contas de anúncio têm um conjunto próprio
 * usado nas ESTIMATIVAS do Monitor (onde não há pedido real pra casar produto).
 */
import { cacheGet, cacheSet, remoteSet, loadState } from '@/lib/appState'
import type { KirvanoOrder } from '@/modules/pixel/orders'

export type TaxCat = 'taxa' | 'imposto' | 'custo'
export type TaxKind = 'pct' | 'fixo'

export interface TaxItem {
  id: string
  label: string
  kind: TaxKind // pct = % sobre o faturamento · fixo = R$ por venda
  value: number
  cat: TaxCat
}

export interface ProductFees {
  key: string // id Kirvano (ou "n:<nome>" quando o pedido não trouxe id)
  ids: string[] // ids conhecidos desse produto
  names: string[] // nomes já vistos (o nome pode mudar; o id não)
  label: string // nome exibido (editável)
  price: number // preço de venda usado no breakeven (sugerido do gateway, editável)
  items: TaxItem[]
}

export interface AccountFees {
  accountId: string
  label: string
  items: TaxItem[]
}

export interface TaxasConfig {
  global: TaxItem[]
  aprovEstimada: number // % usada só nas estimativas do Monitor (dado real vem do gateway)
  products: Record<string, ProductFees>
  accounts: Record<string, AccountFees>
}

const KEY = 'taxas_v1'

export const uid = () => Math.random().toString(36).slice(2, 9)

export function defaultConfig(): TaxasConfig {
  // semeia o padrão a partir do meta_fin legado (config global antiga)
  const legacy = cacheGet<{ gateway?: number; imposto?: number; custoUn?: number; aprov?: number }>('meta_fin', {})
  const global: TaxItem[] = []
  const gw = legacy.gateway ?? 5
  if (gw) global.push({ id: uid(), label: 'Gateway/checkout', kind: 'pct', value: gw, cat: 'taxa' })
  if (legacy.imposto) global.push({ id: uid(), label: 'Imposto', kind: 'pct', value: legacy.imposto, cat: 'imposto' })
  if (legacy.custoUn) global.push({ id: uid(), label: 'Custo por venda', kind: 'fixo', value: legacy.custoUn, cat: 'custo' })
  return { global, aprovEstimada: legacy.aprov ?? 75, products: {}, accounts: {} }
}

function normalize(c: Partial<TaxasConfig> | null | undefined): TaxasConfig {
  const d = defaultConfig()
  if (!c) return d
  return {
    global: Array.isArray(c.global) ? c.global : d.global,
    aprovEstimada: typeof c.aprovEstimada === 'number' ? c.aprovEstimada : d.aprovEstimada,
    products: c.products && typeof c.products === 'object' ? c.products : {},
    accounts: c.accounts && typeof c.accounts === 'object' ? c.accounts : {},
  }
}

/** cache local (render instantâneo) */
export function loadTaxas(): TaxasConfig {
  return normalize(cacheGet<Partial<TaxasConfig> | null>(KEY, null))
}
/** fonte de verdade (Supabase) — chamar ao montar */
export async function syncTaxas(): Promise<TaxasConfig> {
  const v = await loadState<Partial<TaxasConfig> | null>(KEY, null)
  const cfg = normalize(v)
  cacheSet(KEY, cfg)
  return cfg
}
export function saveTaxas(cfg: TaxasConfig) {
  cacheSet(KEY, cfg)
  remoteSet(KEY, cfg)
}

/* ── somas e breakeven ─────────────────────────────────────────────────────── */

export interface FeeSums {
  pct: number
  fixo: number
  byCat: Record<TaxCat, { pct: number; fixo: number }>
}

export function sumFees(items: TaxItem[]): FeeSums {
  const byCat: FeeSums['byCat'] = {
    taxa: { pct: 0, fixo: 0 },
    imposto: { pct: 0, fixo: 0 },
    custo: { pct: 0, fixo: 0 },
  }
  let pct = 0
  let fixo = 0
  items.forEach((it) => {
    const v = it.value || 0
    if (it.kind === 'pct') { pct += v; byCat[it.cat].pct += v } else { fixo += v; byCat[it.cat].fixo += v }
  })
  return { pct, fixo, byCat }
}

export interface BreakevenInfo {
  margem: number // R$ que sobra por venda depois de todas as taxas
  margemPct: number // % do preço
  be: number | null // ROAS de equilíbrio (null = margem <= 0, inviável)
}

/** Breakeven ROAS: com margem líquida m por venda de preço P, empatar exige ROAS = P/m. */
export function breakevenInfo(price: number, items: TaxItem[]): BreakevenInfo {
  const { pct, fixo } = sumFees(items)
  const margem = price * (1 - pct / 100) - fixo
  return {
    margem,
    margemPct: price > 0 ? (margem / price) * 100 : 0,
    be: price > 0 && margem > 0 ? price / margem : null,
  }
}

/* ── resolução por pedido / conta ──────────────────────────────────────────── */

function mainProductOf(o: KirvanoOrder): { id: string | null; name: string | null } {
  if (Array.isArray(o.products) && o.products.length) {
    const main = o.products.find((p: any) => p && !p.is_order_bump) || o.products[0]
    return { id: main?.id != null ? String(main.id) : null, name: main?.name || o.product || null }
  }
  return { id: null, name: o.product || null }
}

export function productFeesByIdOrName(cfg: TaxasConfig, id: string | null, name: string | null): ProductFees | null {
  if (id) {
    const hit = Object.values(cfg.products).find((p) => p.key === id || p.ids.includes(id))
    if (hit) return hit
  }
  if (name) {
    const n = name.trim().toLowerCase()
    const hit = Object.values(cfg.products).find(
      (p) => p.label.trim().toLowerCase() === n || p.names.some((x) => x.trim().toLowerCase() === n),
    )
    if (hit) return hit
  }
  return null
}

/** Itens de taxa aplicáveis a um pedido (produto principal → config; senão padrão). */
export function feeItemsForOrder(cfg: TaxasConfig, o: KirvanoOrder): TaxItem[] {
  const { id, name } = mainProductOf(o)
  return productFeesByIdOrName(cfg, id, name)?.items ?? cfg.global
}

/** Itens de taxa de uma conta de anúncio (estimativas do Monitor); senão padrão. */
export function feeItemsForAccount(cfg: TaxasConfig, accountId?: string | null): TaxItem[] {
  if (accountId && cfg.accounts[accountId]?.items?.length) return cfg.accounts[accountId].items
  return cfg.global
}

/* ── descoberta de produtos a partir dos pedidos do gateway ────────────────── */

export interface DiscoveredProduct {
  key: string
  id: string | null
  name: string
  sales: number // vendas aprovadas (unidades do item)
  revenue: number
  avgPrice: number
  isBump: boolean
  lastAt: string | null
}

function numPrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (v == null) return 0
  let s = String(v).replace(/[^\d.,]/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

/** Agrupa TODOS os itens vendidos (principal + bumps) por id (fallback nome). */
export function discoverProducts(orders: KirvanoOrder[]): DiscoveredProduct[] {
  const map = new Map<string, DiscoveredProduct>()
  const touch = (id: string | null, name: string, price: number, isBump: boolean, at: string | null, approved: boolean) => {
    if (!name) return
    const key = id || 'n:' + name.trim().toLowerCase()
    let d = map.get(key)
    if (!d) {
      d = { key, id, name, sales: 0, revenue: 0, avgPrice: 0, isBump, lastAt: null }
      map.set(key, d)
    }
    if (id && !d.id) d.id = id
    if (approved) {
      d.sales += 1
      d.revenue += price
    }
    if (at && (!d.lastAt || at > d.lastAt)) d.lastAt = at
  }
  orders.forEach((o) => {
    const approved = (o.status || '').toUpperCase() === 'APPROVED'
    const at = o.ordered_at || o.created_at
    // preço de linha da Kirvano vem na moeda do comprador, nunca convertido — só
    // `value` (o pedido inteiro) chega em BRL. Pra pedido não-BRL, escala pela
    // mesma proporção que o total já-convertido representa do total original
    // (ver o mesmo ajuste em dashboard/realbuild.ts:valueForFilter).
    const cur = (o.currency || '').toUpperCase()
    const scale = cur && cur !== 'BRL' && o.value_orig && o.value_orig > 0 && o.value ? o.value / o.value_orig : 1
    if (Array.isArray(o.products) && o.products.length) {
      o.products.forEach((p: any) => {
        if (!p?.name) return
        const price = numPrice(p.price ?? p.amount ?? p.total_price) * scale || (o.products!.length === 1 ? o.value || 0 : 0)
        touch(p.id != null ? String(p.id) : null, p.name, price, !!p.is_order_bump, at, approved)
      })
    } else if (o.product) {
      touch(null, o.product, o.value || 0, false, at, approved)
    }
  })
  const arr = [...map.values()]
  arr.forEach((d) => { d.avgPrice = d.sales > 0 ? d.revenue / d.sales : 0 })
  return arr.sort((a, b) => b.sales - a.sales)
}
