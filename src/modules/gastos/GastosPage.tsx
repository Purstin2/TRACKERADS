import { useMemo, useState } from 'react'
import {
  Wallet, Check, X, Pencil, Plus, Trash2, ChevronLeft, ChevronRight,
  AlertTriangle, ExternalLink, StickyNote,
} from 'lucide-react'
import { usePersistentState } from '@/lib/appState'
import {
  GASTOS_KEY, GASTOS_INICIAIS, mesAtual, somaMes, rotuloMes, diaVenc, diasAte,
  situacao, ordenar, novoId, type Gasto, type GastosState, type Situacao,
} from './gastos'

/* Gastos operacionais — as assinaturas que sustentam a operação.
 *
 * O "pago" é por MÊS, não um check global: em setembro a lista se reabre
 * sozinha e agosto continua no histórico. Por isso a tela tem navegação de mês.
 *
 * A observação de cada item existe porque a decisão não é só "pagar": na VTurb,
 * estourar o limite significa trocar de conta em vez de pagar o excedente. Esse
 * tipo de regra tem que estar na frente na hora da cobrança, não na memória. */

const brl = (v?: number | null) =>
  v == null ? '—' : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SIT: Record<Situacao, { label: string; cls: string; dot: string }> = {
  atrasado: { label: 'atrasado', cls: 'border-danger/40 bg-danger/[0.08] text-danger', dot: 'bg-danger' },
  hoje: { label: 'vence hoje', cls: 'border-warn/45 bg-warn/[0.10] text-warn', dot: 'bg-warn' },
  proximo: { label: 'vence em breve', cls: 'border-warn/30 bg-warn/[0.05] text-warn', dot: 'bg-warn' },
  futuro: { label: 'a vencer', cls: 'border-border bg-surface text-muted2', dot: 'bg-muted2' },
  pago: { label: 'pago', cls: 'border-ok/35 bg-ok/[0.07] text-ok', dot: 'bg-ok' },
}

const INP =
  'h-[38px] w-full rounded-[9px] border border-border bg-surface2 px-2.5 text-[13px] text-ink focus:border-brand focus:outline-none'

