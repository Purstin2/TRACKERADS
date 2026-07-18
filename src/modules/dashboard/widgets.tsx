import type { ReactNode } from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  Legend,
  ReferenceLine,
  Rectangle,
} from 'recharts'
import Funnel from '@/modules/monitor/components/Funnel'
import { BRL, PCT, type DashboardData, type DayPoint } from './data'

export interface WidgetDef {
  id: string
  category: string
  title: string
  w: number
  h: number
  minW?: number
  minH?: number
  accent?: boolean
  render: (d: DashboardData) => ReactNode
}

/* ── KPI value (corpo de card simples) ──
 * tone: 'ok' = verde, 'bad' = vermelho (prejuízo/abaixo do breakeven), undefined = neutro.
 * `true` ainda é aceito (= 'ok') pra compatibilidade. */
type Tone = 'ok' | 'bad' | boolean | undefined
function kpiBody(value: ReactNode, tone?: Tone, sub?: ReactNode) {
  const color = tone === 'bad' ? 'text-danger' : tone === 'ok' || tone === true ? 'text-ok' : 'text-ink'
  return (
    <div className="flex h-full flex-col justify-center">
      <div className={`text-[22px] font-extrabold leading-tight ${color}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted2">{sub}</div>}
    </div>
  )
}

function approvalColor(pct: number) {
  if (pct >= 80) return '#10b981'
  if (pct >= 65) return '#f59e0b'
  return '#ef4444'
}

const TOOLTIP_STYLE = {
  background: '#0d0f1e',
  border: '1px solid #1d2139',
  borderRadius: 8,
  fontSize: 12,
}

/* ───────────────── registry ───────────────── */
export const WIDGETS: WidgetDef[] = [
  // ── Geral · KPIs ──
  // ROAS/ROI: verde >= 1 (faturou/recuperou o gasto), vermelho < 1 (prejuízo no período).
  { id: 'roas', category: 'Geral', title: 'ROAS', w: 3, h: 2, accent: true, render: (d) => kpiBody(d.roas.toFixed(2), d.roas >= 1 ? 'ok' : 'bad') },
  { id: 'cpa', category: 'Geral', title: 'CPA', w: 3, h: 2, render: (d) => kpiBody(BRL(d.cpa)) },
  { id: 'faturamento_bruto', category: 'Geral', title: 'Faturamento Bruto', w: 3, h: 2, render: (d) => kpiBody(BRL(d.faturamentoBruto)) },
  { id: 'margem', category: 'Geral', title: 'Margem', w: 3, h: 2, accent: true, render: (d) => kpiBody(PCT(d.margem), d.margem >= 0 ? 'ok' : 'bad') },
  { id: 'arpu', category: 'Geral', title: 'ARPU', w: 3, h: 2, render: (d) => kpiBody(BRL(d.arpu)) },
  { id: 'faturamento_liquido', category: 'Geral', title: 'Faturamento Líquido', w: 3, h: 2, render: (d) => kpiBody(BRL(d.faturamentoLiquido)) },
  { id: 'roi', category: 'Geral', title: 'ROI', w: 3, h: 2, accent: true, render: (d) => kpiBody(d.roi.toFixed(2), d.roi >= 1 ? 'ok' : 'bad') },
  { id: 'lucro', category: 'Geral', title: 'Lucro', w: 3, h: 2, accent: true, render: (d) => kpiBody(BRL(d.lucro), d.lucro >= 0 ? 'ok' : 'bad') },
  { id: 'gasto', category: 'Geral', title: 'Gastos com anúncios', w: 3, h: 2, render: (d) => kpiBody(BRL(d.gastoAds)) },
  { id: 'despesas', category: 'Geral', title: 'Despesas adicionais', w: 3, h: 2, render: (d) => kpiBody(BRL(d.despesasAdicionais)) },
  { id: 'reembolso', category: 'Geral', title: 'Taxa de Reembolso', w: 3, h: 2, render: (d) => kpiBody(PCT(d.reembolsoPct)) },
  { id: 'chargeback', category: 'Geral', title: 'Chargeback', w: 3, h: 2, render: (d) => kpiBody(PCT(d.chargebackPct)) },
  { id: 'vendas_pendentes', category: 'Geral', title: 'Vendas Pendentes', w: 3, h: 2, render: (d) => kpiBody(BRL(d.vendasPendentes)) },
  { id: 'vendas_reembolsadas', category: 'Geral', title: 'Vendas Reembolsadas', w: 3, h: 2, render: (d) => kpiBody(BRL(d.vendasReembolsadas)) },

  // ── Geral · composições ──
  {
    id: 'vendas_pagamento',
    category: 'Geral',
    title: 'Vendas por Pagamento',
    w: 3,
    h: 4,
    minH: 3,
    render: (d) => (
      <div className="flex h-full flex-col">
        <div className="relative min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={d.payment} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} stroke="none">
                {d.payment.map((p) => (
                  <Cell key={p.name} fill={p.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wide text-muted2">Total</span>
            <span className="text-2xl font-extrabold">{d.totalSales}</span>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {d.payment.map((p) => (
            <span key={p.name} className="flex items-center gap-1 text-[10px] text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.name} {p.value}%
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'aprovacao',
    category: 'Geral',
    title: 'Taxa de Aprovação',
    w: 4,
    h: 3,
    minH: 2,
    render: (d) => (
      <div className="flex h-full flex-col justify-center gap-3.5">
        {d.approval.map((a) => (
          <div key={a.label}>
            <div className="mb-1 flex justify-between text-[12px]">
              <span className="text-muted">{a.label}</span>
              <span className="font-bold" style={{ color: approvalColor(a.pct) }}>
                {PCT(a.pct)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface2">
              <div className="h-full rounded-full" style={{ width: `${a.pct}%`, background: approvalColor(a.pct) }} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'posicionamento',
    category: 'Geral',
    title: 'Vendas por Posicionamento',
    w: 5,
    h: 4,
    minH: 3,
    render: (d) => (
      <div className="flex h-full flex-col justify-center gap-2.5">
        {d.positioning.map((p) => (
          <div key={p.label} className="flex items-center gap-2">
            <span className="w-[140px] truncate text-[12px] text-ink">{p.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
              <div className="h-full rounded-full bg-brand" style={{ width: `${(p.pct / d.positioning[0].pct) * 100}%` }} />
            </div>
            <span className="w-9 text-right text-[12px] font-semibold text-muted">{p.count}</span>
            <span className="w-11 text-right text-[11px] text-muted2">{PCT(p.pct)}</span>
          </div>
        ))}
      </div>
    ),
  },

  // ── Impostos ──
  { id: 'taxas', category: 'Impostos', title: 'Taxas', w: 3, h: 2, render: (d) => kpiBody(BRL(d.taxas)) },
  { id: 'imposto_total', category: 'Impostos', title: 'Imposto total', w: 3, h: 2, render: (d) => kpiBody(BRL(d.impostoTotal)) },

  // ── Performance por Conta (cada conta isolada: só o gasto e as vendas DELA) ──
  {
    id: 'perf_contas',
    category: 'Gráficos Avançados',
    title: 'Performance por Conta',
    w: 12,
    h: 4,
    minH: 3,
    minW: 5,
    render: (d) => {
      const accs = d.accounts.filter((a) => a.id !== '__none__')
      const sem = d.accounts.find((a) => a.id === '__none__')
      if (!accs.length) return <div className="flex h-full items-center justify-center text-[12px] text-muted2">Sem dados de conta no período.</div>
      const T = accs.reduce((a, x) => ({ spend: a.spend + x.spend, sales: a.sales + x.sales, revenue: a.revenue + x.revenue, lucro: a.lucro + x.lucro }), { spend: 0, sales: 0, revenue: 0, lucro: 0 })
      const troas = T.spend > 0 ? T.revenue / T.spend : null
      // fundo por classe: verde/amarelo/vermelho/cinza
      const bg: Record<string, string> = { good: 'bg-ok/[0.08]', warn: 'bg-warn/[0.08]', bad: 'bg-danger/[0.10]', none: '' }
      const dot: Record<string, string> = { good: 'bg-ok', warn: 'bg-warn', bad: 'bg-danger', none: 'bg-muted2/50' }
      const roasCls = (r: number | null) => (r == null ? 'text-muted2' : r >= 1.5 ? 'text-ok' : r >= 1.2 ? 'text-warn' : 'text-danger')
      const lucroCls = (v: number) => (v >= 0 ? 'text-ok' : 'text-danger')
      const money = (v: number) => (v >= 0 ? '' : '-') + BRL(Math.abs(v)).replace('R$', 'R$')
      return (
        <div className="h-full overflow-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted2">
                <th className="py-2 pl-1 text-left">Conta</th>
                <th className="py-2 text-right">Gasto</th>
                <th className="py-2 text-right">Vendas</th>
                <th className="py-2 text-right">Fat.</th>
                <th className="py-2 text-right">ROAS</th>
                <th className="py-2 pr-1 text-right">Lucro</th>
              </tr>
            </thead>
            <tbody>
              {accs.map((a) => (
                <tr key={a.id} className={`border-b border-border/40 ${bg[a.cls]}`}>
                  <td className="py-2 pl-1">
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dot[a.cls]}`} />
                      <span className="truncate font-semibold text-ink" title={a.name}>{a.name || '(sem nome)'}</span>
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted">{BRL(a.spend)}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted">{a.sales}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted">{BRL(a.revenue)}</td>
                  <td className={`py-2 text-right font-mono tabular-nums font-bold ${roasCls(a.roas)}`}>{a.roas != null ? a.roas.toFixed(2) : '—'}</td>
                  <td className={`py-2 pr-1 text-right font-mono tabular-nums font-semibold ${lucroCls(a.lucro)}`}>{money(a.lucro)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-bold">
                <td className="py-2 pl-1 text-muted">Total</td>
                <td className="py-2 text-right font-mono tabular-nums">{BRL(T.spend)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{T.sales}</td>
                <td className="py-2 text-right font-mono tabular-nums">{BRL(T.revenue)}</td>
                <td className={`py-2 text-right font-mono tabular-nums ${roasCls(troas)}`}>{troas != null ? troas.toFixed(2) : '—'}</td>
                <td className={`py-2 pr-1 text-right font-mono tabular-nums ${lucroCls(T.lucro)}`}>{money(T.lucro)}</td>
              </tr>
            </tfoot>
          </table>
          {sem && (
            <p className="mt-1.5 px-1 text-[10.5px] text-muted2">
              + {sem.sales} venda{sem.sales > 1 ? 's' : ''} ({BRL(sem.revenue)}) sem campanha atribuída (orgânico / sem UTM) — não entram em nenhuma conta.
            </p>
          )}
          <p className="mt-1 px-1 text-[10px] text-muted2">🟢 lucro ≥15% · 🟡 lucra apertado · 🔴 no prejuízo. Cada conta usa só o gasto e as vendas DELA.</p>
        </div>
      )
    },
  },
  // ── Gráficos Avançados ──
  // Lucro REAL por dia: único gráfico que desconta o anúncio → único que fica vermelho.
  {
    id: 'lucro_dia',
    category: 'Gráficos Avançados',
    title: 'Lucro por Dia',
    w: 12,
    h: 4,
    minH: 3,
    minW: 4,
    render: (d) => {
      const days = d.profitByDay
      if (!days.length)
        return <div className="flex h-full items-center justify-center text-[12px] text-muted2">Sem dados no período.</div>
      const verdes = days.filter((p) => p.lucro >= 0).length
      const vermelhos = days.length - verdes
      const total = days.reduce((s, p) => s + p.lucro, 0)
      const melhor = days.reduce((a, b) => (b.lucro > a.lucro ? b : a))
      const pior = days.reduce((a, b) => (b.lucro < a.lucro ? b : a))
      return (
        <div className="flex h-full flex-col">
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            <span className="font-semibold text-ok">{verdes} dia{verdes === 1 ? '' : 's'} no lucro</span>
            <span className="font-semibold text-danger">{vermelhos} no prejuízo</span>
            <span className="text-muted2">melhor {melhor.label} ({BRL(melhor.lucro)})</span>
            {pior.lucro < 0 && <span className="text-muted2">pior {pior.label} ({BRL(pior.lucro)})</span>}
            <span className={`ml-auto font-bold ${total >= 0 ? 'text-ok' : 'text-danger'}`}>total {BRL(total)}</span>
          </div>
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#545c84' }} axisLine={false} tickLine={false} minTickGap={4} />
                <YAxis tick={{ fontSize: 10, fill: '#545c84' }} axisLine={false} tickLine={false} width={46} />
                <ReferenceLine y={0} stroke="#545c84" strokeWidth={1} />
                <Tooltip
                  cursor={{ fill: 'rgba(99,102,241,.08)' }}
                  contentStyle={TOOLTIP_STYLE}
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0].payload as DayPoint
                    const ok = p.lucro >= 0
                    return (
                      <div className="rounded-lg border border-border bg-[#0d0f1e] px-3 py-2 text-[11.5px]">
                        <div className="mb-1 font-bold text-ink">{p.label}</div>
                        <div className={`text-[15px] font-extrabold ${ok ? 'text-ok' : 'text-danger'}`}>
                          {ok ? 'Lucro ' : 'Prejuízo '}{BRL(Math.abs(p.lucro))}
                        </div>
                        <div className="mt-1 flex flex-col gap-0.5 text-muted2">
                          <span>Faturamento <b className="text-ink">{BRL(p.bruto)}</b></span>
                          <span>Gasto em ads <b className="text-ink">{BRL(p.spend)}</b></span>
                          <span>Vendas <b className="text-ink">{p.vendas}</b>{p.roas != null && <> · ROAS <b className="text-ink">{p.roas.toFixed(2)}</b></>}</span>
                        </div>
                      </div>
                    )
                  }}
                />
                {/* shape próprio: a cor sai do sinal do lucro e o canto arredondado
                    acompanha o lado da barra (topo pra cima, base pra baixo) */}
                <Bar
                  dataKey="lucro"
                  shape={(props: any) => {
                    const { x, y, width, height, payload } = props
                    const ok = (payload as DayPoint).lucro >= 0
                    const r = Math.min(4, Math.abs(height))
                    return (
                      <Rectangle
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        fill={ok ? '#10b981' : '#ef4444'}
                        radius={ok ? [r, r, 0, 0] : [0, 0, r, r]}
                      />
                    )
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )
    },
  },
  {
    id: 'lucro_horario',
    category: 'Gráficos Avançados',
    // NÃO é lucro: é o faturamento líquido da hora (não desconta anúncio). O nome
    // antigo dizia "Lucro" e por isso nenhuma barra ficava vermelha. Lucro de
    // verdade está no "Lucro por Dia".
    title: 'Faturamento líquido por Horário',
    w: 12,
    h: 4,
    minH: 3,
    minW: 4,
    render: (d) => {
      const max = Math.max(...d.profitByHour.map((x) => x.value))
      return (
        <div className="h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.profitByHour} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#545c84' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(99,102,241,.08)' }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => BRL(v)}
                labelFormatter={(h) => `${h}h`}
              />
              <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                {d.profitByHour.map((p, i) => (
                  <Cell key={i} fill={p.value === max ? '#8b5cf6' : '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )
    },
  },

  // ── Vendas por Produto ──
  {
    id: 'vendas_produto',
    category: 'Geral',
    title: 'Vendas por Produto',
    w: 5,
    h: 4,
    minH: 3,
    render: (d) => {
      const top = d.vendasPorProduto[0]?.pct || 1
      return (
        <div className="flex h-full flex-col justify-center gap-2.5 overflow-y-auto">
          {d.vendasPorProduto.length === 0 && <div className="text-center text-[12px] text-muted2">Sem vendas no período.</div>}
          {d.vendasPorProduto.map((p) => (
            <div key={p.label} className="flex items-center gap-2">
              <span className="w-[150px] truncate text-[12px] text-ink" title={p.label}>{p.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(p.pct / top) * 100}%` }} />
              </div>
              <span className="w-7 text-right text-[12px] font-semibold text-muted">{p.count}</span>
              <span className="w-11 text-right text-[11px] text-muted2">{PCT(p.pct)}</span>
            </div>
          ))}
        </div>
      )
    },
  },

  // ── Vendas por País (estável até capturarmos país no checkout) ──
  {
    id: 'vendas_pais',
    category: 'Geral',
    title: 'Vendas por País',
    w: 4,
    h: 4,
    minH: 3,
    render: (d) =>
      d.paises.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
          <span className="text-[13px] font-semibold text-muted">Sem dados de país</span>
          <span className="max-w-[220px] text-[11px] text-muted2">O país não é capturado no checkout ainda — quando o gateway enviar, aparece aqui.</span>
        </div>
      ) : (
        <div className="flex h-full flex-col justify-center gap-2.5">
          {d.paises.map((p) => (
            <div key={p.label} className="flex items-center gap-2">
              <span className="w-[120px] truncate text-[12px] text-ink">{p.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(p.pct / (d.paises[0].pct || 1)) * 100}%` }} />
              </div>
              <span className="w-7 text-right text-[12px] font-semibold text-muted">{p.count}</span>
            </div>
          ))}
        </div>
      ),
  },

  // ── Funil de Conversão (Meta Ads) ──
  {
    id: 'funil_conversao',
    category: 'Gráficos Avançados',
    title: 'Funil de Conversão (Meta Ads)',
    w: 12,
    h: 5,
    minH: 4,
    minW: 6,
    render: (d) => (
      <div className="h-full overflow-hidden">
        <Funnel stages={d.funnel} title="Cliques → Visita → Checkout → Vendas iniciadas → Aprovadas" subtitle="Cliques/Visita/Checkout = Meta · Vendas iniciadas (pix/boleto/cartão gerados) e Aprovadas = gateway real (como a UTMify)" />
      </div>
    ),
  },

  // ── Faturamento × Investimento × Lucro por Hora (acumulado) ──
  {
    id: 'fat_inv_lucro',
    category: 'Gráficos Avançados',
    title: 'Faturamento × Investimento × Lucro (acumulado/hora)',
    w: 12,
    h: 4,
    minH: 3,
    minW: 4,
    render: (d) => (
      <div className="h-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={d.cumulative} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
              <linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
              <linearGradient id="gLuc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
            </defs>
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#545c84' }} axisLine={false} tickLine={false} minTickGap={20} />
            <YAxis tick={{ fontSize: 10, fill: '#545c84' }} axisLine={false} tickLine={false} width={44} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => BRL(v)} labelFormatter={(h) => `${h}h`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="faturamento" name="Faturamento" stroke="#10b981" strokeWidth={2} fill="url(#gFat)" />
            <Area type="monotone" dataKey="investimento" name="Investimento" stroke="#f59e0b" strokeWidth={2} fill="url(#gInv)" />
            <Area type="monotone" dataKey="lucro" name="Lucro" stroke="#6366f1" strokeWidth={2} fill="url(#gLuc)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    ),
  },
]

export const WIDGET_MAP = Object.fromEntries(WIDGETS.map((w) => [w.id, w])) as Record<
  string,
  WidgetDef
>

export const CATEGORIES = ['Geral', 'Gráficos Avançados', 'Impostos']

/* layout padrão (12 colunas) */
export interface GridItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export const DEFAULT_LAYOUT: GridItem[] = [
  { i: 'vendas_pagamento', x: 0, y: 0, w: 3, h: 4 },
  { i: 'roas', x: 3, y: 0, w: 3, h: 2 },
  { i: 'cpa', x: 6, y: 0, w: 3, h: 2 },
  { i: 'faturamento_bruto', x: 9, y: 0, w: 3, h: 2 },
  { i: 'margem', x: 3, y: 2, w: 3, h: 2 },
  { i: 'arpu', x: 6, y: 2, w: 3, h: 2 },
  { i: 'faturamento_liquido', x: 9, y: 2, w: 3, h: 2 },
  { i: 'roi', x: 0, y: 4, w: 3, h: 2 },
  { i: 'lucro', x: 3, y: 4, w: 3, h: 2 },
  { i: 'gasto', x: 6, y: 4, w: 3, h: 2 },
  { i: 'despesas', x: 9, y: 4, w: 3, h: 2 },
  { i: 'vendas_produto', x: 0, y: 6, w: 5, h: 4 },
  { i: 'aprovacao', x: 5, y: 6, w: 4, h: 3 },
  { i: 'taxas', x: 9, y: 6, w: 3, h: 2 },
  { i: 'imposto_total', x: 9, y: 8, w: 3, h: 2 },
  { i: 'reembolso', x: 0, y: 10, w: 3, h: 2 },
  { i: 'chargeback', x: 3, y: 10, w: 3, h: 2 },
  { i: 'vendas_pendentes', x: 6, y: 10, w: 3, h: 2 },
  { i: 'vendas_reembolsadas', x: 9, y: 10, w: 3, h: 2 },
  { i: 'perf_contas', x: 0, y: 12, w: 12, h: 4 },
  { i: 'lucro_dia', x: 0, y: 16, w: 12, h: 4 },
  { i: 'vendas_pais', x: 0, y: 20, w: 4, h: 4 },
  { i: 'lucro_horario', x: 4, y: 20, w: 8, h: 4 },
  { i: 'funil_conversao', x: 0, y: 24, w: 12, h: 5 },
  { i: 'fat_inv_lucro', x: 0, y: 29, w: 12, h: 4 },
]

export const DEFAULT_ENABLED = DEFAULT_LAYOUT.map((l) => l.i)

/** Widgets criados DEPOIS que o usuário já salvou o layout dele.
 *  Um widget ausente do layout salvo é novo (nunca foi visto) — entra.
 *  Um que está no layout mas fora de `enabled` foi removido de propósito — fica fora.
 *  Sem isso, todo gráfico novo nasceria invisível pra quem já mexeu no dashboard. */
export function withNewWidgets<T extends { enabled: string[]; layout: GridItem[] }>(p: T): T {
  const known = new Set(p.layout.map((l) => l.i))
  const novos = DEFAULT_LAYOUT.filter((d) => !known.has(d.i) && WIDGET_MAP[d.i])
  if (!novos.length) return p
  let y = p.layout.reduce((mx, l) => Math.max(mx, l.y + l.h), 0)
  const add = novos.map((d) => { const item = { ...d, x: 0, y }; y += d.h; return item })
  // preserva campos extras (ex.: savedAt) — só acrescenta os widgets novos
  return { ...p, enabled: [...p.enabled, ...add.map((a) => a.i)], layout: [...p.layout, ...add] }
}
