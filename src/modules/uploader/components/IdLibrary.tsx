import { useEffect, useState } from 'react'
import { Library, X, Plus, Trash2, RefreshCw, BookMarked, Check, Lock } from 'lucide-react'
import { useUploader } from '../UploaderContext'
import {
  useLibrary, upsertEntry, removeEntry, syncFromFb,
  KIND_LABEL, KIND_PLACEHOLDER, type IdKind, type IdEntry,
} from '../lib/idLibrary'
import { loadVaultToLibrary, savedPass } from '../lib/assetsVault'
import { toast } from '@/components/ui/toast'

const KINDS: IdKind[] = ['accounts', 'pages', 'pixels', 'instagrams']

/** Botão que abre o gerenciador da Biblioteca de IDs. */
export function IdLibraryButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Contas, páginas, pixels e IGs salvos com nome">
        <Library className="h-3 w-3" /> Biblioteca de IDs
      </button>
      {open && <IdLibraryModal onClose={() => setOpen(false)} />}
    </>
  )
}

function IdLibraryModal({ onClose }: { onClose: () => void }) {
  const ctx = useUploader()
  const lib = useLibrary()
  const [tab, setTab] = useState<IdKind>('accounts')
  const [nName, setNName] = useState('')
  const [nId, setNId] = useState('')
  const [syncing, setSyncing] = useState('')
  const [vaultPass, setVaultPass] = useState(savedPass())
  const [vaultMsg, setVaultMsg] = useState('')

  // auto-carrega o cofre se a senha já estiver lembrada
  useEffect(() => {
    if (savedPass()) loadVaultToLibrary(savedPass()).then((n) => setVaultMsg(`✓ ${n} IDs do cofre carregados`)).catch(() => {})
  }, [])

  async function openVault() {
    if (!vaultPass.trim()) return toast('Digite a senha do cofre.', 'warn')
    try {
      const n = await loadVaultToLibrary(vaultPass.trim())
      setVaultMsg(`✓ ${n} IDs carregados do projeto`)
      toast(`Cofre aberto: ${n} IDs carregados.`, 'ok')
    } catch {
      setVaultMsg('')
      toast('Senha incorreta.', 'err')
    }
  }

  const list = lib[tab]

  function add() {
    const id = nId.trim()
    if (!id) return toast('Cole o ID.', 'warn')
    upsertEntry(tab, { id, name: nName.trim() || id })
    setNName(''); setNId('')
    toast('Salvo na biblioteca.', 'ok')
  }

  async function sync() {
    const token = ctx.form.token.trim()
    if (!token) return toast('Cole o token na aba Conta primeiro.', 'warn')
    setSyncing('Iniciando…')
    try {
      const r = await syncFromFb(token, (m) => setSyncing(m))
      setSyncing('')
      toast(`Sincronizado: ${r.accounts} contas · ${r.pages} páginas · ${r.pixels} pixels · ${r.instagrams} IGs`, 'ok')
      if (r.warnings.length) toast('Alguns itens falharam: ' + r.warnings.join(' | '), 'warn')
    } catch (e: any) {
      setSyncing('')
      toast('Erro ao sincronizar: ' + e.message, 'err')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-[640px] max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header sticky top-0 z-10 bg-[#0d1220]">
          <h3 className="flex items-center gap-2 text-[13px] font-bold"><Library className="h-4 w-4" /> Biblioteca de IDs</h3>
          <button onClick={onClose} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        <div className="card-body flex flex-col gap-3">
          {/* cofre do projeto (IDs salvos criptografados) */}
          <div className="rounded-[8px] border border-ok/30 bg-ok/[0.06] px-3 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-ok"><Lock className="h-3.5 w-3.5" /> Cofre do projeto — seus IDs salvos (criptografados)</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={vaultPass}
                onChange={(e) => setVaultPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && openVault()}
                placeholder="senha do cofre"
                className="flex-1 min-w-[160px] rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
              />
              <button className="btn btn-primary btn-sm" onClick={openVault}><Lock className="h-3 w-3" /> Carregar do projeto</button>
              {vaultMsg && <span className="text-[11px] font-semibold text-ok">{vaultMsg}</span>}
            </div>
            <div className="mt-1 text-[10.5px] text-muted2">Digite a senha 1 vez — fica lembrada neste navegador e carrega sozinho nas próximas. Sem a senha, ninguém lê.</div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-[8px] border border-brand/30 bg-brand/[0.06] px-3 py-2">
            <span className="text-[11.5px] text-muted">Puxa tudo do Facebook de uma vez (com os nomes) usando seu token.</span>
            <button className="btn btn-primary btn-sm shrink-0" onClick={sync} disabled={!!syncing}>
              <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Sincronizando…' : 'Sincronizar do Facebook'}
            </button>
          </div>
          {syncing && <div className="text-center text-[11px] text-brand-2 animate-pulse">{syncing}</div>}

          {/* abas por tipo */}
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button key={k} onClick={() => setTab(k)}
                className={`rounded-[7px] border px-2.5 py-1 text-[11.5px] font-semibold ${k === tab ? 'border-brand bg-brand/10 text-brand-2' : 'border-border text-muted2 hover:border-brand/40'}`}>
                {KIND_LABEL[k]} <span className="opacity-60">({lib[k].length})</span>
              </button>
            ))}
          </div>

          {/* adicionar manual */}
          <div className="flex flex-wrap items-end gap-2 rounded-[8px] border border-border bg-surface2/40 px-3 py-2">
            <div className="field min-w-[160px] flex-1">
              <label>Nome</label>
              <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="ex: BILLIONARE BR" onKeyDown={(e) => e.key === 'Enter' && add()} />
            </div>
            <div className="field min-w-[160px] flex-1">
              <label>ID</label>
              <input value={nId} onChange={(e) => setNId(e.target.value)} placeholder={KIND_PLACEHOLDER[tab]} onKeyDown={(e) => e.key === 'Enter' && add()} />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={add}><Plus className="h-3 w-3" /> Adicionar</button>
          </div>

          {/* lista */}
          {list.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-muted2">Nada salvo aqui ainda. Sincronize do Facebook ou adicione manualmente.</div>
          ) : (
            <div className="rounded-xl2 border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <tbody>
                    {list.map((e) => (
                      <tr key={e.id} className="border-b border-border/40 last:border-0">
                        <td className="py-1.5 pl-3">
                          <input
                            defaultValue={e.name}
                            onBlur={(ev) => ev.target.value.trim() !== e.name && upsertEntry(tab, { ...e, name: ev.target.value.trim() || e.id })}
                            className="w-full bg-transparent font-semibold text-ink outline-none focus:border-b focus:border-brand"
                          />
                        </td>
                        <td className="py-1.5 font-mono text-[11px] text-muted2">{e.id}</td>
                        <td className="py-1.5 text-[10px] text-muted2">{e.note || ''}</td>
                        <td className="py-1.5 pr-3 text-right">
                          <button onClick={() => removeEntry(tab, e.id)} className="text-muted2 hover:text-danger" title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Quick-pick: botãozinho ao lado de um campo que lista os IDs salvos daquele
 *  tipo. Escolheu → preenche o campo. */
export function PickField({ kind, onPick }: { kind: IdKind; onPick: (e: IdEntry) => void }) {
  const lib = useLibrary()
  const [open, setOpen] = useState(false)
  const list = lib[kind]
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} title="Escolher da Biblioteca de IDs"
        className="btn btn-ghost btn-sm shrink-0"><BookMarked className="h-3 w-3" /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 max-h-[260px] w-[260px] overflow-y-auto rounded-xl2 border border-border bg-[#0d1220] shadow-2xl shadow-black/40">
            {list.length === 0 ? (
              <div className="px-3 py-3 text-[11.5px] text-muted2">Nenhum salvo. Abra a <b>Biblioteca de IDs</b> e sincronize.</div>
            ) : (
              list.map((e) => (
                <button key={e.id} onClick={() => { onPick(e); setOpen(false) }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-surface2">
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-ink">{e.name}</span>
                    <span className="block truncate font-mono text-[10px] text-muted2">{e.id}{e.note ? ` · ${e.note}` : ''}</span>
                  </span>
                  <Check className="h-3 w-3 shrink-0 text-muted2" />
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
