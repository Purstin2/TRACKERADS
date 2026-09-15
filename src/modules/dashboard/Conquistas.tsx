/* ── Conquistas de faturamento ────────────────────────────────────────────────
 * Marcos acumulados de faturamento APROVADO, desde sempre — não respeita o
 * filtro de período do Dashboard de propósito: marco é história, não recorte.
 *
 * Guarda a DATA em que cada marco caiu. É o que transforma um número grande em
 * conquista: "bati 100k em 12/07" diz algo que "faturamento: 321.450" não diz.
 * A data sai de uma soma corrida sobre os pedidos em ordem cronológica — o
 * primeiro pedido que empurra o acumulado por cima do marco é o que o carimba.
 *
 * Consulta enxuta (só valor + data): o widget roda no Dashboard junto com todo
 * o resto, e puxar as 30 colunas de ORDER_COLS aqui seria desperdício.
 * ───────────────────────────────────────────────────────────────────────────── */
import { useEffect, useState } from 'react'
import { Trophy, Loader2 } from 'lucide-react'
import { supabase, fetchAll } from '@/lib/supabase'

const MARCOS = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000]

const rotulo = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toString().replace('.', ',')}M` : `${v / 1000}k`

const BRL = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const curto = (v: number) =>
  v >= 1_000_000
    ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}M`
    : v >= 1000
      ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
      : BRL(v)

const dataBR = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '')

interface Marco {
  valor: number
  batido: boolean
  em: string // YYYY-MM-DD do dia em que caiu
}

export default function Conquistas() {
  const [total, setTotal] = useState(0)
  const [marcos, setMarcos] = useState<Marco[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const sb = supabase()
      if (!sb) {
        if (vivo) { setErro('Sem conexão com a Supabase'); setCarregando(false) }
        return
      }
      try {
        const linhas = await fetchAll<{ value: number | null; ordered_at: string | null; created_at: string | null }>(
          (de, ate) =>
            sb
              .from('kirvano_orders')
              .select('value,ordered_at,created_at')
              .eq('status', 'APPROVED')
              .order('ordered_at', { ascending: true })
              .range(de, ate) as any,
        )
        if (!vivo) return

        // soma corrida em ordem cronológica: o pedido que cruza o marco o carimba
        const ordenado = linhas
          .map((l) => ({ v: Number(l.value) || 0, d: String(l.ordered_at || l.created_at || '').slice(0, 10) }))
          .filter((l) => l.d)
          .sort((a, b) => a.d.localeCompare(b.d))

        let acumulado = 0
        let i = 0
        const saida: Marco[] = MARCOS.map((m) => ({ valor: m, batido: false, em: '' }))
        for (const l of ordenado) {
          acumulado += l.v
          while (i < saida.length && acumulado >= saida[i].valor) {
            saida[i].batido = true
            saida[i].em = l.d
            i++
          }
        }
        setTotal(acumulado)
        setMarcos(saida)
      } catch (e: any) {
        if (vivo) setErro(e?.message || 'Falha ao carregar')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [])

  if (carregando) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[12px] text-muted2">
        <Loader2 size={14} className="animate-spin" /> somando o histórico…
      </div>
    )
  }
  if (erro) {
    return <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-muted2">{erro}</div>
  }

  const conquistados = marcos.filter((m) => m.batido)
  const proximo = marcos.find((m) => !m.batido)
  const anterior = conquistados.length ? conquistados[conquistados.length - 1].valor : 0
  const faixa = proximo ? proximo.valor - anterior : 1
  const andado = proximo ? Math.min(1, Math.max(0, (total - anterior) / faixa)) : 1
  const falta = proximo ? proximo.valor - total : 0

  return (
    <div className="flex h-full flex-col gap-3.5 overflow-hidden">
      {/* acumulado + próximo alvo */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.14em] text-muted2">Faturamento de todos os tempos</div>
          <div className="mt-1 text-[30px] font-bold leading-none tracking-[-.04em] tabular-nums">{BRL(total)}</div>
        </div>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand text-brand-ink">
          <Trophy size={17} strokeWidth={2.4} />
        </div>
      </div>

      {/* barra até o próximo marco */}
      {proximo ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-[11.5px]">
            <span className="text-muted">
              Próximo marco <b className="font-bold text-ink">{rotulo(proximo.valor)}</b>
            </span>
            <span className="tabular-nums text-muted2">faltam {curto(falta)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-700"
              style={{ width: `${(andado * 100).toFixed(1)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-[10px] bg-brand px-3 py-2 text-[12px] font-bold text-brand-ink">
          Todos os marcos batidos. Hora de inventar marco novo.
        </div>
      )}

      {/* trilha de marcos */}
      <div className="flex flex-wrap content-start gap-1.5 overflow-y-auto">
        {marcos.map((m) => (
          <div
            key={m.valor}
            title={m.batido ? `${rotulo(m.valor)} batido em ${dataBR(m.em)}` : `${rotulo(m.valor)} — ainda não`}
            className={
              m.batido
                ? 'flex items-center gap-1.5 rounded-[8px] bg-brand px-2.5 py-1.5 text-brand-ink'
                : 'flex items-center gap-1.5 rounded-[8px] border border-border2 px-2.5 py-1.5 text-muted2'
            }
          >
            <span className="text-[12px] font-bold leading-none tabular-nums">{rotulo(m.valor)}</span>
            {m.batido && <span className="text-[10px] font-semibold leading-none opacity-70">{dataBR(m.em)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
