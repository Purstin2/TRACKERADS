import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { setEntityStatus } from '@/lib/meta'
import { useMonitor } from '../MonitorContext'
import { addAction, todayBR } from '../actionLog'
import { toast } from '@/components/ui/toast'

/** Switch ligado/desligado da coluna STATUS — o mesmo gesto do gerenciador.
 *  Escrever na Meta é irreversível de graça (reaquece aprendizado), então o
 *  clique abre uma confirmação curta em vez de disparar direto. Toda troca
 *  entra no log de ações, igual aos ajustes de orçamento. */
export default function StatusSwitch({
  accId,
  entityId,
  name,
  status,
  cur,
  level,
}: {
  accId: string
  entityId: string
  name: string
  status?: string
  cur: string
  level: 'campaign' | 'adset' | 'ad'
}) {
  const m = useMonitor()
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ask) return
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return
      setAsk(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ask])

  /* A confirmação vai num portal com position:fixed: dentro da <td> ela era
     recortada pelo overflow da caixa de rolagem da tabela e só aparecia um
     pedaço do balão. Fecha ao rolar, senão fica flutuando fora do lugar. */
  useLayoutEffect(() => {
    if (!ask) return setPos(null)
    const place = () => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const W = 212
      setPos({
        top: Math.min(r.bottom + 6, window.innerHeight - 150),
        left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)),
      })
    }
    place()
    const close = () => setAsk(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [ask])

  if (!status) return <span className="text-[11px] text-muted2">—</span>

  const on = status === 'ACTIVE'
  // Status que não são um simples liga/desliga (em revisão, com erro, arquivado)
  // não viram switch — mostrar um switch aqui mentiria sobre o que o clique faz.
  const editable = on || /^(PAUSED|CAMPAIGN_PAUSED|ADSET_PAUSED)$/.test(status)
  const target = on ? 'PAUSED' : 'ACTIVE'
  const LABEL: Record<string, string> = {
    ACTIVE: 'Ativa',
    PAUSED: 'Pausada',
    CAMPAIGN_PAUSED: 'Camp. pausada',
    ADSET_PAUSED: 'Conj. pausado',
    IN_PROCESS: 'Em análise',
    WITH_ISSUES: 'Com erro',
    ARCHIVED: 'Arquivada',
    DELETED: 'Excluída',
  }

  if (!editable)
    return (
      <span title={status} className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-bold text-muted2">
        {LABEL[status] || status}
      </span>
    )

  async function apply() {
    if (!m.token.trim()) return toast('Cole o access token primeiro', 'err')
    setBusy(true)
    try {
      await setEntityStatus(entityId, target, m.token.trim())
      m.patchStatus(accId, entityId, target)
      // 'nota' na reativação de propósito: 'escala' entraria no lastScale/tracker de
      // orçamento e mentiria que houve aumento de verba.
      addAction({
        accId,
        name,
        campId: entityId,
        kind: target === 'PAUSED' ? 'pause' : 'nota',
        sim: false,
        cur,
        dateBR: todayBR(),
        detail: `${target === 'PAUSED' ? 'Pausado' : 'Reativado'} pelo switch (${level === 'campaign' ? 'campanha' : level === 'adset' ? 'conjunto' : 'anúncio'})`,
      })
      toast(target === 'PAUSED' ? 'Pausado na Meta' : 'Reativado na Meta', 'ok')
      setAsk(false)
    } catch (e: any) {
      toast('Erro: ' + e.message, 'err')
    }
    setBusy(false)
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy}
        onClick={() => setAsk((a) => !a)}
        title={on ? 'Ativa — clique para pausar' : 'Pausada — clique para ativar'}
        className={`relative h-[19px] w-[34px] shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          on ? 'bg-brand' : 'bg-border2'
        }`}
      >
        <span
          className={`absolute top-[2.5px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all ${
            on ? 'left-[17px]' : 'left-[2.5px]'
          }`}
        />
      </button>

      {ask &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[100] w-[212px] rounded-[10px] border border-border bg-surface p-3 shadow-card"
          >
            <div className="text-[12px] font-semibold text-ink">
              {on ? 'Pausar na Meta?' : 'Reativar na Meta?'}
            </div>
            <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted2" title={name}>
              {name}
            </div>
            <div className="mt-2.5 flex gap-1.5">
              <button
                onClick={() => setAsk(false)}
                className="flex-1 rounded-[7px] border border-border px-2 py-1.5 text-[11.5px] font-semibold text-muted hover:text-ink"
              >
                Cancelar
              </button>
              <button
                onClick={apply}
                disabled={busy}
                className={`flex-1 rounded-[7px] px-2 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-60 ${
                  on ? 'bg-danger' : 'bg-ok'
                }`}
              >
                {busy ? '…' : on ? 'Pausar' : 'Ativar'}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
