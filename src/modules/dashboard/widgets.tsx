import { useEffect, useState, type ReactNode } from 'react'
import { authHeaders } from '@/lib/supabase'
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

/* Barras de LUCRO REAL (faturamento − taxas − gasto em ads): verde acima da linha
 * do zero, vermelho abaixo, altura proporcional ao valor. Compartilhado pelo
 * "Lucro por Dia" e pelo "Lucro por Horário" — é o mesmo gráfico, muda só a
 * granularidade (e no horário o gasto vem do breakdown por hora do Meta). */
interface ProfitRow { label: string; lucro: number; bruto: number; spend: number; vendas: number; roas: number | null }
function ProfitBars({ rows, unidade }: { rows: ProfitRow[]; unidade: 'dia' | 'hora' }) {
  const ativos = rows.filter((r) => r.bruto > 0 || r.spend > 0)
  if (!ativos.length) return <div className="flex h-full items-center justify-center text-[12px] text-muted2">Sem dados no período.</div>
  const verdes = ativos.filter((r) => r.lucro >= 0).length
  const vermelhos = ativos.length - verdes
  const total = ativos.reduce((s, r) => s + r.lucro, 0)
  const melhor = ativos.reduce((a, b) => (b.lucro > a.lucro ? b : a))
  const pior = ativos.reduce((a, b) => (b.lucro < a.lucro ? b : a))
  const un = unidade === 'dia' ? 'dia' : 'hora'
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
        <span className="font-semibold text-ok">{verdes} {un}{verdes === 1 ? '' : 's'} no lucro</span>
        <span className="font-semibold text-danger">{vermelhos} no prejuízo</span>
        <span className="text-muted2">melhor {melhor.label} ({BRL(melhor.lucro)})</span>
        {pior.lucro < 0 && <span className="text-muted2">pior {pior.label} ({BRL(pior.lucro)})</span>}
        <span className={`ml-auto font-bold ${total >= 0 ? 'text-ok' : 'text-danger'}`}>total {BRL(total)}</span>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#545c84' }} axisLine={false} tickLine={false} minTickGap={4} />
            <YAxis tick={{ fontSize: 10, fill: '#545c84' }} axisLine={false} tickLine={false} width={46} />
            <ReferenceLine y={0} stroke="#545c84" strokeWidth={1} />
            <Tooltip
              cursor={{ fill: 'rgba(99,102,241,.08)' }}
              contentStyle={TOOLTIP_STYLE}
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as ProfitRow
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
            <Bar
              dataKey="lucro"
              shape={(props: any) => {
                const { x, y, width, height, payload } = props
                const ok = (payload as ProfitRow).lucro >= 0
                const r = Math.min(4, Math.abs(height))
                return <Rectangle x={x} y={y} width={width} height={height} fill={ok ? '#10b981' : '#ef4444'} radius={ok ? [r, r, 0, 0] : [0, 0, r, r]} />
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
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
  { id: 'limites_envio', category: 'Geral', title: 'Limites de Envio', w: 3, h: 3, render: () => <LimitesEnvio /> },
  { id: 'recup_melodify', category: 'Geral', title: 'Recuperação Melodify (7d)', w: 3, h: 4, render: () => <RecupMelodify /> },
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
    render: (d) => <ProfitBars rows={d.profitByDay} unidade="dia" />,
  },
  // Lucro REAL por HORA: faturamento da hora − taxas − gasto em ads daquela hora.
  // Mostra em qual faixa do dia a operação ganha e em qual ela queima.
  {
    id: 'lucro_horario_real',
    category: 'Gráficos Avançados',
    title: 'Lucro por Horário',
    w: 12,
    h: 4,
    minH: 3,
    minW: 4,
    render: (d) => <ProfitBars rows={d.profitByHourReal} unidade="hora" />,
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
      // `safe center` e não `justify-center`: com overflow, o center joga o excesso
      // pra FORA nas duas pontas e o scroll não alcança o topo — o produto nº 1 da
      // lista (a maior barra) sumia da tela. O `safe` centra só quando cabe; quando
      // passa, alinha no topo. A classe justify-start fica de reserva pra navegador
      // que não entenda o `safe`.
      return (
        <div className="flex h-full flex-col justify-start gap-2.5 overflow-y-auto" style={{ justifyContent: 'safe center' }}>
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

/* ── Limites de envio (cotas COMPARTILHADAS entre os produtos) ──
 * Brevo: e-mails restantes no dia (o plano free zera em 300 e derruba a entrega
 * de TODOS os produtos). WhatsApp: qualidade/nível do número.
 * Busca sozinho em /api/mobile?fn=limites — não depende do DashboardData. */
interface LimitesData {
  brevo: { restante: number | null; plano: string | null; limite: number | null; ciclo?: string | null; renova?: string | null } | null
  whatsapp: { numero: string | null; qualidade: string | null; nivel: string | null } | null
}
function LimitesEnvio() {
  const [d, setD] = useState<LimitesData | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    let vivo = true
    const puxa = () => authHeaders().then((h) => fetch('/api/mobile?fn=limites', { headers: h })).then((r) => r.json()).then((j) => vivo && setD(j)).catch(() => vivo && setErro(true))
    puxa()
    const t = setInterval(puxa, 5 * 60000) // re-checa a cada 5 min
    return () => { vivo = false; clearInterval(t) }
  }, [])
  if (erro) return <div className="flex h-full items-center justify-center text-[12px] text-muted2">falha ao ler cotas</div>
  if (!d) return <div className="flex h-full items-center justify-center text-[12px] text-muted2">carregando…</div>

  const rest = d.brevo?.restante ?? null
  const lim = d.brevo?.limite ?? null
  const ciclo = d.brevo?.ciclo || 'dia'
  // alerta proporcional ao ciclo: no plano diário (300) aperta cedo; no mensal (5k) só no fim
  const alerta = ciclo === 'mês' ? 500 : 120
  const critico = ciclo === 'mês' ? 200 : 50
  const cor = rest === null ? 'text-ink' : rest <= critico ? 'text-danger' : rest <= alerta ? 'text-warn' : 'text-ok'
  const pct = rest !== null && lim ? Math.max(0, Math.min(100, (rest / lim) * 100)) : null
  const renova = d.brevo?.renova ? new Date(d.brevo.renova + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : null
  const q = d.whatsapp?.qualidade || null
  const qCor = q === 'GREEN' ? 'text-ok' : q === 'YELLOW' ? 'text-warn' : q === 'RED' ? 'text-danger' : 'text-muted2'

  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[22px] font-extrabold leading-tight ${cor}`}>{rest ?? '—'}</span>
          <span className="text-[11px] text-muted2">e-mails restantes {ciclo === 'mês' ? 'no ciclo' : 'hoje'}{lim ? ` / ${lim}` : ''}</span>
        </div>
        {pct !== null && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface2">
            <div className={`h-full rounded-full ${rest !== null && rest <= critico ? 'bg-danger' : rest !== null && rest <= alerta ? 'bg-warn' : 'bg-ok'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="mt-0.5 text-[10px] text-muted2">Brevo {d.brevo?.plano || '—'}{renova ? ` · renova ${renova}` : ''} · cota compartilhada</div>
      </div>
      <div className="border-t border-border pt-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[13px] font-bold ${qCor}`}>{q || '—'}</span>
          <span className="text-[11px] text-muted2">qualidade do WhatsApp</span>
        </div>
        <div className="mt-0.5 text-[10px] text-muted2">{d.whatsapp?.numero || '—'}{d.whatsapp?.nivel ? ` · ${d.whatsapp.nivel}` : ''}</div>
      </div>
    </div>
  )
}

/* ── Recuperação de venda do Melodify (7 dias) ──
 * Quem fez a letra grátis, não comprou, recebeu WhatsApp/e-mail — e pagou depois.
 * Atribuição de carrinho abandonado: parte compraria mesmo sem a mensagem, então
 * é TETO, não causalidade. Serve pra decidir escalar ou desligar o WhatsApp pago. */
interface RecupData {
  ok: boolean; reason?: string
  dias?: number; enviados?: number; zaps?: number; emails?: number
  pagaram?: number; taxa?: number; receita?: number; custo?: number; roi?: number | null
}
function RecupMelodify() {
  const [d, setD] = useState<RecupData | null>(null)
  useEffect(() => {
    let vivo = true
    const puxa = () => authHeaders().then((h) => fetch('/api/mobile?fn=recup-melodify&dias=7', { headers: h })).then((r) => r.json()).then((j) => vivo && setD(j)).catch(() => vivo && setD({ ok: false, reason: 'erro' }))
    puxa()
    const t = setInterval(puxa, 10 * 60000)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  if (!d) return <div className="flex h-full items-center justify-center text-[12px] text-muted2">carregando…</div>
  if (!d.ok) return <div className="flex h-full items-center justify-center text-center text-[11px] text-muted2">{d.reason || 'indisponível'}</div>

  const roi = d.roi ?? null
  const lucro = (d.receita || 0) - (d.custo || 0)
  const cor = roi === null ? 'text-ink' : roi >= 2 ? 'text-ok' : roi >= 1 ? 'text-warn' : 'text-danger'
  return (
    <div className="flex h-full flex-col justify-center gap-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className={`text-[22px] font-extrabold leading-tight ${cor}`}>{roi !== null ? `${roi}x` : '—'}</span>
        <span className="text-[11px] text-muted2">ROI da recuperação · {d.dias}d</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <span className="text-muted2">Receberam</span><span className="text-right font-semibold">{d.enviados ?? 0}</span>
        <span className="text-muted2">Pagaram depois</span><span className="text-right font-semibold text-ok">{d.pagaram ?? 0} ({d.taxa ?? 0}%)</span>
        <span className="text-muted2">Recuperado</span><span className="text-right font-semibold">{BRL(d.receita || 0)}</span>
        <span className="text-muted2">Custo zap</span><span className="text-right font-semibold text-muted">{BRL(d.custo || 0)}</span>
        <span className="text-muted2">Saldo</span><span className={`text-right font-bold ${lucro >= 0 ? 'text-ok' : 'text-danger'}`}>{BRL(lucro)}</span>
      </div>
      <div className="text-[9.5px] leading-tight text-muted2">{d.zaps ?? 0} zaps · {d.emails ?? 0} e-mails. Teto de atribuição (parte compraria sem a msg).</div>
    </div>
  )
}

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
  { i: 'lucro_horario_real', x: 0, y: 20, w: 12, h: 4 },
  { i: 'vendas_pais', x: 0, y: 24, w: 4, h: 4 },
  { i: 'lucro_horario', x: 4, y: 24, w: 8, h: 4 },
  { i: 'funil_conversao', x: 0, y: 28, w: 12, h: 5 },
  { i: 'fat_inv_lucro', x: 0, y: 33, w: 12, h: 4 },
  { i: 'limites_envio', x: 0, y: 37, w: 3, h: 3 },
  { i: 'recup_melodify', x: 3, y: 37, w: 3, h: 4 },
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
