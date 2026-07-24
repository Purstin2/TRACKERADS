import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import { useMonitor } from '../MonitorContext'
import { debugToken } from '@/modules/uploader/lib/fb'

/** Vigia a validade do token do Meta e avisa ANTES de quebrar (checa 1×/sessão). */
function TokenHealth() {
  const m = useMonitor()
  const [info, setInfo] = useState<{ valid: boolean; days: number | null } | null>(null)
  useEffect(() => {
    const t = m.token.trim()
    if (!t) { setInfo(null); return }
    let alive = true
    debugToken(t)
      .then((d) => {
        if (!alive) return
        const days = d.expiresAt > 0 ? Math.floor((d.expiresAt * 1000 - Date.now()) / 86400000) : null
        setInfo({ valid: d.valid, days })
      })
      .catch(() => alive && setInfo(null))
    return () => { alive = false }
  }, [m.token])
  if (!info) return null
  if (!info.valid)
    return (
      <div className="border-b border-danger/30 bg-danger/[0.09] px-4 py-2 text-[12px] font-bold text-danger">
        ⛔ Token do Meta VENCIDO — cole um novo pra voltar a puxar dados.
      </div>
    )
  if (info.days != null && info.days <= 7)
    return (
      <div className="border-b border-warn/30 bg-warn/[0.08] px-4 py-2 text-[12px] font-bold text-warn">
        ⚠ Token vence em {info.days === 0 ? 'HOJE' : `${info.days} dia${info.days > 1 ? 's' : ''}`} — renove antes de perder o acesso.
      </div>
    )
  return null
}

/** Faixas de contexto do que está filtrado agora. Os CONTROLES moram na Toolbar e
 *  na FilterBar; aqui fica só o aviso do que está ligado, com o botão de limpar. */
export default function ContextBar() {
  const m = useMonitor()
  return (
    <>
      <TokenHealth />

      {m.touchedOnly && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand/[0.07] px-4 py-2 text-[12px]">
          <Zap className="h-3.5 w-3.5 shrink-0 text-brand-2" />
          <span className="font-bold text-brand-2">Só as mexidas de hoje</span>
          <span className="text-muted2">
            aumentos de orçamento e duplicações · sumiu tudo? a campanha mexida pode estar fora do{' '}
            <b className="text-muted">Período</b> ou do <b className="text-muted">Status</b> escolhido
          </span>
          <button onClick={() => m.setTouchedOnly(false)} className="ml-auto text-muted2 hover:text-ink">✕ limpar</button>
        </div>
      )}

      {m.campSel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand/[0.07] px-4 py-2 text-[12px]">
          <span className="font-bold text-brand-2">{m.campSel.size} selecionada(s)</span>
          <label className="flex cursor-pointer items-center gap-1.5 text-muted">
            <input type="checkbox" checked={m.onlySelected} onChange={(e) => m.setOnlySelected(e.target.checked)} />
            ver só elas
          </label>
          <button onClick={m.clearCampSel} className="ml-auto text-muted2 hover:text-ink">✕ limpar</button>
        </div>
      )}

      {m.offerFilter && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand/[0.07] px-4 py-2 text-[12px]">
          <span className="font-bold text-brand-2">Filtrado por produto</span>
          <span className="text-muted2">só as campanhas que você pôs nessa oferta</span>
          <button onClick={() => m.setOfferFilter('')} className="ml-auto text-muted2 hover:text-ink">✕ limpar</button>
        </div>
      )}
    </>
  )
}
