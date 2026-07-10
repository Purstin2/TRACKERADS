import { useState } from 'react'
import { Download, Trash2, Plus, Check, Pencil, Bell, Zap } from 'lucide-react'
import {
  useLog,
  openLog,
  updateAction,
  deleteAction,
  clearActionLog,
  todayBR,
  KIND_LABEL,
  KIND_CLS,
  type ActionEntry,
} from './actionLog'
import { ImpactBtn } from './BudgetImpact'
import { trunc, curSym } from './config'
import { getBudget, setBudget } from '@/lib/meta'
import { useMonitor } from './MonitorContext'
import { toast } from '@/components/ui/toast'

/** "Tornar real": aplica na Meta um ajuste de orçamento que foi registrado como simulado
 *  e tira a marcação [simulado] da entrada. Mesma mecânica do BudgetModal: CBO aplica o
 *  valor direto; ABO rateia o fator novo/atual em cada adset ativo. */
function MakeRealBtn({ e }: { e: ActionEntry }) {
  const m = useMonitor()
  const [busy, setBusy] = useState(false)
  if (!m.token?.trim()) return null

  async function run() {
    const sym = curSym(e.cur || 'USD')
    const target = e.budgetAfter!
    setBusy(true)
    try {
      const info = await getBudget(e.campId!, m.token.trim())
      if (!info.items.length) throw new Error('nenhum item ativo com orçamento nessa campanha')
      const curTotal = info.total / 100
      const mudou = e.budgetBefore != null && Math.abs(curTotal - e.budgetBefore) > 0.01
      const ok = confirm(
        `Aplicar de verdade na Meta?\n\n${e.name}\n` +
          `Orçamento atual: ${sym}${curTotal.toFixed(2)}/dia\n` +
          `Novo orçamento: ${sym}${target.toFixed(2)}/dia` +
          (mudou ? `\n\n⚠ O orçamento atual difere do registrado na simulação (${sym}${e.budgetBefore!.toFixed(2)}).` : ''),
      )
      if (!ok) { setBusy(false); return }
      const factor = curTotal > 0 ? target / curTotal : 1
      for (const it of info.items) {
        const cents = info.items.length === 1 ? Math.round(target * 100) : Math.round(it.daily * factor)
        await setBudget(it.id, cents, m.token.trim())
      }
      updateAction(e.id, {
        sim: false,
        ts: new Date().toISOString(), // a mudança valeu AGORA — trackers de ritmo/impacto usam o ts
        dateBR: todayBR(),
        budgetBefore: Math.round(curTotal * 100) / 100,
        spendAtTime: null, // foto da simulação é velha; sem foto real do momento, melhor nenhum
        salesAtTime: null,
        detail: (e.detail || '').replace(/\s*\[simulado\]/, '') + ' · tornado real',
      })
      toast(`Aplicado na Meta: ${sym}${target.toFixed(2)}/dia`, 'ok')
    } catch (err: any) {
      toast('Erro: ' + err.message, 'err')
    }
    setBusy(false)
  }

  return (
    <button
      title="Tornar real — aplica esse orçamento na Meta agora"
      onClick={run}
      disabled={busy}
      className="flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-bold text-warn hover:bg-warn/25 disabled:opacity-50"
    >
      <Zap className="h-3 w-3" /> {busy ? 'Aplicando…' : 'Tornar real'}
    </button>
  )
}

