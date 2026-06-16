import { useEffect, useState } from 'react'
import { RefreshCw, ChevronRight, CheckCircle2, XCircle, Radio } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchLogs, statusMeta, type WebhookLog } from './orders'

export default function LogsView() {
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [auto, setAuto] = useState(false)
  const connected = !!supabase()

  async function load() {
    if (!connected) return
    setLoading(true)
    try {
      setLogs(await fetchLogs(150))
    } catch {}
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  // auto-refresh a cada 10s quando ligado (pra ver o hit chegar em tempo real durante um teste)
  useEffect(() => {
    if (!auto) return
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [auto])

  if (!connected) {
    return (
      <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
        Conecte a Supabase (aba Conexões do Tracker) pra ver os logs. A função do webhook grava cada hit em <code>kirvano_webhook_logs</code>.
      </div>
    )
  }

  const lastHit = logs[0]?.created_at ? new Date(logs[0].created_at) : null
  const okCount = logs.filter((l) => l.ok).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-[9px] border border-border bg-surface px-3 py-1.5 text-[12px]">
          <span className={`h-2 w-2 rounded-full ${lastHit ? 'bg-ok' : 'bg-muted2'}`} />
          {lastHit ? (
            <span className="text-muted">
              Último disparo: <b className="text-ink">{lastHit.toLocaleString('pt-BR')}</b>
            </span>
          ) : (
            <span className="text-muted2">Nenhum disparo recebido ainda</span>
          )}
        </div>
        <span className="text-[11px] text-muted2">{okCount}/{logs.length} ok</span>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <Radio className="h-3 w-3" /> auto (10s)
        </label>
        <button className="btn btn-ghost btn-sm ml-auto" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
          Nenhum webhook recebido. Faça um teste de venda na Kirvano (ou dispare um evento de teste) e ele aparece aqui — é assim que você confirma que <b>está pegando mesmo</b>.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10.5px] uppercase tracking-wide text-muted2">
                <th className="w-8 py-2.5 pl-3"></th>
                <th className="py-2.5 text-left">Quando</th>
                <th className="py-2.5 text-left">Evento</th>
                <th className="py-2.5 text-left">Status</th>
                <th className="py-2.5 text-center">OK</th>
                <th className="py-2.5 text-center">Segredo</th>
                <th className="py-2.5 text-center">CAPI</th>
                <th className="py-2.5 pr-4 text-left">Nota</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const meta = statusMeta(l.status)
                const isOpen = open === l.id
                return (
                  <FragmentRow key={l.id}>
                    <tr className="cursor-pointer border-b border-border/50 hover:bg-surface2/40" onClick={() => setOpen(isOpen ? null : l.id)}>
                      <td className="py-2 pl-3">
                        <ChevronRight className={`h-3.5 w-3.5 text-muted2 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </td>
                      <td className="py-2 font-mono text-[11px] text-muted2">{l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '—'}</td>
                      <td className="py-2 font-mono text-[11px]">{l.event || '—'}</td>
                      <td className="py-2">
                        {l.status ? (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 text-center">{l.ok ? <CheckCircle2 className="mx-auto h-4 w-4 text-ok" /> : <XCircle className="mx-auto h-4 w-4 text-danger" />}</td>
                      <td className="py-2 text-center">{l.secret_ok ? <span className="text-ok">✓</span> : <span className="text-danger">✕</span>}</td>
                      <td className="py-2 text-center">{l.capi_ok ? <span className="text-ok">✓</span> : <span className="text-muted2">—</span>}</td>
                      <td className="py-2 pr-4 text-[11px] text-muted2">{l.message || '—'}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border/50 bg-[#0a0c19]">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="mb-1 flex items-center gap-3 text-[11px] text-muted2">
                            <span>HTTP {l.http_status ?? '—'}</span>
                            <span>gateway: {l.gateway || '—'}</span>
                            {l.ip && <span>IP: {l.ip}</span>}
                          </div>
                          <pre className="max-h-[280px] overflow-auto rounded-[8px] border border-border bg-bg p-3 text-[11px] leading-relaxed text-muted">
                            {l.raw ? JSON.stringify(l.raw, null, 2) : '(sem payload registrado)'}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted2">
        Cada linha é um hit no endpoint. <b>Segredo ✕</b> = a Kirvano mandou sem o token certo (rejeitado). <b>OK ✕</b> = chegou mas o corpo veio quebrado. Clique pra ver o JSON cru que a Kirvano enviou.
      </p>
    </div>
  )
}

// wrapper só pra agrupar a linha + a linha de detalhe sem div inválida dentro de <tbody>
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
