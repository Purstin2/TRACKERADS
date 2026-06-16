import type { ReactNode } from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
} from 'recharts'
import { BRL, PCT, type DashboardData } from './data'

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

/* ── KPI value (corpo de card simples) ── */
function kpiBody(value: ReactNode, accent?: boolean, sub?: ReactNode) {
  return (
    <div className="flex h-full flex-col justify-center">
      <div className={`text-[22px] font-extrabold leading-tight ${accent ? 'text-ok' : 'text-ink'}`}>
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
  { id: 'roas', category: 'Geral', title: 'ROAS', w: 3, h: 2, accent: true, render: (d) => kpiBody(d.roas.toFixed(2), true) },
  { id: 'cpa', category: 'Geral', title: 'CPA', w: 3, h: 2, render: (d) => kpiBody(BRL(d.cpa)) },
  { id: 'faturamento_bruto', category: 'Geral', title: 'Faturamento Bruto', w: 3, h: 2, render: (d) => kpiBody(BRL(d.faturamentoBruto)) },
  { id: 'margem', category: 'Geral', title: 'Margem', w: 3, h: 2, accent: true, render: (d) => kpiBody(PCT(d.margem), true) },
  { id: 'arpu', category: 'Geral', title: 'ARPU', w: 3, h: 2, render: (d) => kpiBody(BRL(d.arpu)) },
  { id: 'faturamento_liquido', category: 'Geral', title: 'Faturamento Líquido', w: 3, h: 2, render: (d) => kpiBody(BRL(d.faturamentoLiquido)) },
  { id: 'roi', category: 'Geral', title: 'ROI', w: 3, h: 2, accent: true, render: (d) => kpiBody(d.roi.toFixed(2), true) },
  { id: 'lucro', category: 'Geral', title: 'Lucro', w: 3, h: 2, accent: true, render: (d) => kpiBody(BRL(d.lucro), true) },
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

  // ── Gráficos Avançados ──
  {
    id: 'lucro_horario',
    category: 'Gráficos Avançados',
    title: 'Lucro por Horário',
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
  { i: 'posicionamento', x: 0, y: 6, w: 5, h: 4 },
  { i: 'aprovacao', x: 5, y: 6, w: 4, h: 3 },
  { i: 'taxas', x: 9, y: 6, w: 3, h: 2 },
  { i: 'imposto_total', x: 9, y: 8, w: 3, h: 2 },
  { i: 'reembolso', x: 0, y: 10, w: 3, h: 2 },
  { i: 'chargeback', x: 3, y: 10, w: 3, h: 2 },
  { i: 'vendas_pendentes', x: 6, y: 10, w: 3, h: 2 },
  { i: 'vendas_reembolsadas', x: 9, y: 10, w: 3, h: 2 },
  { i: 'lucro_horario', x: 0, y: 12, w: 12, h: 4 },
]

export const DEFAULT_ENABLED = DEFAULT_LAYOUT.map((l) => l.i)
