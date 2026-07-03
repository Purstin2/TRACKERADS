import { useEffect, useState } from 'react'
import { Sunrise, RefreshCw, ChevronDown, ChevronUp, X } from 'lucide-react'
import { remoteGet, remoteSet } from '@/lib/appState'
import { toast } from '@/components/ui/toast'

/**
 * Briefing matinal (PurstinLab 3.0): mostra o último resultado do motor de
 * regras do servidor (/api/briefing) e permite gerar na hora. O cron externo
 * (cron-job.org) chama o endpoint todo dia; aqui é a janela pra ele.
 */

interface LastBriefing {
  ts: string
  text: string
  counts?: { escalar: number; matar: number; perto: number }
}

// mesmo storage do módulo Pixel (aba Conexões) — evita pedir o secret 2×
function getSecret(): string {
  try { return JSON.parse(localStorage.getItem('purstin_pixel') || '{}').webhookSecret || '' } catch { return '' }
}

const fmtTs = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function BriefingCard() {
  const [brief, setBrief] = useState<LastBriefing | null>(null)
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [phone, setPhone] = useState('')

  useEffect(() => {
    remoteGet<LastBriefing>('last_briefing').then((b) => b?.text && setBrief(b))
    remoteGet<string>('briefing_phone').then((p) => p && setPhone(String(p)))
  }, [])

  async function runNow() {
    const secret = getSecret()
    if (!secret) return toast('Defina o Segredo do Webhook em Pixel → Conexões primeiro', 'err')
    setRunning(true)
    try {
      const r = await fetch(`/api/briefing?secret=${encodeURIComponent(secret)}`)
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      const b = await remoteGet<LastBriefing>('last_briefing')
      if (b?.text) { setBrief(b); setOpen(true) }
      const c = j.counts || {}
      toast(`Briefing gerado: ${c.escalar || 0} escalar · ${c.matar || 0} matar · ${c.perto || 0} perto${j.wa?.ok ? ' · WhatsApp enviado' : ''}`, 'ok')
    } catch (e: any) {
      toast('Erro no briefing: ' + e.message, 'err')
    }
    setRunning(false)
  }

  async function savePhone() {
    await remoteSet('briefing_phone', phone.replace(/\D/g, ''))
    toast(phone.trim() ? 'Telefone salvo — o briefing chega no seu WhatsApp' : 'Telefone removido (briefing só no painel)', 'ok')
    setCfgOpen(false)
  }

  const c = brief?.counts

  return (
    <div className="mb-4 rounded-xl2 border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <Sunrise className="h-4 w-4 text-warn" />
        <span className="text-[12.5px] font-bold">Briefing do dia</span>
        {brief ? (
          <>
            <span className="font-mono text-[11px] text-muted2">{fmtTs(brief.ts)}</span>
            {c && (
              <span className="flex items-center gap-1.5 text-[11px] font-bold">
                {c.escalar > 0 && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-ok">{c.escalar} escalar</span>}
                {c.matar > 0 && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-danger">{c.matar} matar</span>}
                {c.perto > 0 && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-brand-2">{c.perto} perto</span>}
                {!c.escalar && !c.matar && !c.perto && <span className="rounded-full bg-surface2 px-2 py-0.5 text-muted2">sem ação hoje</span>}
              </span>
            )}
          </>
        ) : (
          <span className="text-[11.5px] text-muted2">o motor de regras avalia a régua no servidor e te avisa — gere o primeiro</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setCfgOpen(true)} title="Configurar telefone do WhatsApp que recebe o briefing" className="rounded border border-border px-2 py-1 text-[11px] text-muted2 hover:border-brand hover:text-brand-2">
            {phone ? `📱 ···${phone.slice(-4)}` : '📱 WhatsApp'}
          </button>
          <button onClick={runNow} disabled={running} className="btn btn-ghost btn-sm !py-1 text-[11px]">
            <RefreshCw className={`h-3 w-3 ${running ? 'animate-spin' : ''}`} /> {running ? 'Avaliando régua…' : 'Gerar agora'}
          </button>
          {brief && (
            <button onClick={() => setOpen((v) => !v)} className="text-muted2 hover:text-ink">
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {open && brief && (
        <div className="border-t border-border px-4 py-3">
          <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink">{brief.text}</pre>
          <p className="mt-2 text-[10.5px] text-muted2">
            Automático todo dia: aponte um cron (cron-job.org) pra <code className="rounded bg-surface2 px-1 font-mono">/api/briefing?secret=SEU_SEGREDO</code> às 08:00.
          </p>
        </div>
      )}

      {cfgOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCfgOpen(false)}>
          <div className="card w-full max-w-[400px]" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <h3 className="text-[13px] font-bold">📱 WhatsApp do briefing</h3>
              <button onClick={() => setCfgOpen(false)} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <div className="card-body flex flex-col gap-3">
              <p className="text-[11.5px] text-muted2">
                Número (com DDI, ex. <b>5547999451764</b>) que recebe o briefing. Deixe vazio pra receber só aqui no painel.
                Dica: mande um &ldquo;oi&rdquo; pro número da Cloud API de vez em quando — mensagem de texto livre só entrega dentro da janela de 24h.
              </p>
              <div className="field !mb-0">
                <label>Telefone (só dígitos, com 55)</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5547999999999" />
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => setCfgOpen(false)}>Cancelar</button>
                <button className="btn btn-primary btn-sm" onClick={savePhone}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
