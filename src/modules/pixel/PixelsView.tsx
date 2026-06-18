import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, RefreshCw, Crosshair, Check, X, Power, Code2, Copy, FlaskConical } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/toast'
import {
  fetchRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  toggleRoute,
  testRoute,
  type PixelRoute,
  type RouteInput,
} from './pixels'

const GATEWAYS = ['kirvano', 'hotmart']

const MATCH_LABEL: Record<string, string> = {
  offer: 'Por oferta',
  product: 'Por produto',
  any: 'Padrão (todas)',
}

type FormState = {
  id?: string
  label: string
  match_type: 'offer' | 'product' | 'any'
  offer_id: string
  pixel_id: string
  capi_token: string
  test_code: string
  gateways: string[]
  checkout_selector: string
  checkout_keywords: string // csv na UI, array no Supabase
  fire_on_pix: boolean
  active: boolean
  hasToken: boolean
}

const EMPTY: FormState = {
  label: '',
  match_type: 'offer',
  offer_id: '',
  pixel_id: '',
  capi_token: '',
  test_code: '',
  gateways: [],
  checkout_selector: '',
  checkout_keywords: '',
  fire_on_pix: false,
  active: true,
  hasToken: false,
}

const PROD_URL = 'https://trackerads-nine.vercel.app'
const origin = typeof window !== 'undefined'
  ? (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? PROD_URL
      : window.location.origin)
  : PROD_URL

type SnippetData = {
  label: string
  pixel_id: string
  checkout_selector: string | null
  checkout_keywords: string[] | null
}

function buildSnippet(d: SnippetData): string {
  const lines: string[] = [`window.FB_PIXEL_ID = '${d.pixel_id}'`]
  if (d.checkout_selector || d.checkout_keywords?.length) {
    lines.push(`window.FB_CLICK_EVENT = 'InitiateCheckout'`)
    if (d.checkout_selector) lines.push(`window.FB_CLICK_SELECTOR = '${d.checkout_selector}'`)
    if (d.checkout_keywords?.length) {
      const kws = d.checkout_keywords.map((k) => `'${k.trim()}'`).join(', ')
      lines.push(`window.FB_CHECKOUT_KEYWORDS = [${kws}]`)
    }
  }
  const vars = lines.map((l) => `  ${l}`).join('\n')
  return `<script>\n${vars}\n</script>\n<script src="${origin}/fbtrack.js" defer></script>`
}

