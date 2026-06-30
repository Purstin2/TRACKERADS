import { useEffect, useState } from 'react'
import { Boxes, X, Plus, Check, RefreshCw } from 'lucide-react'
import { useUploader } from '../UploaderContext'
import {
  listBusinesses, listCatalogs, createCatalog, listProductSets, createProduct, linkCatalogToAccount,
} from '../lib/fb'
import { toast } from '@/components/ui/toast'

type Biz = { id: string; name: string }
type Cat = { id: string; name: string; product_count?: number }
type PSet = { id: string; name: string; product_count?: number }

/** Botão que abre a configuração de Catálogo (criar catálogo + produto pra
 *  rodar anúncio de catálogo/coleção — esconde o criativo na biblioteca). */
export function CatalogSetupButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Criar catálogo + produto pra rodar anúncio de catálogo (esconde na biblioteca)">
        <Boxes className="h-3 w-3" /> Catálogo
      </button>
      {open && <CatalogSetupModal onClose={() => setOpen(false)} />}
    </>
  )
}

function CatalogSetupModal({ onClose }: { onClose: () => void }) {
  const ctx = useUploader()
  const token = ctx.form.token.trim()
  const [biz, setBiz] = useState<Biz[] | null>(null)
  const [bizSel, setBizSel] = useState('')
  const [cats, setCats] = useState<Cat[] | null>(null)
  const [catSel, setCatSel] = useState(ctx.form.catalog_id || '')
  const [newCat, setNewCat] = useState('')
  const [sets, setSets] = useState<PSet[] | null>(null)
  const [setSel, setSetSel] = useState(ctx.form.product_set_id || '')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  // produto
  const [pName, setPName] = useState('')
  const [pPrice, setPPrice] = useState('97')
  const [pUrl, setPUrl] = useState(ctx.form.url_destino || '')
  const [pImg, setPImg] = useState('')

  useEffect(() => {
    if (!token) { setErr('Cole o token na aba Conta primeiro.'); return }
    setBusy('Buscando negócios…')
    listBusinesses(token)
      .then((b) => { setBiz(b); setBusy(''); if (b.length === 1) setBizSel(b[0].id) })
      .catch((e) => { setErr(e.message); setBusy('') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!bizSel) return
    setBusy('Buscando catálogos…'); setErr('')
    listCatalogs(token, bizSel)
      .then((c) => { setCats(c); setBusy('') })
      .catch((e) => { setErr(e.message); setBusy('') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizSel])

  useEffect(() => {
    if (!catSel) { setSets(null); return }
    listProductSets(token, catSel).then(setSets).catch(() => setSets([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catSel])

  async function doCreateCat() {
    if (!newCat.trim()) return toast('Dê um nome ao catálogo.', 'warn')
    if (!bizSel) return toast('Escolha o negócio.', 'warn')
    setBusy('Criando catálogo…')
    try {
      const r = await createCatalog(token, bizSel, newCat.trim())
      await linkCatalogToAccount(token, r.id, ctx.form.ad_account.trim())
      const c = await listCatalogs(token, bizSel)
      setCats(c); setCatSel(r.id); setNewCat(''); setBusy('')
      toast('Catálogo criado e vinculado à conta.', 'ok')
    } catch (e: any) { setErr(e.message); setBusy('') }
  }

  async function doAddProduct() {
    if (!catSel) return toast('Escolha/crie o catálogo primeiro.', 'warn')
    if (!pName.trim() || !pUrl.trim() || !pImg.trim()) return toast('Preencha nome, URL e imagem do produto.', 'warn')
    setBusy('Adicionando produto…')
    try {
      await createProduct(token, catSel, {
        retailer_id: 'p_' + Date.now().toString(36),
        name: pName.trim(),
        url: pUrl.trim(),
        image_url: pImg.trim(),
        price: parseFloat(pPrice) || 0,
        currency: 'BRL',
      })
      const s = await listProductSets(token, catSel)
      setSets(s); if (s.length && !setSel) setSetSel(s[0].id)
      setBusy('')
      toast('Produto adicionado ao catálogo.', 'ok')
    } catch (e: any) { setErr(e.message); setBusy('') }
  }

  function doSave() {
    if (!catSel) return toast('Escolha/crie o catálogo.', 'warn')
    ctx.setField('catalog_id', catSel)
    ctx.setField('product_set_id', setSel)
    toast('Catálogo selecionado para os anúncios.', 'ok')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-[560px] max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header sticky top-0 z-10 bg-[#0d1220]">
          <h3 className="flex items-center gap-2 text-[13px] font-bold"><Boxes className="h-4 w-4" /> Catálogo (esconder anúncio)</h3>
          <button onClick={onClose} className="text-muted2 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        <div className="card-body flex flex-col gap-3">
          <p className="text-[11.5px] text-muted2">Crie um catálogo + 1 produto. Depois o anúncio roda em formato de catálogo (aparece como template na biblioteca, escondendo seu vídeo).</p>
          {busy && <div className="text-center text-[11px] text-brand-2 animate-pulse">{busy}</div>}
          {err && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12px] text-danger">❌ {err}</div>}

          {/* negócio */}
          <div className="field">
            <label>Negócio (Business)</label>
            <select value={bizSel} onChange={(e) => { setBizSel(e.target.value); setCats(null); setCatSel('') }}>
              <option value="">-- selecione --</option>
              {(biz || []).map((b) => <option key={b.id} value={b.id}>{b.name} ({b.id})</option>)}
            </select>
          </div>

          {/* catálogo */}
          {bizSel && (
            <div className="rounded-xl2 border border-border bg-surface2/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted2">Catálogo</span>
                <button className="btn btn-ghost btn-sm" onClick={() => listCatalogs(token, bizSel).then(setCats)}><RefreshCw className="h-3 w-3" /></button>
              </div>
              <select value={catSel} onChange={(e) => setCatSel(e.target.value)} className="mb-2">
                <option value="">-- escolher catálogo existente --</option>
                {(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.product_count ?? 0} prod.)</option>)}
              </select>
              <div className="flex items-end gap-2">
                <div className="field flex-1"><label>…ou criar novo</label>
                  <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="ex: ULTRAPACK Catálogo" />
                </div>
                <button className="btn btn-ghost btn-sm" onClick={doCreateCat}><Plus className="h-3 w-3" /> Criar</button>
              </div>
            </div>
          )}

          {/* produto */}
          {catSel && (
            <div className="rounded-xl2 border border-border bg-surface2/40 p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted2">Adicionar produto</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="field"><label>Nome</label><input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Ultra Pack STL" /></div>
                <div className="field"><label>Preço (R$)</label><input value={pPrice} onChange={(e) => setPPrice(e.target.value)} placeholder="97" /></div>
                <div className="field"><label>URL (link da oferta)</label><input value={pUrl} onChange={(e) => setPUrl(e.target.value)} placeholder="https://…" /></div>
                <div className="field"><label>Imagem (URL)</label><input value={pImg} onChange={(e) => setPImg(e.target.value)} placeholder="https://…/img.jpg" /></div>
              </div>
              <button className="btn btn-ghost btn-sm mt-2" onClick={doAddProduct}><Plus className="h-3 w-3" /> Adicionar produto</button>

              {sets && sets.length > 0 && (
                <div className="field mt-3">
                  <label>Conjunto de produtos (usado no anúncio)</label>
                  <select value={setSel} onChange={(e) => setSetSel(e.target.value)}>
                    <option value="">-- todos os produtos (padrão) --</option>
                    {sets.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.product_count ?? 0})</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={doSave} disabled={!catSel}><Check className="h-3.5 w-3.5" /> Usar este catálogo</button>
          </div>
          {ctx.form.catalog_id && <div className="text-[10.5px] text-muted2">Selecionado: catálogo <b>{ctx.form.catalog_id}</b>{ctx.form.product_set_id ? ` · set ${ctx.form.product_set_id}` : ''}</div>}
        </div>
      </div>
    </div>
  )
}
