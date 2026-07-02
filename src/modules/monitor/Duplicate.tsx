import { useEffect, useMemo, useState } from 'react'
import { Copy, X, GitBranch } from 'lucide-react'
import { useMonitor } from './MonitorContext'
import { addAction, todayBR, duplicationsFor, useLog, type ActionEntry } from './actionLog'
import { copyCampaign, fetchCampaignName, renameEntity, getBudget, setBudget, fetchCampDaily, fetchCampaignMeta, getSales, getRevenue } from '@/lib/meta'
import { toast } from '@/components/ui/toast'

const curSym = (c: string) => (c === 'USD' ? '$' : c === 'EUR' ? '€' : 'R$')
const plus7 = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) }
const dmFmt = (d: string) => d.slice(8) + '/' + d.slice(5, 7)

/* ───────────────────────── Botão "duplicar" + modal ───────────────────────── */

export function DuplicateBtn({ accId, name, campId, roas, cur, spend, sales }: { accId: string; name: string; campId: string; roas: number | null; cur: string; spend?: number; sales?: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Duplicar esta campanha na Meta (cópia idêntica) e acompanhar as duas por 7 dias"
        className="inline-flex items-center gap-0.5 rounded border border-warn/40 bg-warn/5 px-1.5 py-0.5 text-[10px] font-bold text-warn hover:bg-warn/15"
      >
        <Copy className="h-3 w-3" /> duplicar
      </button>
      {open && <DuplicateModal accId={accId} name={name} campId={campId} roas={roas} cur={cur} spend={spend} sales={sales} onClose={() => setOpen(false)} />}
    </>
  )
}

