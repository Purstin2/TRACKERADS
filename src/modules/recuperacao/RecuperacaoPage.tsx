/* Aba RECUPERAÇÃO — está compensando o custo?
 *
 * WhatsApp: o recover.js já carimba `wa_status` em cada pedido abandonado
 *   ('sent' → mandou, 'converted' → a pessoa comprou depois). Então a conversão
 *   por oferta sai direto da kirvano_orders, sem cálculo novo.
 * E-mail: vem do Brevo (servidor, pra chave não vazar) cruzado com as vendas.
 * Melodify: tem recuperação própria (WhatsApp+e-mail dele), então entra à parte.
 *
 * ATRIBUIÇÃO: "comprou depois de receber" é TETO — parte compraria mesmo sem a
 * mensagem. Serve pra decidir escalar/desligar, não como causalidade pura.
 */
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, MessageCircle, Mail, Music } from 'lucide-react'
import { fetchOrders, type KirvanoOrder } from '@/modules/pixel/orders'
import { authHeaders } from '@/lib/supabase'

const CUSTO_ZAP = 0.34 // R$ por mensagem de marketing (WhatsApp Cloud API)
const BRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const PERIODOS = [3, 7, 14, 30]

interface LinhaZap {
  oferta: string; enviados: number; mensagens: number; convertidos: number
  taxa: number; receita: number; custo: number; roi: number | null
}
interface CampEmail {
  campanha: string; enviados: number; abertos: number; cliques: number
  converteram: number; receita: number; taxa: number; aberturaPct: number
}
interface RecupMel {
  ok: boolean; enviados?: number; zaps?: number; emails?: number
  pagaram?: number; taxa?: number; receita?: number; custo?: number; roi?: number | null
}

