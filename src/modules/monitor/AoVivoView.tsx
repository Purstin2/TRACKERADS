import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, RefreshCw, Zap } from 'lucide-react'
import { campUrl } from '@/lib/meta'
import { useMonitor } from './MonitorContext'
import type { CacheItem } from './MonitorContext'
import { fetchRecentSales, type LiveSale } from './realRoas'
import { ActionsMenu } from './MonitorViews'
import { curSym } from './config'

/**
 * "Ao vivo" — quem ACABOU de vender, sem separar por conta.
 *
 * A pergunta que essa tela responde é uma só: *o que vendeu agora e vale
 * subir orçamento pra pegar o embalo?* Por isso ela quebra as regras das
 * outras abas de propósito:
 *   • lista ACHATADA (campanha de qualquer conta no mesmo ranking) — o que
 *     importa é a hora da venda, não onde ela mora;
 *   • ordenada pela venda MAIS RECENTE (a que vendeu agora sobe pro topo);
 *   • atualiza sozinha (só o gateway, que é barato — não re-consulta o Meta).
 *
 * Fonte: gateway (kirvano_orders). É a única com a HORA exata da venda — o Meta
 * só entrega agregado do dia. O ID da campanha vem do utm_campaign ("NOME|123").
 */

const MIN = 60 * 1000
const JANELAS: { label: string; ms: number }[] = [
  { label: '30 min', ms: 30 * MIN },
  { label: '1 h', ms: 60 * MIN },
  { label: '3 h', ms: 180 * MIN },
  { label: '6 h', ms: 360 * MIN },
  { label: 'Hoje', ms: 0 }, // 0 = desde 00h BR
]
const BR_OFFSET_MS = 3 * 3600000
/** Início do dia BR (00h) em ISO — pra opção "Hoje". */
function inicioDoDiaBR(): string {
  const hojeBR = new Date(Date.now() - BR_OFFSET_MS).toISOString().slice(0, 10)
  return new Date(`${hojeBR}T00:00:00-03:00`).toISOString()
}

/** "agora", "há 3 min", "há 1h12" — o dado mais importante da tela. */
function haQuantoTempo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / MIN)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  const r = min % 60
  return `há ${h}h${r > 0 ? String(r).padStart(2, '0') : ''}`
}
const horaBR = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

/** Campanha do Meta (nome/conta/números de hoje) achada no cache do Monitor. */
interface CampInfo {
  name: string
  accId: string
  accName: string
  cur: string
  roasHoje: number | null
  vendasHoje: number
  gastoHoje: number
}

/** Índice campId → dados da campanha, varrendo o cache de todas as contas. */
function indexarCampanhas(items: CacheItem[]): Record<string, CampInfo> {
  const idx: Record<string, CampInfo> = {}
  for (const item of items) {
    if (item.kind === 'err') continue
    const base = { accId: item.acc.id, accName: item.acc.name, cur: item.acc.cur }
    // visão de série temporal (historico/grafico/aovivo): campMap + datas
    if (item.campMap && item.dates?.length) {
      const hoje = item.dates[item.dates.length - 1] // última data buscada = hoje
      for (const [cid, camp] of Object.entries(item.campMap)) {
        const d = camp.dates[hoje]
        idx[cid] = { ...base, name: camp.name, roasHoje: d?.roas ?? null, vendasHoje: d?.sales ?? 0, gastoHoje: d?.spend ?? 0 }
      }
    }
    // visão lista: linhas agregadas do período
    if (item.rows?.length) {
      for (const r of item.rows) {
        if (!r.campaign_id) continue
        const spend = parseFloat(r.spend || '0')
        idx[r.campaign_id] = {
          ...base,
          name: r.campaign_name || '',
          roasHoje: idx[r.campaign_id]?.roasHoje ?? null,
          vendasHoje: idx[r.campaign_id]?.vendasHoje ?? 0,
          gastoHoje: spend,
        }
      }
    }
  }
  return idx
}

