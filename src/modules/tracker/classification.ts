export interface AdCount {
  count: number
  timestamp: string
}

export interface Classification {
  code: string
  label: string
  color: string // cor de texto/borda
  bg: string // classe de fundo
}

const C: Record<string, Classification> = {
  dominante: { code: 'dominante', label: '👑 DOMINANTE', color: 'text-[#c4b5ff]', bg: 'bg-[#8b5cf6]/15 border-[#8b5cf6]/40' },
  escala_conf: { code: 'escala_conf', label: '🚀 ESCALA CONFIRMADA', color: 'text-ok', bg: 'bg-ok/15 border-ok/40' },
  escalando: { code: 'escalando', label: '📈 ESCALANDO', color: 'text-ok', bg: 'bg-ok/10 border-ok/30' },
  acelerando: { code: 'acelerando', label: '⚡ ACELERANDO', color: 'text-[#5ee0a0]', bg: 'bg-[#5ee0a0]/10 border-[#5ee0a0]/30' },
  validando: { code: 'validando', label: '🔵 VALIDANDO', color: 'text-[#5fa8ff]', bg: 'bg-[#5fa8ff]/10 border-[#5fa8ff]/30' },
  testando: { code: 'testando', label: '🧪 TESTANDO CRIATIVOS', color: 'text-warn', bg: 'bg-warn/10 border-warn/30' },
  esgotando: { code: 'esgotando', label: '🟠 ESGOTANDO', color: 'text-[#f59e0b]', bg: 'bg-[#f59e0b]/10 border-[#f59e0b]/30' },
  morrendo: { code: 'morrendo', label: '🔻 MORRENDO', color: 'text-danger', bg: 'bg-danger/10 border-danger/30' },
  morta: { code: 'morta', label: '💀 MORTA', color: 'text-muted2', bg: 'bg-surface2 border-border' },
  pausado: { code: 'pausado', label: '⏸ PAUSADO', color: 'text-muted2', bg: 'bg-surface2 border-border' },
  lancamento: { code: 'lancamento', label: '🌱 LANÇAMENTO', color: 'text-[#7eb8ff]', bg: 'bg-[#7eb8ff]/10 border-[#7eb8ff]/30' },
  observar: { code: 'observar', label: '👁 OBSERVAR', color: 'text-muted', bg: 'bg-surface2 border-border' },
  sem_dados: { code: 'sem_dados', label: '— SEM DADOS', color: 'text-muted2', bg: 'bg-surface2 border-border' },
}

function nearestBefore(history: AdCount[], daysAgo: number): number {
  const target = Date.now() - daysAgo * 86400000
  let best: AdCount | null = null
  for (const h of history) {
    if (new Date(h.timestamp).getTime() <= target) best = h
  }
  return best ? best.count : history[0].count
}

export function classifyOffer(history: AdCount[]): Classification {
  if (!history || !history.length) return C.sem_dados
  const sorted = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const last = sorted[sorted.length - 1]
  const current = last.count
  if (current === 0) return C.morta

  const daysSinceUpdate = (Date.now() - new Date(last.timestamp).getTime()) / 86400000
  if (daysSinceUpdate >= 5) return C.pausado
  if (sorted.length < 3) return C.lancamento

  const counts = sorted.map((h) => h.count)
  const peak = Math.max(...counts)
  const c3 = nearestBefore(sorted, 3)
  const c7 = nearestBefore(sorted, 7)
  const c14 = nearestBefore(sorted, 14)
  const change7 = c7 > 0 ? (current - c7) / c7 : 0
  const fromPeak = peak > 0 ? (current - peak) / peak : 0
  const rate3 = c3 > 0 ? (current - c3) / c3 / 3 : 0
  const rate7 = c7 > 0 ? (current - c7) / c7 / 7 : 0

  // coeficiente de variação das últimas leituras (oscilação = teste de criativos)
  const recent = counts.slice(-7)
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length
  const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

  if (current >= 150 && change7 >= -0.1) return C.dominante
  if (current >= 60 && current > c7 && c7 >= c14 && change7 >= 0.15) return C.escala_conf
  if (current >= 40 && change7 >= 0.3) return C.escalando
  if (rate3 > rate7 && change7 > 0.05) return C.acelerando
  if (change7 >= 0.1) return C.validando
  if (cv > 0.3) return C.testando
  if (fromPeak <= -0.35) return C.esgotando
  if (change7 <= -0.4) return C.morrendo
  return C.observar
}

export { C as CLASSIFICATIONS }