export default function GastosPage() {
  const [state, setState] = usePersistentState<GastosState>(GASTOS_KEY, GASTOS_INICIAIS)
  const [mes, setMes] = useState(mesAtual())
  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<Gasto | null>(null)
  const [notaAberta, setNotaAberta] = useState<string | null>(null)

  const itens = state.itens || []
  const ativos = useMemo(() => itens.filter((g) => g.ativo), [itens])
  const lista = useMemo(() => ordenar(ativos, mes), [ativos, mes])
  const inativos = useMemo(() => itens.filter((g) => !g.ativo), [itens])

  const tot = useMemo(() => {
    let total = 0, pago = 0, aberto = 0, semValor = 0
    for (const g of ativos) {
      const v = g.valor
      if (v == null) { semValor += 1; continue }
      total += v
      if (g.pagos.includes(mes)) pago += v; else aberto += v
    }
    return { total, pago, aberto, semValor }
  }, [ativos, mes])

  const atrasados = lista.filter((g) => situacao(g, mes) === 'atrasado').length
  const gravar = (itens2: Gasto[]) => setState({ ...state, itens: itens2 })
  const patch = (id: string, p: Partial<Gasto>) =>
    gravar(itens.map((g) => (g.id === id ? { ...g, ...p } : g)))

  function alternarPago(g: Gasto) {
    const tem = g.pagos.includes(mes)
    patch(g.id, { pagos: tem ? g.pagos.filter((m) => m !== mes) : [...g.pagos, mes] })
  }
  function salvarNota(g: Gasto, txt: string) {
    const notas = { ...(g.notas || {}) }
    if (txt.trim()) notas[mes] = txt.trim(); else delete notas[mes]
    patch(g.id, { notas })
    setNotaAberta(null)
  }
  function adicionar() {
    const novo: Gasto = { id: novoId(), nome: '', valor: null, dia: 1, ativo: true, pagos: [] }
    gravar([...itens, novo])
    setEditando(novo.id)
    setRascunho(novo)
  }
  function salvarEdicao() {
    if (!rascunho) return
    if (!rascunho.nome.trim()) { alert('Dá um nome pro gasto.'); return }
    patch(rascunho.id, { ...rascunho, dia: Math.min(31, Math.max(1, Math.round(rascunho.dia) || 1)) })
    setEditando(null); setRascunho(null)
  }
  function excluir(g: Gasto) {
    if (!confirm(`Excluir "${g.nome}"? O histórico de pagamentos dele some junto.`)) return
    gravar(itens.filter((x) => x.id !== g.id))
    setEditando(null); setRascunho(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* cabeçalho + navegação de mês */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-brand-2" />
          <h1 className="text-[19px] font-extrabold">Gastos operacionais</h1>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-[10px] border border-border bg-surface p-1">
          <button onClick={() => setMes(somaMes(mes, -1))} className="rounded-[7px] px-2 py-1.5 text-muted2 hover:text-ink" aria-label="mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[64px] text-center text-[13px] font-bold">{rotuloMes(mes)}</span>
          <button onClick={() => setMes(somaMes(mes, 1))} className="rounded-[7px] px-2 py-1.5 text-muted2 hover:text-ink" aria-label="próximo mês">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {mes !== mesAtual() && (
          <button onClick={() => setMes(mesAtual())} className="rounded-[9px] border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold text-muted">
            voltar pro mês atual
          </button>
        )}
        <button onClick={adicionar} className="flex items-center gap-1.5 rounded-[9px] border border-brand/45 bg-brand/15 px-3 py-2 text-[12.5px] font-bold text-brand-2">
          <Plus className="h-4 w-4" /> Novo gasto
        </button>
      </div>

      {/* resumo do mês */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Total do mês', brl(tot.total), 'text-ink'],
          ['Já pago', brl(tot.pago), 'text-ok'],
          ['Em aberto', brl(tot.aberto), tot.aberto > 0 ? 'text-warn' : 'text-muted2'],
          ['Atrasados', String(atrasados), atrasados > 0 ? 'text-danger' : 'text-muted2'],
        ].map(([k, v, cls]) => (
          <div key={k} className="rounded-xl2 border border-border bg-surface p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted2">{k}</div>
            <div className={`mt-1 text-[22px] font-extrabold ${cls}`}>{v}</div>
          </div>
        ))}
      </div>

      {tot.semValor > 0 && (
        <div className="flex items-start gap-2 rounded-xl2 border border-border bg-surface px-4 py-3 text-[12.5px] text-muted2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          {tot.semValor} {tot.semValor === 1 ? 'gasto está' : 'gastos estão'} sem valor cadastrado — o total do mês não conta {tot.semValor === 1 ? 'ele' : 'eles'}.
          Preencha no lápis quando souber quanto veio.
        </div>
      )}

      {/* lista */}
      <div className="flex flex-col gap-2">
        {lista.length === 0 && (
          <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
            Nenhum gasto cadastrado. Clique em “Novo gasto”.
          </div>
        )}
        {lista.map((g) => {
          const sit = situacao(g, mes)
          const S = SIT[sit]
          const dias = diasAte(g.dia, mes)
          const pago = sit === 'pago'
          const emEdicao = editando === g.id && rascunho
          const nota = g.notas?.[mes]

          if (emEdicao && rascunho) {
            return (
              <div key={g.id} className="rounded-xl2 border border-brand/50 bg-surface p-4">
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-4">
                  <label className="md:col-span-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Nome</span>
                    <input className={INP + ' mt-1'} value={rascunho.nome} autoFocus
                      onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} />
                  </label>
                  <label>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Valor (vazio = variável)</span>
                    <input className={INP + ' mt-1'} type="number" inputMode="decimal" step="0.01"
                      value={rascunho.valor ?? ''}
                      onChange={(e) => setRascunho({ ...rascunho, valor: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                  </label>
                  <label>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Dia do vencimento</span>
                    <input className={INP + ' mt-1'} type="number" min={1} max={31}
                      value={rascunho.dia}
                      onChange={(e) => setRascunho({ ...rascunho, dia: parseInt(e.target.value || '1', 10) })} />
                  </label>
                  <label>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Conta / titular</span>
                    <input className={INP + ' mt-1'} value={rascunho.conta || ''}
                      onChange={(e) => setRascunho({ ...rascunho, conta: e.target.value })} />
                  </label>
                  <label className="md:col-span-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Link do painel de cobrança</span>
                    <input className={INP + ' mt-1'} value={rascunho.url || ''} placeholder="https://…"
                      onChange={(e) => setRascunho({ ...rascunho, url: e.target.value })} />
                  </label>
                  <label className="md:col-span-4">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted2">
                      O que lembrar toda vez que essa cobrança chegar
                    </span>
                    <textarea className={INP + ' mt-1 h-[62px] py-2'} value={rascunho.obs || ''}
                      onChange={(e) => setRascunho({ ...rascunho, obs: e.target.value })} />
                  </label>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={salvarEdicao} className="flex items-center gap-1.5 rounded-[9px] border border-ok/50 bg-ok/15 px-4 py-2 text-[13px] font-bold text-ok">
                    <Check className="h-4 w-4" /> Salvar
                  </button>
                  <button onClick={() => { setEditando(null); setRascunho(null) }} className="rounded-[9px] border border-border px-4 py-2 text-[13px] font-semibold text-muted">
                    Cancelar
                  </button>
                  <button onClick={() => patch(g.id, { ativo: false })} className="ml-auto rounded-[9px] border border-border px-3 py-2 text-[12.5px] font-semibold text-muted2">
                    Arquivar
                  </button>
                  <button onClick={() => excluir(g)} className="flex items-center gap-1.5 rounded-[9px] border border-danger/40 px-3 py-2 text-[12.5px] font-bold text-danger">
                    <Trash2 className="h-4 w-4" /> Excluir
                  </button>
                </div>
              </div>
            )
          }

          return (
            <div key={g.id} className={`rounded-xl2 border bg-surface p-4 ${sit === 'atrasado' ? 'border-danger/40' : 'border-border'}`}>
              <div className="flex flex-wrap items-start gap-3">
                {/* dia */}
                <div className="flex h-[46px] w-[46px] shrink-0 flex-col items-center justify-center rounded-[10px] border border-border bg-surface2">
                  <span className="text-[16px] font-extrabold leading-none">{diaVenc(g.dia, mes)}</span>
                  <span className="text-[9px] uppercase tracking-wide text-muted2">{rotuloMes(mes).slice(0, 3)}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-bold text-ink">{g.nome || '(sem nome)'}</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${S.cls}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${S.dot}`} />
                      {S.label}
                      {!pago && sit !== 'hoje' && (
                        <span className="font-normal opacity-80">
                          {dias < 0 ? `${-dias}d` : `em ${dias}d`}
                        </span>
                      )}
                    </span>
                    {g.conta && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted2">{g.conta}</span>}
                    {g.url && (
                      <a href={g.url} target="_blank" rel="noreferrer" className="text-muted2 hover:text-brand-2" title="abrir painel de cobrança">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  {g.obs && <div className="mt-1 text-[12.5px] leading-snug text-muted">{g.obs}</div>}
                  {nota && (
                    <div className="mt-1.5 inline-flex items-start gap-1.5 rounded-[8px] border border-brand/25 bg-brand/[0.06] px-2.5 py-1 text-[12px] text-brand-2">
                      <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {nota}
                    </div>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <div className={`text-[17px] font-extrabold ${g.valor == null ? 'text-muted2' : 'text-ink'}`}>{brl(g.valor)}</div>
                  <div className="text-[10.5px] uppercase tracking-wide text-muted2">{g.valor == null ? 'variável' : 'por mês'}</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => alternarPago(g)}
                  className={`flex items-center gap-1.5 rounded-[9px] border px-3.5 py-2 text-[12.5px] font-bold ${
                    pago ? 'border-ok/50 bg-ok/15 text-ok' : 'border-border bg-surface2 text-muted'
                  }`}
                >
                  <Check className="h-4 w-4" /> {pago ? `Pago em ${rotuloMes(mes)}` : 'Marcar como pago'}
                </button>
                <button
                  onClick={() => setNotaAberta(notaAberta === g.id ? null : g.id)}
                  className="flex items-center gap-1.5 rounded-[9px] border border-border bg-surface2 px-3 py-2 text-[12.5px] font-semibold text-muted"
                >
                  <StickyNote className="h-4 w-4" /> {nota ? 'Editar nota do mês' : 'Nota do mês'}
                </button>
                <button
                  onClick={() => { setEditando(g.id); setRascunho(g) }}
                  className="ml-auto flex items-center gap-1.5 rounded-[9px] border border-border bg-surface2 px-3 py-2 text-[12.5px] font-semibold text-muted"
                >
                  <Pencil className="h-4 w-4" /> Editar
                </button>
              </div>

              {notaAberta === g.id && (
                <NotaMes inicial={nota || ''} onCancelar={() => setNotaAberta(null)} onSalvar={(t) => salvarNota(g, t)} />
              )}
            </div>
          )
        })}
      </div>

      {/* arquivados */}
      {inativos.length > 0 && (
        <div className="rounded-xl2 border border-border bg-surface p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Arquivados</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {inativos.map((g) => (
              <button key={g.id} onClick={() => patch(g.id, { ativo: true })}
                className="rounded-full border border-border px-3 py-1.5 text-[12px] text-muted2 hover:text-ink">
                {g.nome} · reativar
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** nota do mês — separada pra manter o texto em estado local enquanto digita */
function NotaMes({ inicial, onSalvar, onCancelar }: { inicial: string; onSalvar: (t: string) => void; onCancelar: () => void }) {
  const [txt, setTxt] = useState(inicial)
  return (
    <div className="mt-2 rounded-[10px] border border-border bg-surface2/60 p-3">
      <textarea
        className={INP + ' h-[58px] py-2'}
        autoFocus
        value={txt}
        placeholder="ex.: estourou o limite, troquei de conta / renovei por 12 meses"
        onChange={(e) => setTxt(e.target.value)}
      />
      <div className="mt-2 flex gap-2">
        <button onClick={() => onSalvar(txt)} className="flex items-center gap-1.5 rounded-[9px] border border-ok/50 bg-ok/15 px-3 py-1.5 text-[12.5px] font-bold text-ok">
          <Check className="h-4 w-4" /> Salvar nota
        </button>
        <button onClick={onCancelar} className="flex items-center gap-1.5 rounded-[9px] border border-border px-3 py-1.5 text-[12.5px] font-semibold text-muted">
          <X className="h-4 w-4" /> Cancelar
        </button>
      </div>
    </div>
  )
}
