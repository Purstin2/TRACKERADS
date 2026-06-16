import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, X, Trash2 } from 'lucide-react'

const SEED: Record<string, string> = {
  '2026-06-14': `STL BR — Análise de preço (decisão)
Elasticidade confirmada com dados reais:
• R$59,90 → 13% conv (período ativo com criativos)
• R$64,90 → 10,5% conv (18/mai–1/jun)
• R$69,90 → 8% conv (dias bons; histórico geral contaminado)
Padrão: -2,5pp a cada R$5 de aumento.
Receita/100 cliques: R$778 vs R$681 vs R$559 — R$59,90 vence.

✅ Preço baixado de volta para R$59,90 hoje.
Revisar ~24/06 após 10 dias limpos (sem ban, sem criativo novo no meio).

FESTAS — pendências: social proof + selos no checkout; app entregável na PV.
FIGS — postar mais stories; novos criativos.
STL PT/ES — 6% conv em 12/06 (ban Hotmart). Aguardar 4 dias. Sem orderbump → trocar checkout.
STL BR — ROAS 2,77 nas de 10/06+. Antigas ROAS 1,80 c/ IG desotimizado → aguardar 2 dias.
STL GR — CPA $8, ótimas.
Backlog: sair Hotmart; contingência; remarketing; recuperação e-mail/WhatsApp; novos checkouts.`,
}

function loadNotes(): Record<string, string> {
  try {
    const n = JSON.parse(localStorage.getItem('meta_diario') || 'null')
    if (n && typeof n === 'object') return n
  } catch {}
  localStorage.setItem('meta_diario', JSON.stringify(SEED))
  return { ...SEED }
}

const dKey = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MN = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export default function DiarioView() {
  const [notes, setNotes] = useState<Record<string, string>>(loadNotes)
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [modalKey, setModalKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const save = (n: Record<string, string>) => {
    setNotes({ ...n })
    localStorage.setItem('meta_diario', JSON.stringify(n))
  }
  function openNote(key: string) {
    setModalKey(key)
    setDraft(notes[key] || '')
  }
  function saveNote() {
    if (!modalKey) return
    const n = { ...notes }
    if (draft.trim()) n[modalKey] = draft
    else delete n[modalKey]
    save(n)
    setModalKey(null)
  }
  function deleteNote() {
    if (!modalKey || !confirm('Apagar a anotação deste dia?')) return
    const n = { ...notes }
    delete n[modalKey]
    save(n)
    setModalKey(null)
  }
  function exportTxt() {
    const keys = Object.keys(notes).filter((k) => notes[k].trim()).sort()
    if (!keys.length) return alert('Nenhuma anotação para exportar.')
    const txt = keys.map((k) => `### ${k}\n${notes[k]}`).join('\n\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }))
    a.download = `diario-ofertas-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
  }
  function moveMonth(delta: number) {
    let m = cursor.m + delta
    let y = cursor.y
    if (m < 0) {
      m = 11
      y--
    }
    if (m > 11) {
      m = 0
      y++
    }
    setCursor({ y, m })
  }

  const { y, m } = cursor
  const first = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const todayKey = dKey(now.getFullYear(), now.getMonth(), now.getDate())
  const noteCount = Object.keys(notes).filter(
    (k) => k.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`) && notes[k].trim(),
  ).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost btn-sm" onClick={() => moveMonth(-1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-[14px] font-bold capitalize">
          {MN[m]} {y}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => moveMonth(1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>
          Hoje
        </button>
        {noteCount > 0 && (
          <span className="text-[11px] text-muted2">📝 {noteCount} dia(s) com anotação</span>
        )}
        <button className="btn btn-ghost btn-sm ml-auto" onClick={exportTxt}>
          <Download className="h-3 w-3" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {DOW.map((d) => (
          <div key={d} className="pb-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted2">
            {d}
          </div>
        ))}
        {Array.from({ length: first }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const d = idx + 1
          const key = dKey(y, m, d)
          const note = notes[key] || ''
          const has = !!note.trim()
          const isToday = key === todayKey
          const isFuture = key > todayKey
          return (
            <button
              key={key}
              onClick={() => openNote(key)}
              className={`flex h-[92px] flex-col rounded-[10px] border p-2 text-left transition-all ${
                isToday ? 'border-brand bg-brand/[0.06]' : 'border-border bg-surface'
              } ${has ? 'hover:border-brand-2' : 'hover:border-border2'} ${isFuture ? 'opacity-45' : ''}`}
            >
              <div className="flex items-center gap-1 text-[12px] font-bold">
                {d}
                {has && <span className="h-1.5 w-1.5 rounded-full bg-brand-2" />}
              </div>
              {has && (
                <div className="mt-1 line-clamp-3 overflow-hidden text-[9px] leading-tight text-muted2">
                  {note}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {modalKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={saveNote}>
          <div className="card w-full max-w-[560px]" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <h3 className="text-[13px] font-bold">
                📅 {WD[new Date(modalKey + 'T00:00:00').getDay()]},{' '}
                {(() => {
                  const [yy, mm, dd] = modalKey.split('-')
                  return `${+dd} de ${MN[+mm - 1]} de ${yy}`
                })()}
              </h3>
              <button onClick={saveNote} className="text-muted2 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="card-body">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={12}
                placeholder={'Como as ofertas estão performando hoje? Ex:\n• MASCOTES — ROAS 2.4, escalei +30%\n• FUTEBOL — caiu pra 1.1, pausei 2 conjuntos'}
                className="w-full resize-y rounded-[9px] border border-border bg-[#0a0c19] p-3 text-[13px] leading-relaxed text-ink"
              />
              <div className="mt-3 flex items-center gap-2">
                {notes[modalKey]?.trim() && (
                  <button className="btn btn-ghost btn-sm mr-auto text-danger" onClick={deleteNote}>
                    <Trash2 className="h-3 w-3" /> Apagar
                  </button>
                )}
                <button className="btn btn-ghost btn-sm ml-auto" onClick={saveNote}>
                  Fechar
                </button>
                <button className="btn btn-primary btn-sm" onClick={saveNote}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