export default function PixelsView() {
  const [routes, setRoutes] = useState<PixelRoute[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [snippet, setSnippet] = useState<SnippetData | null>(null)
  const [copied, setCopied] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const connected = !!supabase()

  function copySnippet(d: SnippetData) {
    navigator.clipboard.writeText(buildSnippet(d))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function runTest(r: PixelRoute) {
    if (!r.test_code) {
      return toast('Defina o Test Event Code neste pixel (pegue na aba Test Events do Meta) e salve antes de testar.', 'err')
    }
    setTesting(r.id)
    const res = await testRoute(r.id, 'Purchase')
    setTesting(null)
    if (res.ok) {
      toast(`✓ Evento enviado ao pixel ${res.pixel}. Veja na aba Test Events (código ${res.testCode}).`, 'ok')
    } else {
      toast(`✗ ${res.error || 'falhou'}${res.details ? ' — ' + res.details : ''}`, 'err')
    }
  }

  async function load() {
    if (!connected) return
    setLoading(true)
    try {
      setRoutes(await fetchRoutes())
    } catch {}
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  if (!connected) {
    return (
      <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
        Conecte a Supabase (aba Conexões do Tracker) e rode <code>supabase/pixel_routes.sql</code> pra gerenciar os pixels por oferta.
      </div>
    )
  }

  function openNew() {
    setForm({ ...EMPTY })
  }
  function openEdit(r: PixelRoute) {
    setForm({
      id: r.id,
      label: r.label || '',
      match_type: r.match_type,
      offer_id: r.offer_id || '',
      pixel_id: r.pixel_id,
      capi_token: '', // não vem do servidor — em branco = mantém o atual
      test_code: r.test_code || '',
      gateways: r.gateways || [],
      checkout_selector: r.checkout_selector || '',
      checkout_keywords: r.checkout_keywords?.join(', ') || '',
      fire_on_pix: r.fire_on_pix ?? false,
      active: r.active,
      hasToken: r.has_token,
    })
  }

  async function save() {
    if (!form) return
    if (!form.pixel_id.trim()) return toast('Informe o Pixel ID', 'err')
    if (form.match_type !== 'any' && !form.offer_id.trim())
      return toast('Informe o offer_id/product_id da oferta', 'err')
    if (!form.id && !form.capi_token.trim()) return toast('Informe o token CAPI', 'err')

    setSaving(true)
    const kws = form.checkout_keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    const input: RouteInput = {
      label: form.label,
      match_type: form.match_type,
      offer_id: form.offer_id,
      pixel_id: form.pixel_id,
      capi_token: form.capi_token, // vazio na edição = mantém
      test_code: form.test_code,
      gateways: form.gateways,
      checkout_selector: form.checkout_selector || null,
      checkout_keywords: kws.length ? kws : null,
      fire_on_pix: form.fire_on_pix,
      active: form.active,
    }
    const res = form.id ? await updateRoute(form.id, input) : await createRoute(input)
    setSaving(false)
    if (res.error) return toast(res.error, 'err')
    toast(form.id ? 'Pixel atualizado' : 'Pixel adicionado', 'ok')
    const snippetData: SnippetData = {
      label: form.label || form.pixel_id,
      pixel_id: form.pixel_id.trim(),
      checkout_selector: form.checkout_selector.trim() || null,
      checkout_keywords: kws.length ? kws : null,
    }
    setForm(null)
    setSnippet(snippetData)
    load()
  }

  async function remove(r: PixelRoute) {
    if (!confirm(`Excluir o pixel "${r.label || r.pixel_id}"?`)) return
    const res = await deleteRoute(r.id)
    if (res.error) return toast(res.error, 'err')
    toast('Pixel removido', 'ok')
    load()
  }

  async function toggle(r: PixelRoute) {
    // atualiza visual de imediato sem esperar o Supabase
    setRoutes((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)))
    const res = await toggleRoute(r.id, !r.active)
    if (res.error) {
      setRoutes((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: r.active } : x)))
      return toast(res.error, 'err')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="text-[12px] text-muted">
          Cada oferta manda pro seu pixel. A mesma oferta em vários gateways/países cai no mesmo pixel.
          Sem mapeamento → usa o pixel padrão da Vercel.
        </p>
        <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setShowHelp((v) => !v)}>
          {showHelp ? 'Ocultar guia' : '❓ Como adicionar'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" /> Adicionar pixel
        </button>
      </div>

      {showHelp && (
        <div className="rounded-[10px] border border-brand/20 border-l-[3px] border-l-brand bg-brand/[0.05] px-4 py-3 text-[12px] leading-relaxed text-muted">
          <div className="mb-2 text-[13px] font-bold text-ink">➕ Adicionar uma oferta/página nova</div>
          <ol className="ml-4 list-decimal space-y-1.5">
            <li>
              No <b>Events Manager</b> da Meta, escolha (ou crie) o Pixel da oferta e gere o token:
              <i> Configurações → Conversions API → Gerar token de acesso</i>.
            </li>
            <li>
              Descubra a <b>chave de roteamento</b>:
              <ul className="ml-4 mt-1 list-disc space-y-1">
                <li>
                  <b>Kirvano</b> (1 checkout com várias ofertas de preço, mas 1 produto só) → use
                  <b> Por produto (product_id)</b>. Assim <u>todas as variações de preço caem no mesmo pixel</u> pra sempre.
                </li>
                <li>Se cada oferta for um produto diferente → use <b>Por oferta (offer_id)</b>.</li>
                <li>O <span className="font-mono">product_id</span>/<span className="font-mono">offer_id</span> aparece em cada venda na aba <b>Pedidos</b> (ou no painel da Kirvano).</li>
              </ul>
            </li>
            <li><b>Adicionar pixel</b> → preencha Nome, Roteamento, a chave, Pixel ID e Token → Salvar. <b>Vale na próxima venda, sem deploy.</b></li>
            <li>No site da oferta, aponte o <span className="font-mono">window.FB_PIXEL_ID</span> do <span className="font-mono">fbtrack.js</span> pro <b>mesmo</b> pixel (pro PageView/ViewContent baterem no lugar certo).</li>
          </ol>
          <div className="mb-1.5 mt-3 text-[13px] font-bold text-ink">🧪 Como validar (e por que o Test Events pode parecer vazio)</div>
          <ul className="ml-4 list-disc space-y-1">
            <li>São <b>dois caminhos</b>: o <b>browser</b> (<span className="font-mono">fbtrack.js</span> → PageView/ViewContent) e o <b>servidor</b> (webhook → Purchase/InitiateCheckout via CAPI).</li>
            <li><b>Browser:</b> cole o script (botão <span className="font-mono">&lt;/&gt;</span>), abra a página e veja no <b>Pixel Helper</b> ou em <b>Events Manager → Visão geral</b>. O browser <u>não</u> usa Test Event Code.</li>
            <li><b>Servidor (CAPI):</b> só aparece na aba <b>Test Events</b> se o pixel tiver um <b>Test Event Code</b>. Salve o código no pixel e clique no <b>🧪 frasco</b> do card → manda 1 evento na hora.</li>
            <li>Em produção, as vendas reais caem na <b>Visão geral</b> (não no Test Events) — isso é o esperado.</li>
          </ul>
          <div className="mb-1.5 mt-3 text-[13px] font-bold text-ink">🔌 Adicionar um gateway novo</div>
          <ul className="ml-4 list-disc space-y-1">
            <li><b>Kirvano</b> e <b>Hotmart</b> já são suportados — só colar a URL da aba <b>Webhook</b> na plataforma e usar o mesmo segredo.</li>
            <li>Plataforma nova (ex: Cartpanda) → usa o endpoint <span className="font-mono">?gateway=generico</span> se ela enviar o JSON no formato esperado; formatos diferentes precisam de um parser no <span className="font-mono">webhook.js</span> (tarefa de dev).</li>
            <li>Ofertas sem regra aqui caem no <b>pixel padrão</b> da Vercel (<span className="font-mono">META_PIXEL_ID</span>).</li>
          </ul>
        </div>
      )}

      {routes.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border py-12 text-center text-[13px] text-muted2">
          Nenhum pixel cadastrado. Clique em <b>Adicionar pixel</b> pra rotear uma oferta pro pixel certo.
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {routes.map((r) => (
            <div
              key={r.id}
              className={`card card-body flex flex-col gap-2 ${!r.active ? 'opacity-55' : ''}`}
            >
              <div className="flex items-start gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand-2">
                  <Crosshair className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-[13px] font-bold">{r.label || 'Pixel sem nome'}</h4>
                    <span className="rounded-full border border-border2 bg-surface2 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-muted2">
                      {MATCH_LABEL[r.match_type]}
                    </span>
                  </div>
                  <div className="truncate font-mono text-[11px] text-muted2">ID {r.pixel_id}</div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button className="btn btn-ghost btn-sm !px-1.5" title={r.active ? 'Desativar' : 'Ativar'} onClick={() => toggle(r)}>
                    <Power className={`h-3.5 w-3.5 ${r.active ? 'text-ok' : 'text-muted2'}`} />
                  </button>
                  <button className="btn btn-ghost btn-sm !px-1.5" title="Testar evento (manda 1 evento ao Test Events)" onClick={() => runTest(r)} disabled={testing === r.id}>
                    <FlaskConical className={`h-3.5 w-3.5 ${testing === r.id ? 'animate-pulse text-warn' : 'text-warn'}`} />
                  </button>
                  <button className="btn btn-ghost btn-sm !px-1.5" title="Ver script da página" onClick={() => setSnippet({ label: r.label || r.pixel_id, pixel_id: r.pixel_id, checkout_selector: r.checkout_selector, checkout_keywords: r.checkout_keywords })}>
                    <Code2 className="h-3.5 w-3.5 text-brand-2" />
                  </button>
                  <button className="btn btn-ghost btn-sm !px-1.5" title="Editar" onClick={() => openEdit(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button className="btn btn-ghost btn-sm !px-1.5" title="Excluir" onClick={() => remove(r)}>
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted2">
                {r.match_type !== 'any' && (
                  <span>
                    oferta: <span className="font-mono text-muted">{r.offer_id}</span>
                  </span>
                )}
                <span>
                  token: {r.has_token ? <span className="text-ok">•••• {r.token_last4}</span> : <span className="text-danger">faltando</span>}
                </span>
                {r.test_code && <span>teste: {r.test_code}</span>}
                {r.gateways?.length ? <span>gateways: {r.gateways.join(', ')}</span> : <span>todos os gateways</span>}
                {r.fire_on_pix && <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-warn">Pix → Purchase</span>}
              </div>
              {(r.checkout_selector || r.checkout_keywords?.length) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted2">
                  {r.checkout_selector && <span>selector: <span className="font-mono text-muted">{r.checkout_selector}</span></span>}
                  {r.checkout_keywords?.length && <span>keywords: <span className="font-mono text-muted">{r.checkout_keywords.join(', ')}</span></span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de snippet — aparece automaticamente após salvar ou ao clicar em </> */}
      {snippet && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-16" onClick={() => setSnippet(null)}>
          <div className="card w-full max-w-[600px] card-body" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ok/12 text-ok">
                <Code2 className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-bold truncate">Script — {snippet.label}</h3>
                <p className="text-[11px] text-muted">Cole no &lt;head&gt; de cada página de vendas deste produto</p>
              </div>
              <button className="btn btn-ghost btn-sm !px-1.5" onClick={() => setSnippet(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <pre className="my-3 overflow-x-auto rounded-[8px] border border-border bg-[#0a0c19] p-4 text-[11.5px] leading-relaxed text-muted font-mono whitespace-pre">
              {buildSnippet(snippet)}
            </pre>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted2">
                {snippet.checkout_selector || snippet.checkout_keywords?.length
                  ? 'Inclui rastreio de clique (InitiateCheckout) no browser.'
                  : 'Dispara PageView e anexa fbc/fbp nos links de checkout automaticamente.'}
              </p>
              <button
                className="btn btn-primary shrink-0"
                onClick={() => { copySnippet(snippet); toast('Script copiado!', 'ok') }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiado!' : 'Copiar script'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal/painel de edição */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <div className="card w-full max-w-[520px] card-body" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[14px] font-bold">{form.id ? 'Editar pixel' : 'Novo pixel'}</h3>
              <button className="btn btn-ghost btn-sm !px-1.5" onClick={() => setForm(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3">
              <div className="field">
                <label>Nome (pra você identificar)</label>
                <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex: Printing 3D — PT/BR" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field">
                  <label>Roteamento</label>
                  <select value={form.match_type} onChange={(e) => setForm({ ...form, match_type: e.target.value as FormState['match_type'] })}>
                    <option value="offer">Por oferta (offer_id)</option>
                    <option value="product">Por produto (product_id)</option>
                    <option value="any">Padrão (todas as ofertas)</option>
                  </select>
                </div>
                {form.match_type !== 'any' && (
                  <div className="field">
                    <label>{form.match_type === 'offer' ? 'offer_id' : 'product_id'} da oferta</label>
                    <input
                      value={form.offer_id}
                      onChange={(e) => setForm({ ...form, offer_id: e.target.value })}
                      placeholder={form.match_type === 'offer' ? 'a5f1ebb4-...' : '7930420'}
                      className="font-mono text-[12px]"
                    />
                  </div>
                )}
              </div>

              <div className="field">
                <label>Pixel ID (Meta)</label>
                <input value={form.pixel_id} onChange={(e) => setForm({ ...form, pixel_id: e.target.value })} placeholder="000000000000" className="font-mono text-[12px]" />
              </div>

              <div className="field">
                <label>
                  CAPI Access Token {form.id && <span className="text-muted2">(deixe em branco pra manter {form.hasToken ? 'o atual' : ''})</span>}
                </label>
                <input
                  type="password"
                  value={form.capi_token}
                  onChange={(e) => setForm({ ...form, capi_token: e.target.value })}
                  placeholder={form.hasToken ? '•••••••••• (mantido)' : 'EAA...'}
                />
                <div className="text-[11px] text-muted2">Events Manager → Configurações → Conversions API → Gerar token. Fica protegido no servidor.</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field">
                  <label>Test Event Code (opcional)</label>
                  <input value={form.test_code} onChange={(e) => setForm({ ...form, test_code: e.target.value })} placeholder="TEST12345" />
                </div>
                <div className="field">
                  <label>Gateways (vazio = todos)</label>
                  <div className="flex gap-2 pt-1">
                    {GATEWAYS.map((g) => (
                      <label key={g} className="flex items-center gap-1.5 text-[12px] capitalize text-muted">
                        <input
                          type="checkbox"
                          checked={form.gateways.includes(g)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              gateways: e.target.checked ? [...form.gateways, g] : form.gateways.filter((x) => x !== g),
                            })
                          }
                        />
                        {g}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted2">Rastreio browser — InitiateCheckout (opcional)</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="field">
                    <label>CSS Selector do botão</label>
                    <input
                      value={form.checkout_selector}
                      onChange={(e) => setForm({ ...form, checkout_selector: e.target.value })}
                      placeholder=".btn-checkout, #comprar"
                      className="font-mono text-[12px]"
                    />
                    <div className="text-[11px] text-muted2">Dispara IC no clique de qualquer elemento que case o seletor.</div>
                  </div>
                  <div className="field">
                    <label>Keywords no link (vírgula)</label>
                    <input
                      value={form.checkout_keywords}
                      onChange={(e) => setForm({ ...form, checkout_keywords: e.target.value })}
                      placeholder="kirvano, lobinhos, pay."
                      className="font-mono text-[12px]"
                    />
                    <div className="text-[11px] text-muted2">Dispara IC quando o href do botão contém qualquer uma das palavras.</div>
                  </div>
                </div>
                <label className="mt-2 flex items-center gap-2 text-[12px] text-muted">
                  <input type="checkbox" checked={form.fire_on_pix} onChange={(e) => setForm({ ...form, fire_on_pix: e.target.checked })} />
                  Disparar <b>Purchase</b> para Pix gerado (além de aprovado) — Meta dedup por checkout_id
                </label>
              </div>

              <label className="flex items-center gap-2 text-[12px] text-muted">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Ativo (desmarque pra pausar sem excluir)
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                <Check className="h-4 w-4" /> {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