export default function AoVivoView({ items }: { items: CacheItem[] }) {
  const m = useMonitor()
  const [janela, setJanela] = useState(JANELAS[2]) // 3h por padrão
  const [vendas, setVendas] = useState<LiveSale[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [auto, setAuto] = useState(true)
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null)
  const [, forcarRender] = useState(0)
  const vivo = useRef(true)

  const buscar = useCallback(async () => {
    setCarregando(true)
    const since = janela.ms === 0 ? inicioDoDiaBR() : new Date(Date.now() - janela.ms).toISOString()
    try {
      const v = await fetchRecentSales(since)
      if (vivo.current) { setVendas(v); setAtualizadoEm(new Date()) }
    } catch { if (vivo.current) setVendas([]) }
    if (vivo.current) setCarregando(false)
  }, [janela])

  useEffect(() => { vivo.current = true; buscar(); return () => { vivo.current = false } }, [buscar])
  // auto-refresh do gateway (barato) — é o que faz a venda "pular" na tela
  useEffect(() => {
    if (!auto) return
    const t = setInterval(buscar, 60 * 1000)
    return () => clearInterval(t)
  }, [auto, buscar])
  // re-render a cada 30s só pra o "há X min" andar sozinho
  useEffect(() => {
    const t = setInterval(() => forcarRender((n) => n + 1), 30 * 1000)
    return () => clearInterval(t)
  }, [])

  const idx = useMemo(() => indexarCampanhas(items), [items])
  const linhas = useMemo(
    () =>
      (vendas || []).map((v) => {
        const info = idx[v.campId]
        return {
          ...v,
          nome: info?.name || v.name || `campanha ${v.campId}`,
          accId: info?.accId || '',
          accName: info?.accName || '—',
          cur: info?.cur || 'USD',
          roasHoje: info?.roasHoje ?? null,
          gastoHoje: info?.gastoHoje ?? 0,
          conhecida: !!info,
        }
      }),
    [vendas, idx],
  )

  const totalVendas = linhas.reduce((s, l) => s + l.sales, 0)
  const totalRev = linhas.reduce((s, l) => s + l.revenue, 0)

  return (
    <div className="flex flex-col gap-3">
      {/* barra: janela + auto-refresh */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted2">Vendeu nas últimas</span>
        <div className="flex overflow-hidden rounded-[8px] border border-border bg-[#0a0c19]">
          {JANELAS.map((j) => (
            <button
              key={j.label}
              onClick={() => setJanela(j)}
              className={`px-2.5 py-1 text-[12px] font-semibold transition-colors ${janela.label === j.label ? 'bg-brand text-white' : 'text-muted2 hover:text-ink'}`}
            >
              {j.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setAuto((a) => !a)}
          title="Atualiza sozinho a cada 60s (consulta só o gateway, não o Meta)"
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${auto ? 'border-ok/40 bg-ok/15 text-ok' : 'border-border bg-surface2 text-muted2'}`}
        >
          <span className={`h-2 w-2 rounded-full ${auto ? 'animate-pulse bg-ok' : 'bg-muted2'}`} />
          Ao vivo {auto ? 'ON' : 'OFF'}
        </button>

        <button onClick={buscar} disabled={carregando} className="btn btn-ghost btn-sm">
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>

        <span className="ml-auto text-[11px] text-muted2">
          {totalVendas > 0 && <b className="text-ink">{totalVendas} venda{totalVendas > 1 ? 's' : ''} · {curSym('BRL')}{totalRev.toFixed(2)}</b>}
          {atualizadoEm && <span className="ml-2">atualizado {horaBR(atualizadoEm.toISOString())}</span>}
        </span>
      </div>

      {!m.token.trim() && (
        <div className="rounded-xl2 border border-warn/30 bg-warn/[0.07] px-4 py-3 text-[12px] text-warn">
          Cole o token e clique Atualizar pra casar as vendas com nome/conta/gasto das campanhas.
        </div>
      )}

      {vendas === null && <div className="py-10 text-center text-[12px] text-muted2 animate-pulse">Buscando vendas…</div>}

      {vendas !== null && linhas.length === 0 && (
        <div className="rounded-xl2 border border-dashed border-border px-6 py-12 text-center">
          <div className="text-[13px] font-semibold text-muted">Nenhuma venda nas últimas {janela.label.toLowerCase()}</div>
          <div className="mt-1 text-[11.5px] text-muted2">Aumente a janela ou espere — a tela se atualiza sozinha.</div>
        </div>
      )}

      {linhas.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted2">
                <th className="py-2.5 pl-3 text-left">Vendeu</th>
                <th className="py-2.5 text-left">Campanha</th>
                <th className="py-2.5 text-left">Conta</th>
                <th className="py-2.5 text-right">Vendas</th>
                <th className="py-2.5 text-right">Faturou</th>
                <th className="py-2.5 text-right">ROAS hoje</th>
                <th className="py-2.5 text-right">Gasto hoje</th>
                <th className="py-2.5 pr-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const min = (Date.now() - new Date(l.lastAt).getTime()) / MIN
                const quente = min <= 15 // vendeu nos últimos 15 min → é o embalo
                const sym = curSym(l.cur)
                return (
                  <tr key={l.campId} className={`border-b border-border/40 ${quente ? 'bg-ok/[0.07]' : 'hover:bg-surface2/25'}`}>
                    <td className="whitespace-nowrap py-2.5 pl-3">
                      <span className="flex items-center gap-1.5">
                        {quente && <Zap className="h-3.5 w-3.5 shrink-0 text-ok" />}
                        <span className={`font-semibold ${quente ? 'text-ok' : 'text-muted'}`}>{haQuantoTempo(l.lastAt)}</span>
                        <span className="font-mono text-[10px] text-muted2">{horaBR(l.lastAt)}</span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-2">
                      <span className="flex items-center gap-1">
                        <span className="max-w-[380px] truncate text-ink" title={l.nome}>{l.nome}</span>
                        {l.accId && (
                          <a href={campUrl(l.accId, l.campId)} target="_blank" className="shrink-0 text-muted2 hover:text-brand-2" title="Abrir no Ads Manager">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10.5px] font-semibold text-muted2">{l.accName || '—'}</span>
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold tabular-nums text-ink">{l.sales}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-ok">R${l.revenue.toFixed(2)}</td>
                    <td className={`py-2.5 text-right font-mono font-bold tabular-nums ${l.roasHoje == null ? 'text-muted2' : l.roasHoje >= m.settings.roasGood ? 'text-ok' : l.roasHoje >= m.settings.roasBe ? 'text-warn' : 'text-danger'}`}>
                      {l.roasHoje != null ? l.roasHoje.toFixed(2) : '—'}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-muted2">{l.conhecida ? `${sym}${l.gastoHoje.toFixed(2)}` : '—'}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex justify-end">
                        {l.accId ? (
                          <ActionsMenu accId={l.accId} name={l.nome} campId={l.campId} roas={l.roasHoje} cur={l.cur} spend={l.gastoHoje} sales={l.sales} />
                        ) : (
                          <span className="text-[10.5px] text-muted2" title="Campanha não veio no fetch do Meta (pausada ou fora do filtro de status)">fora do filtro</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10.5px] text-muted2">
        ⚡ = vendeu nos últimos 15 min. Lista achatada de propósito: campanha de qualquer conta disputa o mesmo topo — o que manda é a hora da venda.
        Vendas vêm do gateway (hora exata); ROAS/gasto do dia vêm do Meta do último "Atualizar".
      </p>
    </div>
  )
}