function Roi({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted2">—</span>
  const cor = v >= 2 ? 'text-ok' : v >= 1 ? 'text-warn' : 'text-danger'
  return <span className={`font-bold ${cor}`}>{v.toFixed(1)}x</span>
}

export default function RecuperacaoPage() {
  const [dias, setDias] = useState(7)
  const [orders, setOrders] = useState<KirvanoOrder[]>([])
  const [emails, setEmails] = useState<CampEmail[] | null>(null)
  const [mel, setMel] = useState<RecupMel | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function carregar() {
    setCarregando(true)
    const desde = new Date(Date.now() - dias * 86400000).toISOString()
    try { setOrders(await fetchOrders(desde)) } catch { setOrders([]) }
    authHeaders().then((h) => fetch(`/api/mobile?fn=recup-email&dias=${dias}`, { headers: h })).then((r) => r.json()).then((j) => setEmails(j.ok ? j.campanhas : [])).catch(() => setEmails([]))
    authHeaders().then((h) => fetch(`/api/mobile?fn=recup-melodify&dias=${dias}`, { headers: h })).then((r) => r.json()).then(setMel).catch(() => setMel({ ok: false }))
    setCarregando(false)
  }
  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dias])

  // WhatsApp por oferta — direto dos carimbos do recover.js
  const zap = useMemo<LinhaZap[]>(() => {
    const m: Record<string, LinhaZap> = {}
    orders.forEach((o) => {
      const st = String(o.wa_status || '')
      if (!['sent', 'done', 'converted'].includes(st)) return
      const nome = (o.product || '(sem produto)').slice(0, 34)
      const g = (m[nome] ||= { oferta: nome, enviados: 0, mensagens: 0, convertidos: 0, taxa: 0, receita: 0, custo: 0, roi: null })
      g.enviados++
      g.mensagens += o.wa_attempts || 1
      if (st === 'converted') { g.convertidos++; g.receita += Number(o.value) || 0 }
    })
    return Object.values(m).map((g) => {
      g.custo = +(g.mensagens * CUSTO_ZAP).toFixed(2)
      g.taxa = g.enviados ? +((g.convertidos / g.enviados) * 100).toFixed(1) : 0
      g.receita = +g.receita.toFixed(2)
      g.roi = g.custo > 0 ? +(g.receita / g.custo).toFixed(2) : null
      return g
    }).sort((a, b) => b.enviados - a.enviados)
  }, [orders])

  const totZap = useMemo(() => zap.reduce((a, r) => ({
    enviados: a.enviados + r.enviados, convertidos: a.convertidos + r.convertidos,
    receita: a.receita + r.receita, custo: a.custo + r.custo,
  }), { enviados: 0, convertidos: 0, receita: 0, custo: 0 }), [zap])
  const roiZap = totZap.custo > 0 ? +(totZap.receita / totZap.custo).toFixed(2) : null
  const totEmail = useMemo(() => (emails || []).reduce((a, r) => ({
    enviados: a.enviados + r.enviados, converteram: a.converteram + r.converteram, receita: a.receita + r.receita,
  }), { enviados: 0, converteram: 0, receita: 0 }), [emails])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Recuperação de Venda</h2>
          <p className="mt-0.5 text-[13px] text-muted">Quem abandonou, recebeu mensagem — e comprou depois. WhatsApp (pago por msg) vs E-mail (Brevo, R$40/mês).</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="rounded-[8px] border border-border bg-[#0a0c19] px-3 py-2 text-[12px] text-ink">
            {PERIODOS.map((d) => <option key={d} value={d}>Últimos {d} dias</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={carregar} disabled={carregando}>
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* placar dos dois canais */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="card-header"><h3 className="flex items-center gap-2 text-[13px] font-bold"><MessageCircle className="h-4 w-4 text-ok" /> WhatsApp — todas as ofertas</h3></div>
          <div className="card-body">
            <div className="flex items-end gap-4">
              <div><div className="text-[26px] font-extrabold leading-none"><Roi v={roiZap} /></div><div className="mt-1 text-[11px] text-muted2">retorno sobre o custo</div></div>
              <div className="ml-auto text-right text-[12px]">
                <div><span className="text-muted2">recuperado </span><b className="text-ok">{BRL(totZap.receita)}</b></div>
                <div><span className="text-muted2">custo </span><b>{BRL(totZap.custo)}</b></div>
                <div><span className="text-muted2">saldo </span><b className={totZap.receita - totZap.custo >= 0 ? 'text-ok' : 'text-danger'}>{BRL(totZap.receita - totZap.custo)}</b></div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-muted2">{totZap.enviados} pessoas receberam · {totZap.convertidos} compraram depois</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="flex items-center gap-2 text-[13px] font-bold"><Mail className="h-4 w-4 text-brand-2" /> E-mail — todas as ofertas</h3></div>
          <div className="card-body">
            <div className="flex items-end gap-4">
              <div><div className="text-[26px] font-extrabold leading-none text-ok">{BRL(totEmail.receita)}</div><div className="mt-1 text-[11px] text-muted2">recuperado no período</div></div>
              <div className="ml-auto text-right text-[12px]">
                <div><span className="text-muted2">custo fixo </span><b>R$ 40,00/mês</b></div>
                <div><span className="text-muted2">enviados </span><b>{totEmail.enviados}</b></div>
                <div><span className="text-muted2">compraram </span><b className="text-ok">{totEmail.converteram}</b></div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-muted2">O e-mail é custo fixo: quanto mais usar, mais barato fica por recuperação.</div>
          </div>
        </div>
      </div>

      {/* WhatsApp por oferta */}
      <div className="card">
        <div className="card-header"><h3 className="text-[13px] font-bold">WhatsApp por oferta</h3><span className="text-[11px] text-muted2">R$ {CUSTO_ZAP.toFixed(2)}/mensagem</span></div>
        <div className="card-body overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="text-[10px] uppercase tracking-wide text-muted2">
              <th className="p-2 text-left">Oferta</th><th className="p-2 text-right">Receberam</th><th className="p-2 text-right">Msgs</th>
              <th className="p-2 text-right">Compraram</th><th className="p-2 text-right">Taxa</th><th className="p-2 text-right">Recuperado</th>
              <th className="p-2 text-right">Custo</th><th className="p-2 text-right">ROI</th>
            </tr></thead>
            <tbody>
              {zap.map((r) => (
                <tr key={r.oferta} className="border-t border-border">
                  <td className="p-2" title={r.oferta}>{r.oferta}</td>
                  <td className="p-2 text-right">{r.enviados}</td>
                  <td className="p-2 text-right text-muted2">{r.mensagens}</td>
                  <td className="p-2 text-right font-semibold text-ok">{r.convertidos}</td>
                  <td className="p-2 text-right">{r.taxa}%</td>
                  <td className="p-2 text-right font-semibold">{BRL(r.receita)}</td>
                  <td className="p-2 text-right text-muted">{BRL(r.custo)}</td>
                  <td className="p-2 text-right"><Roi v={r.roi} /></td>
                </tr>
              ))}
              {!zap.length && <tr><td colSpan={8} className="p-4 text-center text-muted2">{carregando ? 'carregando…' : 'nenhum envio de WhatsApp no período'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* E-mail por campanha */}
      <div className="card">
        <div className="card-header"><h3 className="text-[13px] font-bold">E-mail por campanha</h3><span className="text-[11px] text-muted2">Brevo · custo fixo mensal</span></div>
        <div className="card-body overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="text-[10px] uppercase tracking-wide text-muted2">
              <th className="p-2 text-left">Campanha (assunto)</th><th className="p-2 text-right">Enviados</th><th className="p-2 text-right">Abertura</th>
              <th className="p-2 text-right">Cliques</th><th className="p-2 text-right">Compraram</th><th className="p-2 text-right">Taxa</th><th className="p-2 text-right">Recuperado</th>
            </tr></thead>
            <tbody>
              {(emails || []).map((c) => (
                <tr key={c.campanha} className="border-t border-border">
                  <td className="p-2" title={c.campanha}>{c.campanha}</td>
                  <td className="p-2 text-right">{c.enviados}</td>
                  <td className="p-2 text-right text-muted2">{c.aberturaPct}%</td>
                  <td className="p-2 text-right text-muted2">{c.cliques}</td>
                  <td className="p-2 text-right font-semibold text-ok">{c.converteram}</td>
                  <td className="p-2 text-right">{c.taxa}%</td>
                  <td className="p-2 text-right font-semibold">{BRL(c.receita)}</td>
                </tr>
              ))}
              {emails && !emails.length && <tr><td colSpan={7} className="p-4 text-center text-muted2">nenhum e-mail de recuperação no período</td></tr>}
              {!emails && <tr><td colSpan={7} className="p-4 text-center text-muted2">carregando…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Melodify (recuperação própria) */}
      <div className="card">
        <div className="card-header"><h3 className="flex items-center gap-2 text-[13px] font-bold"><Music className="h-4 w-4 text-brand-2" /> Melodify — recuperação própria</h3></div>
        <div className="card-body">
          {!mel ? <div className="text-[12px] text-muted2">carregando…</div>
            : !mel.ok ? <div className="text-[12px] text-muted2">indisponível</div>
            : (
              <div className="flex flex-wrap items-end gap-6 text-[12px]">
                <div><div className="text-[22px] font-extrabold leading-none"><Roi v={mel.roi ?? null} /></div><div className="mt-1 text-[11px] text-muted2">ROI</div></div>
                <div><b>{mel.enviados}</b> <span className="text-muted2">receberam</span></div>
                <div><b className="text-ok">{mel.pagaram}</b> <span className="text-muted2">pagaram ({mel.taxa}%)</span></div>
                <div><b>{BRL(mel.receita || 0)}</b> <span className="text-muted2">recuperado</span></div>
                <div><b>{BRL(mel.custo || 0)}</b> <span className="text-muted2">custo zap</span></div>
                <div className="text-muted2">{mel.zaps} zaps · {mel.emails} e-mails</div>
              </div>
            )}
        </div>
      </div>

      <p className="text-[11px] text-muted2">
        <b>Como ler:</b> "comprou depois de receber" é <b>teto de atribuição</b> — parte dessas pessoas compraria mesmo sem a mensagem.
        Use pra decidir escalar ou cortar: ROI abaixo de 1x significa que o WhatsApp está custando mais do que traz.
      </p>
    </div>
  )
}