function fmtTs(ts: string) {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const todayKey = () => new Date().toISOString().slice(0, 10)
const fmtDate = (iso?: string) => {
  if (!iso) return ''
  const p = iso.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso
}

export default function AcoesView() {
  const log = useLog()

  const pending = log.filter((e) => e.verifyBy && !e.done)
  const dueNow = pending.filter((e) => e.verifyBy! <= todayKey())

  function exportLog(fmt: 'json' | 'csv') {
    if (!log.length) return
    let blob: Blob
    let fn: string
    if (fmt === 'json') {
      blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' })
      fn = 'acoes.json'
    } else {
      const head = 'data,conta,campanha,acao,orc_antes,orc_depois,roas,lucro,verificar,detalhe\n'
      const body = log
        .map(
          (l) =>
            `"${l.ts}","${l.account}","${l.name}","${l.kind}","${l.budgetBefore ?? ''}","${l.budgetAfter ?? ''}","${l.roasAtTime ?? ''}","${l.profitAtTime ?? ''}","${l.verifyBy ?? ''}","${(l.detail || '').replace(/"/g, '""')}"`,
        )
        .join('\n')
      blob = new Blob([head + body], { type: 'text/csv' })
      fn = 'acoes.csv'
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fn
    a.click()
  }

  const editEntry = (e: ActionEntry) =>
    openLog({
      editId: e.id,
      name: e.name,
      accId: e.accId,
      kind: e.kind,
      budgetBefore: e.budgetBefore,
      budgetAfter: e.budgetAfter,
      roasAtTime: e.roasAtTime,
      profitAtTime: e.profitAtTime,
      verifyBy: e.verifyBy,
      detail: e.detail,
      linkedName: e.linkedName,
      cur: e.cur,
    })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold">Log de mudanças {log.length > 0 && `· ${log.length}`}</span>
        <button className="btn btn-primary btn-sm" onClick={() => openLog()}>
          <Plus className="h-3 w-3" /> Registrar ação
        </button>
        {log.length > 0 && (
          <>
            <button className="btn btn-ghost btn-sm ml-auto" onClick={() => exportLog('csv')}>
              <Download className="h-3 w-3" /> CSV
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => exportLog('json')}>
              <Download className="h-3 w-3" /> JSON
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (confirm('Limpar todo o log de ações?')) clearActionLog()
              }}
            >
              <Trash2 className="h-3 w-3" /> Limpar
            </button>
          </>
        )}
      </div>

      {/* lembretes de verificação */}
      {dueNow.length > 0 && (
        <div className="rounded-xl2 border border-warn/30 bg-warn/[0.08] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-warn">
            <Bell className="h-3.5 w-3.5" /> {dueNow.length} verificação(ões) pendente(s)
          </div>
          <div className="flex flex-col gap-1.5">
            {dueNow.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold">{trunc(e.name, 36)}</span>
                <span className="text-muted2">— {e.detail || KIND_LABEL[e.kind]}</span>
                <span className="ml-auto text-[11px] text-warn">prazo {fmtDate(e.verifyBy)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => updateAction(e.id, { done: true })}>
                  <Check className="h-3 w-3" /> Verifiquei
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {log.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
          <h3 className="text-lg font-bold">Nenhuma ação registrada</h3>
          <p className="mt-1 text-[13px] text-muted">
            Registre o que você fez em cada campanha (escala, aumento de orçamento, duplicação) com o ROAS/orçamento do
            momento — assim você descobre se mexer afeta a campanha.
          </p>
          <button className="btn btn-primary btn-sm mx-auto mt-4" onClick={() => openLog()}>
            <Plus className="h-3 w-3" /> Registrar primeira ação
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted2">
                <th className="py-2 pl-4 text-left">Data/Hora</th>
                <th className="py-2 text-left">Campanha</th>
                <th className="py-2 text-left">Ação</th>
                <th className="py-2 text-right">Orçamento</th>
                <th className="py-2 text-right">ROAS</th>
                <th className="py-2 text-right">Lucro</th>
                <th className="py-2 text-left">Verificar</th>
                <th className="py-2 text-left">Detalhe</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {log.map((e) => {
                const sym = curSym(e.cur || 'USD')
                const due = e.verifyBy && !e.done && e.verifyBy <= todayKey()
                return (
                  <tr key={e.id} className={`border-b border-border/50 ${due ? 'bg-warn/[0.05]' : ''}`}>
                    <td className="py-1.5 pl-4 font-mono text-muted2">{fmtTs(e.ts)}</td>
                    <td className="py-1.5">
                      <div title={e.name}>{trunc(e.name, 30)}</div>
                      {e.linkedName && <div className="text-[10px] text-warn">🔗 dup de {trunc(e.linkedName, 24)}</div>}
                      <div className="text-[10px] text-muted2">{e.account}</div>
                    </td>
                    <td className="py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_CLS[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                      {e.sim && <span className="ml-1 text-[9px] text-muted2">sim</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {e.budgetBefore != null || e.budgetAfter != null ? (
                        <span>
                          {e.budgetBefore != null ? `${sym}${e.budgetBefore.toFixed(2)}` : '—'}
                          <span className="text-muted2"> → </span>
                          <b>{e.budgetAfter != null ? `${sym}${e.budgetAfter.toFixed(2)}` : '—'}</b>
                        </span>
                      ) : (
                        <span className="text-muted2">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono">{e.roasAtTime != null ? e.roasAtTime.toFixed(2) : '—'}</td>
                    <td className={`py-1.5 text-right font-mono ${e.profitAtTime != null ? (e.profitAtTime >= 0 ? 'text-ok' : 'text-danger') : 'text-muted2'}`}>
                      {e.profitAtTime != null ? `${sym}${e.profitAtTime.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-1.5">
                      {e.verifyBy ? (
                        e.done ? (
                          <span className="text-[11px] text-ok">✓ feito</span>
                        ) : (
                          <span className={`text-[11px] ${due ? 'font-bold text-warn' : 'text-muted'}`}>
                            ⏰ {fmtDate(e.verifyBy)}
                          </span>
                        )
                      ) : (
                        <span className="text-muted2">—</span>
                      )}
                    </td>
                    <td className="max-w-[200px] py-1.5 text-[11px] text-muted2">{e.detail || ''}</td>
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-1">
                        {e.sim && (e.kind === 'orcamento' || e.kind === 'escala') && e.campId && e.budgetAfter != null && (
                          <MakeRealBtn e={e} />
                        )}
                        {(e.kind === 'orcamento' || e.kind === 'escala') && e.campId && (
                          <ImpactBtn accId={e.accId || ''} name={e.name} campId={e.campId} cur={e.cur || 'USD'} />
                        )}
                        {e.verifyBy && !e.done && (
                          <button title="Marcar verificado" onClick={() => updateAction(e.id, { done: true })} className="text-muted2 hover:text-ok">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button title="Editar" onClick={() => editEntry(e)} className="text-muted2 hover:text-brand-2">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button title="Remover" onClick={() => deleteAction(e.id)} className="text-muted2 hover:text-danger">
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
