import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { ACCOUNTS } from './config'
import {
  registerLogOpener,
  addAction,
  updateAction,
  getLog,
  type ActionKind,
  type LogPrefill,
  KIND_LABEL,
} from './actionLog'
import { toast } from '@/components/ui/toast'

const KIND_OPTS: ActionKind[] = ['escala', 'orcamento', 'pause', 'duplicacao', 'nota']

interface FormState {
  editId?: string
  name: string
  accId: string
  kind: ActionKind
  budgetBefore: string
  budgetAfter: string
  roasAtTime: string
  profitAtTime: string
  verifyBy: string
  detail: string
  linkedName: string
  cur: string
}

function fromPrefill(p?: LogPrefill): FormState {
  return {
    editId: p?.editId,
    name: p?.name || '',
    accId: p?.accId || ACCOUNTS[0].id,
    kind: p?.kind || 'escala',
    budgetBefore: p?.budgetBefore != null ? String(p.budgetBefore) : '',
    budgetAfter: p?.budgetAfter != null ? String(p.budgetAfter) : '',
    roasAtTime: p?.roasAtTime != null ? String(p.roasAtTime) : '',
    profitAtTime: p?.profitAtTime != null ? String(p.profitAtTime) : '',
    verifyBy: p?.verifyBy || '',
    detail: p?.detail || '',
    linkedName: p?.linkedName || '',
    cur: p?.cur || 'USD',
  }
}

export default function LogActionHost() {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<FormState>(fromPrefill())

  useEffect(() => {
    return registerLogOpener((prefill) => {
      setF(fromPrefill(prefill))
      setOpen(true)
    })
  }, [])

  if (!open) return null

  const set = (k: keyof FormState, v: string) => setF((p) => ({ ...p, [k]: v }))
  const num = (v: string): number | null => (v.trim() === '' ? null : parseFloat(v))

  // sugestões de campanhas já registradas (para vincular duplicação)
  const knownNames = [...new Set(getLog().map((e) => e.name).filter(Boolean))]

  function save() {
    if (!f.name.trim()) return toast('Informe a campanha', 'err')
    const payload = {
      accId: f.accId,
      name: f.name.trim(),
      kind: f.kind,
      sim: false,
      cur: f.cur,
      budgetBefore: num(f.budgetBefore),
      budgetAfter: num(f.budgetAfter),
      roasAtTime: num(f.roasAtTime),
      profitAtTime: num(f.profitAtTime),
      verifyBy: f.verifyBy || undefined,
      detail: f.detail.trim() || undefined,
      linkedName: f.kind === 'duplicacao' ? f.linkedName.trim() || undefined : undefined,
    }
    if (f.editId) updateAction(f.editId, payload)
    else addAction(payload)
    toast(f.editId ? '✓ Registro atualizado' : '✓ Ação registrada', 'ok')
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div className="card max-h-[92vh] w-full max-w-[520px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="text-[13px] font-bold">{f.editId ? 'Editar registro' : 'Registrar ação na campanha'}</h3>
          <button onClick={() => setOpen(false)} className="text-muted2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 gap-3">
            <div className="field col-span-2">
              <label>Campanha</label>
              <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="nome da campanha" />
            </div>
            <div className="field">
              <label>Conta</label>
              <select value={f.accId} onChange={(e) => set('accId', e.target.value)}>
                {ACCOUNTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>O que fiz</label>
              <select value={f.kind} onChange={(e) => set('kind', e.target.value as ActionKind)}>
                {KIND_OPTS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>

            {(f.kind === 'escala' || f.kind === 'orcamento') && (
              <>
                <div className="field">
                  <label>Orçamento antes</label>
                  <input type="number" step="0.01" value={f.budgetBefore} onChange={(e) => set('budgetBefore', e.target.value)} placeholder="ex: 14.70" />
                </div>
                <div className="field">
                  <label>Orçamento depois</label>
                  <input type="number" step="0.01" value={f.budgetAfter} onChange={(e) => set('budgetAfter', e.target.value)} placeholder="ex: 22.00" />
                </div>
              </>
            )}

            {f.kind === 'duplicacao' && (
              <div className="field col-span-2">
                <label>Duplicação de (campanha original)</label>
                <input list="logNames" value={f.linkedName} onChange={(e) => set('linkedName', e.target.value)} placeholder="campanha de onde duplicou" />
                <datalist id="logNames">
                  {knownNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
            )}

            <div className="field">
              <label>ROAS no momento</label>
              <input type="number" step="0.01" value={f.roasAtTime} onChange={(e) => set('roasAtTime', e.target.value)} placeholder="ex: 2.13" />
            </div>
            <div className="field">
              <label>Lucro no momento</label>
              <input type="number" step="0.01" value={f.profitAtTime} onChange={(e) => set('profitAtTime', e.target.value)} placeholder="ex: 55.57" />
            </div>

            <div className="field col-span-2">
              <label>⏰ Verificar em (não esquecer)</label>
              <input type="date" value={f.verifyBy} onChange={(e) => set('verifyBy', e.target.value)} style={{ colorScheme: 'dark' }} />
            </div>
            <div className="field col-span-2">
              <label>Observação</label>
              <textarea
                rows={2}
                value={f.detail}
                onChange={(e) => set('detail', e.target.value)}
                placeholder="ex: subi +50% pra validar se desotimiza durante o dia"
                className="resize-y"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary btn-sm" onClick={save}>
              {f.editId ? 'Salvar' : 'Registrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
