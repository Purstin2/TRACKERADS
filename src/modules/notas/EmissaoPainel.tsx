/* ── Testar a emissão e ver por que ela falha ─────────────────────────────────
 * Até aqui, disparar o lote e ler o motivo de uma recusa só era possível pelo
 * terminal, com o segredo do webhook na URL. Ou seja: quem usa o sistema não
 * conseguia nem testar nem descobrir o que deu errado — a mensagem da SEFAZ,
 * que é exatamente a informação que resolve o problema, ficava presa no banco.
 *
 * Dois botões, e a diferença entre eles é deliberada:
 *   SIMULAR  — não fala com a SEFAZ. Mostra quantas notas sairiam e quais
 *              pedidos entram. É o que se usa pra conferir antes.
 *   EMITIR 1 — emite UMA nota de verdade, e pede confirmação. Uma só porque
 *              documento fiscal não se testa em lote: se erra numa, erra em
 *              todas, e desfazer custa nota de cancelamento.
 * ───────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from 'react'
import { Play, FlaskConical, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { authHeaders } from '@/lib/supabase'

interface ErroNota {
  produto_nome: string | null
  valor: number | null
  tipo: string | null
  erro: string | null
  atualizada_em: string | null
}
interface Saude {
  em?: string
  ok?: boolean
  ambiente?: string
  emitidas?: number
  erros?: number
  restaram?: number
  travados?: number
  erro?: string | null
}

const quando = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export default function EmissaoPainel() {
  const [saude, setSaude] = useState<Saude | null>(null)
  const [erros, setErros] = useState<ErroNota[]>([])
  const [rodando, setRodando] = useState<'' | 'seco' | 'real'>('')
  const [saida, setSaida] = useState<any>(null)

  const carregar = useCallback(async () => {
    try {
      const h = await authHeaders()
      const j = await (await fetch('/api/mobile?fn=notas-status', { headers: h })).json()
      setSaude(j.saude || null)
      setErros(j.erros || [])
    } catch {
      /* painel que quebra a tela é pior que painel nenhum */
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function rodar(real: boolean) {
    if (
      real &&
      !confirm('Emitir UMA nota fiscal de verdade agora?\n\nEm produção isso gera documento fiscal, que só se desfaz com nota de cancelamento.')
    ) return

    setRodando(real ? 'real' : 'seco')
    setSaida(null)
    try {
      const h = await authHeaders()
      const q = real ? 'fn=notas-rodar&seco=0&max=1' : 'fn=notas-rodar&seco=1'
      setSaida(await (await fetch(`/api/mobile?${q}`, { method: 'POST', headers: h })).json())
      await carregar()
    } catch (e: any) {
      setSaida({ ok: false, erro: e?.message || 'falha na chamada' })
    }
    setRodando('')
  }

  const simuladas = (saida?.detalhes || []).filter((d: any) => d.status === 'simulado').length

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold">Testar emissão</h3>
        <span className="text-[11.5px] text-muted2">
          última rodada {quando(saude?.em)}
          {saude?.ambiente && <span className="ml-1.5">· {saude.ambiente}</span>}
        </span>
      </div>

      <div className="card-body flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => rodar(false)} disabled={!!rodando}>
            {rodando === 'seco' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
            Simular (não emite)
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => rodar(true)} disabled={!!rodando}>
            {rodando === 'real' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Emitir 1 de verdade
          </button>
        </div>

        {/* resultado da rodada que acabou de acontecer */}
        {saida && (
          <div
            className={`rounded-[9px] border px-3 py-2.5 text-[12px] ${
              saida.ok === false ? 'border-danger/40 bg-danger/[0.07]' : 'border-ok/30 bg-ok/[0.05]'
            }`}
          >
            <div className="flex items-start gap-2">
              {saida.ok === false ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
              )}
              <div className="min-w-0">
                {saida.erro ? (
                  <div className="font-semibold text-danger">{saida.erro}</div>
                ) : saida.pulado ? (
                  <div className="text-warn">{saida.pulado}</div>
                ) : (
                  <div className="text-ink">
                    {simuladas > 0 ? (
                      <>
                        <b>{simuladas}</b> nota(s) sairiam · {saida.pedidos} pedido(s) na fila
                      </>
                    ) : (
                      <>
                        <b>{saida.emitidas || 0}</b> emitida(s) · <b>{saida.erros || 0}</b> com erro · {saida.restaram || 0} na espera
                      </>
                    )}
                  </div>
                )}
                {(saida.detalhes || []).slice(0, 3).map((d: any, i: number) => (
                  <div key={i} className="mt-1 text-[11.5px] text-muted2">
                    {d.item} — {d.status}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* O QUE A SEFAZ RESPONDEU nas notas que falharam. É a única coisa que
            diz como consertar, e até agora só aparecia no terminal. */}
        {erros.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted2">
              Recusas registradas ({erros.length})
            </div>
            <div className="flex flex-col gap-1">
              {erros.map((e, i) => (
                <div key={i} className="rounded-[9px] border border-danger/25 bg-danger/[0.05] px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                    <b className="text-ink">{e.produto_nome || '—'}</b>
                    <span className="text-muted2">{quando(e.atualizada_em)}</span>
                  </div>
                  <div className="mt-0.5 break-words text-[11.5px] text-danger">{e.erro}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {erros.length === 0 && !saida && (
          <div className="text-[12px] text-muted2">
            Nenhuma recusa registrada. Use <b>Simular</b> pra ver o que sairia sem emitir nada.
          </div>
        )}
      </div>
    </div>
  )
}
