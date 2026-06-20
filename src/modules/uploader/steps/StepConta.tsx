import { useState } from 'react'
import { Key, IdCard, Eye, Check, Search, Save, Trash2, FolderOpen } from 'lucide-react'
import { useUploader } from '../UploaderContext'
import { Card, Input, Select } from '../components/fields'
import { PIXEL_EVENTS } from '../types'
import {
  verifyToken,
  verifyPage,
  listPages,
  lookupInstagram,
  debugToken,
} from '../lib/fb'
import { toast } from '@/components/ui/toast'

export default function StepConta({ onNext }: { onNext: () => void }) {
  const ctx = useUploader()
  const { form, setField } = ctx
  const [showToken, setShowToken] = useState(false)
  const [tokenStatus, setTokenStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [pageStatus, setPageStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [igStatus, setIgStatus] = useState<string>('')
  const [pageOpts, setPageOpts] = useState<{ id: string; name: string }[]>([])
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [selPreset, setSelPreset] = useState('')

  async function testToken() {
    setTokenStatus({ ok: false, msg: 'Verificando...' })
    const token = form.token.trim()
    try {
      const name = await verifyToken(token)
      // mostra a validade — token curto (Graph Explorer) expira em ~1-2h e
      // gera o erro "Session has expired"; o ideal é um token de longa duração.
      let extra = ''
      try {
        const { expiresAt } = await debugToken(token)
        if (!expiresAt) {
          extra = ' · não expira'
        } else {
          const ms = expiresAt * 1000 - Date.now()
          const h = Math.round(ms / 3_600_000)
          extra =
            h < 48
              ? ` · ⚠ expira em ~${h}h — use um token de longa duração`
              : ` · expira ${new Date(expiresAt * 1000).toLocaleDateString('pt-BR')}`
        }
      } catch {
        /* debug_token pode não estar disponível p/ alguns tokens — ignora */
      }
      setTokenStatus({ ok: true, msg: `✓ ${name}${extra}` })
    } catch (e: any) {
      // mostra o motivo real (ex.: "Session has expired ... code 190/463" = token vencido)
      setTokenStatus({ ok: false, msg: `✗ ${e.message || 'Token inválido'}` })
    }
  }

  async function testPage() {
    const pageId = form.page_id.trim()
    const token = form.token.trim()
    if (!pageId) return
    if (!token) {
      setPageStatus({ ok: false, msg: '⚠ Preencha o token primeiro.' })
      return
    }
    setPageStatus({ ok: false, msg: 'Verificando página...' })
    ctx.setPageVerified(false)
    try {
      const d = await verifyPage(token, pageId)
      setPageStatus({ ok: true, msg: `✓ ${d.name} (${d.id})` })
      ctx.setPageVerified(true)
      doLookupInstagram()
    } catch (e: any) {
      setPageStatus({ ok: false, msg: `✗ Não acessível — ${e.message}` })
      ctx.setPageVerified(false)
    }
  }

  async function searchPages() {
    setPageStatus({ ok: false, msg: 'Buscando...' })
    try {
      const pages = await listPages(form.token.trim())
      if (!pages.length) {
        setPageStatus({ ok: false, msg: 'Nenhuma página encontrada.' })
        return
      }
      setPageOpts(pages)
      setPageStatus({ ok: true, msg: `${pages.length} página(s) encontrada(s)` })
    } catch (e: any) {
      setPageStatus({ ok: false, msg: 'Erro: ' + e.message })
    }
  }

  async function doLookupInstagram() {
    const pageId = form.page_id.trim()
    const token = form.token.trim()
    if (!pageId || !token) {
      setIgStatus('⚠ Preencha o Token e o Page ID primeiro.')
      return
    }
    setIgStatus('Buscando conta do Instagram vinculada...')
    try {
      const id = await lookupInstagram(token, pageId)
      if (id) {
        setField('instagram_id', id)
        setIgStatus(`✓ Instagram encontrado: ${id}`)
      } else {
        setIgStatus('Nenhuma conta do Instagram vinculada a esta Página.')
        setField('instagram_id', '')
      }
    } catch (e: any) {
      setIgStatus('Erro: ' + e.message)
    }
  }

  function doSavePreset() {
    if (!presetName.trim()) {
      toast('Digite um nome para o preset.', 'warn')
      return
    }
    ctx.savePreset(presetName.trim())
    setSelPreset(presetName.trim())
    setSavingPreset(false)
    toast(`Preset "${presetName.trim()}" salvo!`, 'ok')
  }

  return (
    <div>
      <div className="mb-1 text-[21px] font-extrabold tracking-tight">
        Configuração da Conta
      </div>
      <div className="mb-6 text-[13px] text-muted2">
        Token de acesso e IDs da sua conta Meta
      </div>

      {/* presets */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl2 border border-border bg-surface px-3.5 py-3 shadow-card-sm">
        <label className="flex items-center gap-1.5 text-[12px] font-semibold text-muted2">
          <FolderOpen className="h-3.5 w-3.5" /> Preset:
        </label>
        <select
          value={selPreset}
          onChange={(e) => {
            setSelPreset(e.target.value)
            if (e.target.value) {
              ctx.loadPreset(e.target.value)
              toast(`Preset "${e.target.value}" carregado.`, 'ok')
            }
          }}
          className="min-w-[170px] rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
        >
          <option value="">-- selecione --</option>
          {ctx.presetNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {!savingPreset ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSavingPreset(true)
              setPresetName(selPreset)
            }}
          >
            <Save className="h-3 w-3" /> Salvar preset
          </button>
        ) : (
          <span className="flex items-center gap-1.5">
            <input
              autoFocus
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doSavePreset()
                if (e.key === 'Escape') setSavingPreset(false)
              }}
              placeholder="nome do preset..."
              className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
            />
            <button className="btn btn-primary btn-sm" onClick={doSavePreset}>
              <Check className="h-3 w-3" />
            </button>
          </span>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (!selPreset) {
              toast('Selecione um preset para apagar.', 'warn')
              return
            }
            if (confirm(`Apagar preset "${selPreset}"?`)) {
              ctx.deletePreset(selPreset)
              setSelPreset('')
              toast(`Preset apagado.`, 'ok')
            }
          }}
        >
          <Trash2 className="h-3 w-3" /> Apagar
        </button>
        <span className="ml-auto text-[11px] text-muted2">
          Campos salvos automaticamente neste navegador (exceto o token)
        </span>
      </div>

      {/* token */}
      <Card title="Token de Acesso" icon={<Key className="h-3.5 w-3.5" />}>
        <div className="mb-3.5 rounded-[9px] border border-warn/20 border-l-[3px] border-l-warn bg-warn/[0.07] px-3.5 py-2.5 text-[12px] text-ink">
          Por segurança, o token <strong>não</strong> é salvo automaticamente — cole-o a
          cada sessão.
        </div>
        <div className="field">
          <label>
            Access Token <span className="text-danger">*</span>
          </label>
          <input
            type={showToken ? 'text' : 'password'}
            value={form.token}
            placeholder="EAAxxxxxxxxxxxxxxx..."
            onChange={(e) => {
              setField('token', e.target.value)
              setTokenStatus(null)
            }}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowToken((s) => !s)}>
              <Eye className="h-3 w-3" /> Mostrar/ocultar
            </button>
            <button className="btn btn-ghost btn-sm" onClick={testToken}>
              <Check className="h-3 w-3" /> Testar token
            </button>
            {tokenStatus && (
              <span
                className={`text-[12px] font-bold ${tokenStatus.ok ? 'text-ok' : 'text-danger'}`}
              >
                {tokenStatus.msg}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* IDs */}
      <Card title="IDs da Conta" icon={<IdCard className="h-3.5 w-3.5" />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            field="ad_account"
            label="Ad Account ID"
            required
            placeholder="act_000000000000"
            hint="Formato: act_XXXXXXXXX"
          />
          <div className="field">
            <label>
              Page ID (Fanpage) <span className="text-danger">*</span>
            </label>
            <div className="flex gap-1.5">
              <input
                value={form.page_id}
                placeholder="000000000000"
                className="flex-1"
                onChange={(e) => {
                  setField('page_id', e.target.value)
                  ctx.setPageVerified(false)
                  setPageStatus(null)
                }}
                onBlur={testPage}
              />
              <button className="btn btn-ghost btn-sm" onClick={searchPages} title="Buscar páginas">
                <Search className="h-3 w-3" />
              </button>
            </div>
            {pageStatus && (
              <div
                className={`text-[11px] font-semibold ${pageStatus.ok ? 'text-ok' : 'text-danger'}`}
              >
                {pageStatus.msg}
              </div>
            )}
            {pageOpts.length > 0 && (
              <select
                className="mt-1.5"
                onChange={(e) => {
                  if (e.target.value) {
                    setField('page_id', e.target.value)
                    testPage()
                  }
                }}
              >
                <option value="">-- selecione --</option>
                {pageOpts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="field">
            <label>Instagram Account ID</label>
            <div className="flex gap-1.5">
              <input
                value={form.instagram_id}
                placeholder="Clique na lupa para buscar"
                className="flex-1"
                onChange={(e) => setField('instagram_id', e.target.value)}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={doLookupInstagram}
                title="Buscar IG vinculado"
              >
                <Search className="h-3 w-3" />
              </button>
            </div>
            <div className="text-[11px] text-muted2">
              {igStatus || 'Clique na lupa após preencher Page ID e Token.'}
            </div>
          </div>
          <Input field="pixel_id" label="Pixel ID" placeholder="000000000000" />
          <Select field="pixel_event" label="Evento do Pixel" options={PIXEL_EVENTS} />
        </div>
      </Card>

      <div className="mt-5 flex gap-2.5">
        <button className="btn btn-primary" onClick={onNext}>
          Próximo: Estrutura →
        </button>
      </div>
    </div>
  )
}