export function DuplicateModal({ accId, name, campId, roas, cur, spend, sales, onClose }: { accId: string; name: string; campId: string; roas: number | null; cur: string; spend?: number; sales?: number; onClose: () => void }) {
  const m = useMonitor()
  const log = useLog()
  const [mode, setMode] = useState<'auto' | 'link'>('auto')
  const [status, setStatus] = useState<'PAUSED' | 'ACTIVE'>('PAUSED')
  const [nomeCopia, setNomeCopia] = useState(`${name} - cópia`)
  const [orcamento, setOrcamento] = useState('')
  const [qtd, setQtd] = useState(1)
  const [budgetLevel, setBudgetLevel] = useState<'campaign' | 'adset'>('adset')
  const [origInfo, setOrigInfo] = useState<{ level: 'campaign' | 'adset'; total: number; count: number } | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyingMsg, setApplyingMsg] = useState('')
  const [err, setErr] = useState('')

  // detecta a estrutura da original (CBO/ABO) pra usar como padrão do seletor
  useEffect(() => {
    getBudget(campId, m.token.trim())
      .then((b) => { setOrigInfo({ level: b.level, total: b.total, count: b.items.length }); setBudgetLevel(b.level) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campId])

  // modo "linkar": lista de campanhas da conta pra escolher qual é a cópia feita no Face
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; status?: string; updatedTime?: string }[]>([])
  const [loadingCamps, setLoadingCamps] = useState(false)
  const [campErr, setCampErr] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCopyId, setSelectedCopyId] = useState('')

  // duplicações anteriores onde esta campanha foi a ORIGINAL (linkedTo = campId)
  const prevDups = useMemo(
    () => log.filter((e) => e.kind === 'duplicacao' && e.linkedTo === campId).sort((a, b) => b.ts.localeCompare(a.ts)),
    [log, campId],
  )

  // busca as campanhas da conta ao entrar no modo "linkar" (lazy, 1×)
  useEffect(() => {
    if (mode !== 'link' || campaigns.length || loadingCamps) return
    setLoadingCamps(true); setCampErr('')
    fetchCampaignMeta(accId, m.token.trim())
      .then((list) =>
        setCampaigns(
          (list || [])
            .map((c: any) => ({ id: c.id, name: c.name || c.id, status: c.effective_status || c.status, updatedTime: c.updated_time }))
            .sort((a: any, b: any) => new Date(b.updatedTime || 0).getTime() - new Date(a.updatedTime || 0).getTime()),
        ),
      )
      .catch((e) => setCampErr(e.message || 'falha ao buscar campanhas'))
      .finally(() => setLoadingCamps(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // opções: exclui a própria original e as já linkadas como cópia dela; aplica busca
  const copyOptions = useMemo(() => {
    const linked = new Set(prevDups.map((d) => d.campId))
    const q = search.trim().toLowerCase()
    return campaigns
      .filter((c) => c.id !== campId && !linked.has(c.id))
      .filter((c) => !q || c.name.toLowerCase().includes(q))
  }, [campaigns, prevDups, campId, search])

  // linka uma cópia já criada manualmente no Facebook à campanha original
  function applyLink() {
    const copy = campaigns.find((c) => c.id === selectedCopyId)
    if (!copy) { setErr('Selecione qual campanha é a cópia.'); return }
    setApplying(true); setErr('')
    addAction({
      accId,
      campId: copy.id,
      name: copy.name,
      kind: 'duplicacao',
      sim: false,
      cur,
      linkedTo: campId,
      linkedName: name,
      roasAtTime: roas,
      spendAtTime: spend ?? null,
      salesAtTime: sales ?? null,
      dateBR: todayBR(),
      verifyBy: plus7(),
      detail: `Duplicada MANUALMENTE no Facebook de "${name}" · linkada pela lista`,
    })
    toast(`Linkado: "${copy.name}" registrada como cópia de "${name}"`, 'ok')
    onClose()
  }

  // calcula prefix/suffix pra rename_options do Meta (aplica a campanha + conjuntos + anúncios)
  const renameParts = useMemo(() => {
    if (nomeCopia.startsWith(name)) return { renamePrefix: '', renameSuffix: nomeCopia.slice(name.length) }
    if (nomeCopia.endsWith(name)) return { renamePrefix: nomeCopia.slice(0, -name.length), renameSuffix: '' }
    // nome completamente diferente: copia com sufixo genérico e renomeia depois via API
    return { renamePrefix: '', renameSuffix: ' - cópia' }
  }, [nomeCopia, name])

  const nomeECustom = !nomeCopia.startsWith(name) && !nomeCopia.endsWith(name)

  async function apply() {
    const N = Math.max(1, Math.min(20, Math.round(qtd) || 1))
    const orc = parseInt(orcamento.trim() || '0')       // R$/dia digitado
    const cents = orc > 0 ? Math.round(orc * 100) : 0    // Meta usa centavos
    const estr = budgetLevel === 'campaign' ? 'CBO' : 'ABO'
    setApplying(true); setApplyingMsg('Enviando…'); setErr('')
    let feitas = 0, budgetWarn = 0
    try {
      for (let i = 1; i <= N; i++) {
        const sfx = N > 1 ? ` ${i}` : ''
        setApplyingMsg(N > 1 ? `Cópia ${i}/${N}…` : 'Enviando…')
        let newId = `sim-${campId}-${Date.now().toString(36)}-${i}`
        let newName = `${nomeCopia}${sfx}`
        if (m.exec) {
          const rp = { renamePrefix: renameParts.renamePrefix, renameSuffix: `${renameParts.renameSuffix}${sfx}` }
          const res = await copyCampaign(
            campId, m.token.trim(), { deepCopy: true, status, ...rp },
            (msg) => setApplyingMsg(N > 1 ? `Cópia ${i}/${N} · ${msg}` : msg),
          )
          newId = res.copied_campaign_id
          if (nomeECustom) await renameEntity(newId, `${nomeCopia}${sfx}`, m.token.trim())
          try { newName = (await fetchCampaignName(newId, m.token.trim())) || newName } catch { /* mantém */ }
          // orçamento no nível escolhido (CBO = campanha; ABO = cada conjunto). Best-effort.
          if (cents > 0) {
            try {
              if (budgetLevel === 'campaign') {
                await setBudget(newId, cents, m.token.trim())
              } else {
                const adsetIds = (res.ad_object_ids || []).filter((o) => o.ad_object_type === 'AD_SET').map((o) => o.copied_id)
                for (const aid of adsetIds) await setBudget(aid, cents, m.token.trim())
              }
            } catch { budgetWarn++ }
          }
        }
        addAction({
          accId,
          campId: newId,
          name: newName,
          kind: 'duplicacao',
          sim: !m.exec,
          cur,
          linkedTo: campId,
          linkedName: name,
          roasAtTime: roas,
          spendAtTime: spend ?? null,
          salesAtTime: sales ?? null,
          dateBR: todayBR(),
          verifyBy: plus7(),
          detail: `Duplicada de "${name}"${N > 1 ? ` (${i}/${N})` : ''} · ${estr} · ${status === 'ACTIVE' ? 'ativa' : 'pausada'}${m.exec ? '' : ' [simulado]'}`,
        })
        feitas++
      }
      const base = m.exec
        ? `${feitas} cópia(s) ${estr} criada(s) (${status === 'ACTIVE' ? 'ativas' : 'pausadas'}) e linkada(s)`
        : `Simulado (Execução OFF): ${feitas} link(s) registrado(s) sem criar na Meta`
      toast(budgetWarn ? `${base} · ⚠ orçamento não aplicado em ${budgetWarn} (ajuste manual)` : base, budgetWarn ? 'warn' : 'ok')
      onClose()
    } catch (e: any) {
      setErr(`${feitas > 0 ? `${feitas} cópia(s) feita(s). ` : ''}${e.message || 'falha ao duplicar'}`)
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-[480px]" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="truncate text-[13px] font-bold" title={name}>🔗 Duplicar campanha</h3>
          <button onClick={onClose} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="card-body flex flex-col gap-3">
          <div className="truncate text-[12px] text-muted" title={name}>{name}</div>

          {/* modo: duplicar automático na Meta × linkar cópia feita à mão no Face */}
          <div className="flex gap-1 rounded-[9px] border border-border bg-[#0a0c19] p-0.5">
            <button
              onClick={() => { setMode('auto'); setErr('') }}
              className={`flex-1 rounded-[7px] px-2 py-1.5 text-[11.5px] font-semibold transition-colors ${mode === 'auto' ? 'bg-brand text-white' : 'text-muted2 hover:text-ink'}`}
            >
              ⚙️ Automático (Meta)
            </button>
            <button
              onClick={() => { setMode('link'); setErr('') }}
              className={`flex-1 rounded-[7px] px-2 py-1.5 text-[11.5px] font-semibold transition-colors ${mode === 'link' ? 'bg-brand text-white' : 'text-muted2 hover:text-ink'}`}
            >
              🔗 Já dupliquei no Face
            </button>
          </div>

          <p className="text-[11.5px] text-muted2">
            {mode === 'auto' ? (
              <>Cria uma <b>cópia idêntica</b> na Meta (com adsets e anúncios) e <b>linka</b> as duas no log. Aí dá pra abrir a <b>prova</b> e acompanhar 7 dias se a cópia canibalizou a original.</>
            ) : (
              <>Use quando a cópia automática <b>der erro</b> (ex.: posicionamento do Explorar). Duplique no Gerenciador de Anúncios e <b>selecione aqui</b> qual campanha é a cópia — o painel linka as duas (prova 7d + comparar com neon funcionam igual).</>
            )}
          </p>

          {/* duplicações anteriores desta campanha */}
          {prevDups.length > 0 && (
            <div className="rounded-[8px] border border-border bg-surface2 px-3 py-2.5">
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted2">
                Duplicações anteriores desta campanha
              </div>
              <div className="flex flex-col gap-1">
                {prevDups.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-muted2">{dmFmt(d.dateBR || todayBR(new Date(d.ts)))}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${d.sim ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok'}`}>
                      {d.sim ? 'simulada' : 'real'}
                    </span>
                    <span className="truncate text-muted" title={d.name}>{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── MODO AUTOMÁTICO ── */}
          {mode === 'auto' && (
          <>
          {/* status da cópia */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted2">A cópia nasce:</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setStatus('PAUSED')}
                className={`flex-1 rounded-[7px] border px-2 py-1.5 text-[12px] font-bold ${status === 'PAUSED' ? 'border-warn bg-warn/15 text-warn' : 'border-border text-muted hover:border-warn/50'}`}
              >
                ⏸ Pausada <span className="font-normal text-[10px] text-muted2">(revisar antes)</span>
              </button>
              <button
                onClick={() => setStatus('ACTIVE')}
                className={`flex-1 rounded-[7px] border px-2 py-1.5 text-[12px] font-bold ${status === 'ACTIVE' ? 'border-ok bg-ok/15 text-ok' : 'border-border text-muted hover:border-ok/50'}`}
              >
                ▶ Ativa <span className="font-normal text-[10px] text-muted2">(rodar já)</span>
              </button>
            </div>
          </div>

          {/* quantas cópias */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted2">Quantas cópias:</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 5, 10].map((q) => (
                <button
                  key={q}
                  onClick={() => setQtd(q)}
                  className={`flex-1 rounded-[7px] border px-2 py-1.5 text-[12px] font-bold ${qtd === q ? 'border-brand bg-brand/15 text-brand-2' : 'border-border text-muted hover:border-brand/50'}`}
                >
                  {q}×
                </button>
              ))}
              <input
                type="number" min="1" max="20" value={qtd}
                onChange={(e) => setQtd(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                className="w-[56px] rounded-[7px] border border-border bg-[#0a0c19] px-2 py-1.5 text-center text-[12px] text-ink"
                title="quantidade personalizada (máx 20)"
              />
            </div>
            {qtd > 1 && <span className="text-[10px] text-muted2">Vão sair {qtd} cópias numeradas (…{renameParts.renameSuffix || ' - cópia'} 1, 2, 3…)</span>}
          </div>

          {/* estrutura de orçamento: CBO × ABO */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted2">
              Estrutura de orçamento{origInfo && <span className="text-muted2"> · original é <b className="text-muted">{origInfo.level === 'campaign' ? 'CBO' : `ABO (${origInfo.count} conj.)`}</b></span>}:
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setBudgetLevel('campaign')}
                className={`flex-1 rounded-[7px] border px-2 py-1.5 text-[12px] font-bold ${budgetLevel === 'campaign' ? 'border-brand bg-brand/15 text-brand-2' : 'border-border text-muted hover:border-brand/50'}`}
              >
                CBO <span className="font-normal text-[10px] text-muted2">(orç. na campanha)</span>
              </button>
              <button
                onClick={() => setBudgetLevel('adset')}
                className={`flex-1 rounded-[7px] border px-2 py-1.5 text-[12px] font-bold ${budgetLevel === 'adset' ? 'border-brand bg-brand/15 text-brand-2' : 'border-border text-muted hover:border-brand/50'}`}
              >
                ABO <span className="font-normal text-[10px] text-muted2">(orç. por conjunto)</span>
              </button>
            </div>
            {origInfo && budgetLevel !== origInfo.level && (
              <span className="text-[10px] text-warn">⚠ Diferente da original — se a Meta recusar a conversão, a cópia é criada mesmo assim e você ajusta o orçamento no Gerenciador.</span>
            )}
          </div>

          {/* nome da cópia + orçamento */}
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="field !mb-0">
              <label>Nome da cópia</label>
              <input value={nomeCopia} onChange={(e) => setNomeCopia(e.target.value)} placeholder={`${name} - cópia`} />
              {nomeECustom && (
                <span className="mt-0.5 block text-[10px] text-warn">⚠ Nome diferente do original — campanha será renomeada após a cópia</span>
              )}
            </div>
            <div className="field !mb-0 w-[120px]">
              <label>{budgetLevel === 'campaign' ? 'Orç. R$/dia' : 'R$/dia p/ conj.'}</label>
              <input value={orcamento} onChange={(e) => setOrcamento(e.target.value)} placeholder="igual original" type="number" min="1" />
            </div>
          </div>
          <span className="block truncate text-[10.5px] text-muted2">
            O sufixo <b className="text-muted">{renameParts.renameSuffix || '(nenhum)'}</b> é aplicado a campanha, conjuntos e anúncios
          </span>

          {status === 'ACTIVE' && m.exec && (
            <div className="rounded-[8px] border border-ok/30 bg-ok/[0.07] px-3 py-2 text-[11.5px] text-ok">
              ▶ A cópia vai <b>começar a gastar</b> assim que aprovada. É isso que testa o canibalismo.
            </div>
          )}
          {!m.exec && (
            <div className="rounded-[8px] border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[11.5px] text-warn">
              ⚠ <b>Execução OFF</b> — só registra o link no log (simulado), sem criar na Meta. Ligue o switch <b>Execução</b> no topo pra duplicar de verdade.
            </div>
          )}
          </>
          )}

          {/* ── MODO LINKAR (cópia feita à mão no Face) ── */}
          {mode === 'link' && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔎 buscar a campanha cópia por nome..."
                className="w-full rounded-[7px] border border-border bg-[#0a0c19] px-3 py-1.5 text-[12px] text-ink"
              />
            </div>
            {loadingCamps && <div className="py-4 text-center text-[12px] text-muted2 animate-pulse">Buscando campanhas da conta…</div>}
            {campErr && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12px] text-danger">❌ {campErr}</div>}
            {!loadingCamps && !campErr && (
              <div className="max-h-[240px] overflow-y-auto rounded-[8px] border border-border">
                {copyOptions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[12px] text-muted2">Nenhuma campanha encontrada{search ? ' pra essa busca' : ''}.</div>
                ) : (
                  copyOptions.map((c) => {
                    const active = c.id === selectedCopyId
                    const on = c.status === 'ACTIVE'
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCopyId(c.id)}
                        className={`flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left last:border-0 transition-colors ${active ? 'bg-brand/15' : 'hover:bg-surface2/50'}`}
                      >
                        <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${active ? 'border-brand bg-brand' : 'border-border'}`} />
                        <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={c.name}>{c.name}</span>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${on ? 'bg-ok/15 text-ok' : 'bg-surface2 text-muted2'}`}>{on ? 'ativa' : 'pausada'}</span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
            <span className="text-[10.5px] text-muted2">Dica: a mais recente aparece no topo. Registro entra como duplicação <b>real</b> (não simulada), independente do switch Execução.</span>
          </div>
          )}

          {err && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12px] text-danger">❌ {err}</div>}

          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
            {mode === 'auto' ? (
              <button className="btn btn-primary btn-sm" onClick={apply} disabled={applying}>
                <Copy className="h-3.5 w-3.5" /> {applying ? applyingMsg || 'Duplicando…' : m.exec ? (qtd > 1 ? `Duplicar ${qtd}× na Meta` : 'Duplicar na Meta') : (qtd > 1 ? `Registrar ${qtd} links` : 'Registrar link (simulado)')}
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={applyLink} disabled={applying || !selectedCopyId}>
                <Copy className="h-3.5 w-3.5" /> Linkar cópia selecionada
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── Botão "prova" + modal de 7 dias ───────────────────────── */

export function DupProofBtn({ campId, cur }: { campId: string; cur: string }) {
  const [open, setOpen] = useState(false)
  const dups = duplicationsFor(campId)
  if (!dups.length) return null
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Prova: performance da cópia × original desde a duplicação"
        className="inline-flex items-center gap-0.5 rounded border border-warn/40 bg-warn/5 px-1.5 py-0.5 text-[10px] font-bold text-warn hover:bg-warn/15"
      >
        <GitBranch className="h-3 w-3" /> prova
      </button>
      {open && <DupProofModal dups={dups} cur={cur} onClose={() => setOpen(false)} />}
    </>
  )
}

interface Win { spend: number; sales: number; revenue: number }
const ZERO: Win = { spend: 0, sales: 0, revenue: 0 }
const roasOf = (w: Win) => (w.spend > 0 ? w.revenue / w.spend : null)
const winOf = (row: any): Win => ({ spend: parseFloat(row.spend || '0'), sales: getSales(row), revenue: getRevenue(row) || 0 })
const addW = (a: Win, b: Win): Win => ({ spend: a.spend + b.spend, sales: a.sales + b.sales, revenue: a.revenue + b.revenue })

export function DupProofModal({ dups, cur, onClose }: { dups: ActionEntry[]; cur: string; onClose: () => void }) {
  const m = useMonitor()
  const sym = curSym(cur)
  const [idx, setIdx] = useState(0)
  const e = dups[idx]
  const copyId = e.campId!          // a cópia
  const origId = e.linkedTo!        // a original
  const accId = e.accId || ''
  const dupDate = e.dateBR || todayBR(new Date(e.ts))

  const [orig, setOrig] = useState<Record<string, Win> | null>(null)
  const [copy, setCopy] = useState<Record<string, Win> | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // janela: alguns dias antes da cópia (contexto) + tudo desde então
  const days = useMemo(() => {
    const since = Math.ceil((Date.now() - new Date(e.ts).getTime()) / 86400000)
    return Math.min(30, Math.max(6, since + 4))
  }, [e.ts])

  useEffect(() => {
    let alive = true
    setLoading(true); setErr('')
    const toMap = (rows: any[]): Record<string, Win> => {
      const map: Record<string, Win> = {}
      for (const r of rows || []) map[r.date_start as string] = winOf(r)
      return map
    }
    Promise.all([
      fetchCampDaily(accId, origId, m.token.trim(), days).catch(() => []),
      e.sim ? Promise.resolve([]) : fetchCampDaily(accId, copyId, m.token.trim(), days).catch(() => []),
    ])
      .then(([o, c]) => { if (!alive) return; setOrig(toMap(o)); setCopy(toMap(c)); setLoading(false) })
      .catch((er) => { if (alive) { setErr(er.message || 'falha ao buscar dados'); setLoading(false) } })
    return () => { alive = false }
  }, [accId, origId, copyId, days, e.sim])

  // dias ordenados que aparecem em qualquer das duas campanhas
  const allDates = useMemo(() => {
    const s = new Set<string>([...Object.keys(orig || {}), ...Object.keys(copy || {})])
    return [...s].sort()
  }, [orig, copy])

  // original: antes × depois da cópia
  const split = useMemo(() => {
    const before: Win[] = [], after: Win[] = []
    for (const d of Object.keys(orig || {})) (d < dupDate ? before : after).push(orig![d])
    const avg = (arr: Win[]): Win & { roas: number | null; n: number } => {
      const t = arr.reduce(addW, ZERO)
      const n = arr.length || 1
      return { spend: t.spend / n, sales: t.sales / n, revenue: t.revenue / n, roas: roasOf(t), n: arr.length }
    }
    return { before: avg(before), after: avg(after) }
  }, [orig, dupDate])

  const copyTotal = useMemo(() => Object.values(copy || {}).reduce(addW, ZERO), [copy])

  const dropPct = split.before.revenue > 0 ? (1 - split.after.revenue / split.before.revenue) * 100 : null
  const verdict =
    e.sim ? null
      : split.before.n === 0 ? null
        : dropPct == null ? null
          : dropPct >= 25 ? { txt: `📉 Original caiu ${dropPct.toFixed(0)}% no fat/dia desde a cópia`, cls: 'bg-danger/15 text-danger' }
            : dropPct <= -15 ? { txt: `📈 Original até subiu ${Math.abs(dropPct).toFixed(0)}% — sem canibalismo`, cls: 'bg-ok/15 text-ok' }
              : { txt: `➖ Original estável (${dropPct >= 0 ? '-' : '+'}${Math.abs(dropPct).toFixed(0)}% fat/dia)`, cls: 'bg-surface2 text-muted' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-[680px] max-h-[88vh] overflow-y-auto" onClick={(ev) => ev.stopPropagation()}>
        <div className="card-header sticky top-0 z-10 bg-[#0d1220]">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-bold">🔗 Prova da duplicação</h3>
            <div className="truncate text-[11px] text-muted2">Duplicada em {dmFmt(dupDate)} · acompanhando 7 dias</div>
          </div>
          <button onClick={onClose} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        <div className="card-body flex flex-col gap-3">
          {/* seletor se houver mais de uma duplicação */}
          {dups.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted2">Duplicação:</span>
              {dups.map((d, i) => (
                <button key={d.id} onClick={() => setIdx(i)}
                  className={`rounded-[7px] border px-2 py-1 text-[11px] font-semibold ${i === idx ? 'border-warn bg-warn/10 text-warn' : 'border-border text-muted2 hover:border-warn/40'}`}>
                  {dmFmt(d.dateBR || todayBR(new Date(d.ts)))}
                </button>
              ))}
            </div>
          )}

          {/* as duas campanhas */}
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-xl2 border border-border bg-surface2 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted2">Original</div>
              <div className="truncate font-bold text-ink" title={e.linkedName}>{e.linkedName || '—'}</div>
            </div>
            <div className="rounded-xl2 border border-warn/30 bg-warn/[0.06] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-warn">Cópia</div>
              <div className="truncate font-bold text-ink" title={e.name}>{e.name}</div>
            </div>
          </div>

          {e.sim && <div className="rounded-[8px] border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[11.5px] text-warn">⚠ Duplicação <b>simulada</b> (Execução estava OFF) — não há dados reais da cópia pra comparar.</div>}
          {err && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12px] text-danger">❌ {err}</div>}
          {loading && <div className="py-4 text-center text-[12px] text-muted2 animate-pulse">Buscando histórico das duas campanhas…</div>}

          {!loading && !e.sim && (
            <>
              {verdict && <div className={`rounded-[8px] px-3 py-2 text-center text-[12px] font-bold ${verdict.cls}`}>{verdict.txt}</div>}

              {/* original: antes × depois */}
              <div className="rounded-xl2 border border-border overflow-hidden">
                <div className="border-b border-border bg-surface2 px-3 py-2 text-[12px] font-bold">Original — média/dia antes × depois da cópia</div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted2">
                      <th className="py-1.5 pl-3 text-left">Métrica</th>
                      <th className="py-1.5 text-right">Antes ({split.before.n}d)</th>
                      <th className="py-1.5 pr-3 text-right">Depois ({split.after.n}d)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { l: 'Faturamento/dia', b: `${sym}${split.before.revenue.toFixed(0)}`, a: `${sym}${split.after.revenue.toFixed(0)}`, good: split.after.revenue >= split.before.revenue },
                      { l: 'Gasto/dia', b: `${sym}${split.before.spend.toFixed(0)}`, a: `${sym}${split.after.spend.toFixed(0)}`, good: null },
                      { l: 'Vendas/dia', b: split.before.sales.toFixed(1), a: split.after.sales.toFixed(1), good: split.after.sales >= split.before.sales },
                      { l: 'ROAS', b: split.before.roas?.toFixed(2) ?? '—', a: split.after.roas?.toFixed(2) ?? '—', good: split.before.roas != null && split.after.roas != null ? split.after.roas >= split.before.roas : null },
                    ].map((r) => (
                      <tr key={r.l} className="border-b border-border/40 last:border-0">
                        <td className="py-1.5 pl-3 text-muted">{r.l}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-muted2">{r.b}</td>
                        <td className={`py-1.5 pr-3 text-right font-mono tabular-nums font-semibold ${r.good == null ? 'text-ink' : r.good ? 'text-ok' : 'text-danger'}`}>{r.a}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* cópia: total acumulado */}
              <div className="flex items-center justify-between rounded-[8px] border border-warn/30 bg-warn/[0.06] px-3 py-2 text-[12px]">
                <span className="text-muted">Cópia acumulou</span>
                <span className="font-mono font-bold text-ink">
                  {sym}{copyTotal.spend.toFixed(0)} gasto · {copyTotal.sales} vendas · ROAS {roasOf(copyTotal)?.toFixed(2) ?? '—'}
                </span>
              </div>

              {/* dia a dia lado a lado */}
              <div className="rounded-xl2 border border-border overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted2">
                      <th className="py-1.5 pl-3 text-left">Dia</th>
                      <th className="py-1.5 text-right">Orig. gasto</th>
                      <th className="py-1.5 text-right">Orig. ROAS</th>
                      <th className="py-1.5 text-right text-warn">Cópia gasto</th>
                      <th className="py-1.5 pr-3 text-right text-warn">Cópia ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allDates.map((d) => {
                      const o = orig?.[d], c = copy?.[d]
                      const isDup = d === dupDate
                      return (
                        <tr key={d} className={`border-b border-border/40 last:border-0 ${isDup ? 'bg-warn/[0.05]' : ''}`}>
                          <td className="py-1.5 pl-3 text-muted">{dmFmt(d)}{isDup && <span className="ml-1 rounded bg-warn/20 px-1 text-[9px] font-bold text-warn">dup</span>}</td>
                          <td className="py-1.5 text-right font-mono tabular-nums text-muted2">{o ? sym + o.spend.toFixed(0) : '—'}</td>
                          <td className="py-1.5 text-right font-mono tabular-nums">{o && roasOf(o) != null ? roasOf(o)!.toFixed(2) : '—'}</td>
                          <td className="py-1.5 text-right font-mono tabular-nums text-muted2">{c ? sym + c.spend.toFixed(0) : '—'}</td>
                          <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{c && roasOf(c) != null ? roasOf(c)!.toFixed(2) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted2">Gasto/vendas/fat vêm do Meta por dia. "Antes" = dias da original antes da cópia; "Depois" = a partir do dia da duplicação. A original caiu? A cópia roubou o resultado.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
