import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { Database, ExternalLink, Plus, RefreshCw, Search, X, Archive, LogIn, LogOut } from 'lucide-react'
import { isConfigured, saveCreds, clearCreds, signIn, signOut, useSession } from '@/lib/supabase'
import { classifyOffer, type AdCount } from './classification'
import {
  getOffers,
  getAllAdCounts,
  addOffer,
  deleteOffer,
  updateOffer,
  addAdCount,
  getComments,
  addComment,
  runScrape,
  getDiscoveryKeywords,
  getDiscoveredOffers,
  addKeyword,
  deleteKeyword,
  approveDiscovered,
  dismissDiscovered,
  type Offer,
  type DiscoveredOffer,
  type Keyword,
} from './api'
import { toast } from '@/components/ui/toast'

/* ── tela de conexão ── */
function ConnectScreen() {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  return (
    <div className="mx-auto max-w-[560px]">
      <div className="card">
        <div className="card-body flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/12 text-brand-2">
            <Database className="h-7 w-7" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold">Conectar sua Supabase</h2>
            <p className="mt-1 text-[13px] text-muted">
              Cole as credenciais do seu projeto TrackerAds — seus tracks (ofertas, histórico, discovery) aparecem
              automaticamente. Salvo só neste navegador.
            </p>
          </div>
          <div className="w-full text-left">
            <div className="field mb-3">
              <label>Project URL</label>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
            </div>
            <div className="field">
              <label>Anon (public) key</label>
              <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi..." />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!url.trim() || !key.trim()) return toast('Preencha URL e key', 'err')
              saveCreds({ url: url.trim(), key: key.trim() })
              window.location.reload()
            }}
          >
            <Database className="h-4 w-4" /> Conectar
          </button>
          <p className="text-[11px] text-muted2">
            Em Supabase → Project Settings → API. Use a <b>anon public</b> key.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── login (conta TrackerAds, por causa do RLS) ── */
function LoginModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="text-[13px] font-bold">Entrar — conta TrackerAds</h3>
          <button onClick={onClose} className="text-muted2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="card-body flex flex-col gap-3">
          <p className="text-[12px] text-muted">
            Suas tabelas têm RLS por usuário — entre com o mesmo e-mail/senha que você usa no TrackerAds para ver seus dados.
          </p>
          <div className="field">
            <label>E-mail</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
          </div>
          <div className="field">
            <label>Senha</label>
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={go}>
            <LogIn className="h-4 w-4" /> {busy ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </div>
    </div>
  )
  async function go() {
    if (!email.trim() || !pwd) return toast('Preencha e-mail e senha', 'err')
    setBusy(true)
    try {
      await signIn(email, pwd)
      toast('Conectado ✓', 'ok')
      onClose()
    } catch (e: any) {
      toast(e.message, 'err')
      setBusy(false)
    }
  }
}

/* ── card de oferta ── */
function OfferCard({ offer, history, onClick }: { offer: Offer; history: AdCount[]; onClick: () => void }) {
  const cls = classifyOffer(history)
  const tags = Array.isArray(offer.tags) ? offer.tags : typeof offer.tags === 'string' ? offer.tags.split(',').filter(Boolean) : []
  const spark = history.slice(-20).map((h, i) => ({ i, c: h.count }))
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-xl2 border bg-surface p-4 text-left shadow-card-sm transition-all hover:-translate-y-0.5 ${cls.bg}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-[13px] font-bold">{offer.name}</span>
        <a href={offer.link} target="_blank" onClick={(e) => e.stopPropagation()} className="flex-shrink-0 text-muted2 hover:text-brand-2">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-[26px] font-extrabold leading-none">{offer.last_ad_count ?? '—'}</span>
        <span className="pb-1 text-[11px] text-muted2">anúncios ativos</span>
      </div>
      <span className={`w-fit rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls.bg} ${cls.color}`}>{cls.label}</span>
      {spark.length > 1 && (
        <div className="h-9">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <Line type="monotone" dataKey="c" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted2">
        {offer.days_running != null && <span>⏱ {offer.days_running}d rodando</span>}
        {tags.map((t) => (
          <span key={t} className="rounded-full bg-surface2 px-1.5 py-0.5">
            {t}
          </span>
        ))}
      </div>
    </button>
  )
}

/* ── detalhe ── */
function OfferDetail({ offer, history, onClose, onDelete, onChanged }: { offer: Offer; history: AdCount[]; onClose: () => void; onDelete: () => void; onChanged: () => void }) {
  const data = history.map((h) => ({ d: new Date(h.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), c: h.count }))
  const cls = classifyOffer(history)
  const [count, setCount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [comments, setComments] = useState<any[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getComments(offer.id).then(setComments).catch(() => {})
  }, [offer.id])

  async function saveCount() {
    const n = parseInt(count)
    if (isNaN(n) || n < 0) return toast('Quantidade inválida', 'err')
    setBusy(true)
    try {
      await addAdCount(offer.id, n, new Date(date + 'T12:00:00').toISOString())
      toast('Contagem registrada', 'ok')
      setCount('')
      onChanged()
    } catch (e: any) {
      toast(e.message, 'err')
    }
    setBusy(false)
  }
  async function saveNote() {
    if (!note.trim()) return
    try {
      await addComment(offer.id, note.trim())
      setNote('')
      setComments(await getComments(offer.id))
      toast('Nota salva', 'ok')
    } catch (e: any) {
      toast('Erro ao salvar nota: ' + e.message, 'err')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card max-h-[92vh] w-full max-w-[680px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="text-[13px] font-bold">{offer.name}</h3>
          <button onClick={onClose} className="text-muted2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="card-body flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${cls.bg} ${cls.color}`}>{cls.label}</span>
            <span className="text-[13px]">
              <b className="text-[18px]">{offer.last_ad_count ?? '—'}</b> ativos
            </span>
            {offer.days_running != null && <span className="text-[12px] text-muted">⏱ {offer.days_running} dias</span>}
            <a href={offer.link} target="_blank" className="btn btn-ghost btn-sm ml-auto">
              <ExternalLink className="h-3 w-3" /> Ads Library
            </a>
          </div>

          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: '#8b93a6' }} />
                <YAxis tick={{ fontSize: 10, fill: '#8b93a6' }} />
                <Tooltip contentStyle={{ background: '#0d0f1e', border: '1px solid #1d2139', borderRadius: 8, fontSize: 11 }} />
                <Line type="monotone" dataKey="c" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} name="anúncios" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* contagem manual */}
          <div className="rounded-xl2 border border-border bg-surface2 p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted2">Adicionar contagem do dia (manual)</div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="field" style={{ width: 110 }}>
                <label>Nº de ads</label>
                <input type="number" min={0} value={count} onChange={(e) => setCount(e.target.value)} placeholder="ex: 47" />
              </div>
              <div className="field">
                <label>Data</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ colorScheme: 'dark' }} />
              </div>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveCount}>
                <Plus className="h-3 w-3" /> Registrar
              </button>
            </div>
          </div>

          {/* notas */}
          <div className="rounded-xl2 border border-border bg-surface2 p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted2">Notas táticas</div>
            <div className="flex gap-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="ex: mudou o criativo principal, subiu o preço, escalou..."
                className="flex-1 resize-y rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
              />
              <button className="btn btn-primary btn-sm self-end" onClick={saveNote}>
                Salvar
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {comments.map((c, i) => (
                <div key={i} className="rounded-[7px] bg-surface px-3 py-2 text-[12px]">
                  <div>{c.text || c.comment || c.content || c.body || c.note || '(nota)'}</div>
                  {(c.created_at || c.timestamp) && (
                    <div className="mt-0.5 text-[10px] text-muted2">{new Date(c.created_at || c.timestamp).toLocaleString('pt-BR')}</div>
                  )}
                </div>
              ))}
              {!comments.length && <div className="text-[11px] text-muted2">Sem notas ainda.</div>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-ghost btn-sm w-fit"
              onClick={async () => {
                try {
                  await updateOffer(offer.id, { is_archived: !offer.is_archived })
                  toast(offer.is_archived ? 'Oferta reativada' : 'Arquivada — para de scrapear, mas mantém os dados', 'ok')
                  onChanged()
                  onClose()
                } catch (e: any) {
                  toast(e.message, 'err')
                }
              }}
            >
              <Archive className="h-3 w-3" /> {offer.is_archived ? 'Reativar acompanhamento' : 'Arquivar (manter dados)'}
            </button>
            <button
              className="btn btn-ghost btn-sm w-fit text-danger"
              onClick={() => {
                if (confirm('Remover de vez? Apaga também o histórico salvo.')) {
                  onDelete()
                  onClose()
                }
              }}
            >
              ✕ Remover de vez
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** variação % da contagem de ads num período (7/14/30/90 dias) */
function trendChange(h: AdCount[], days: number): number {
  if (h.length < 2) return 0
  const last = h[h.length - 1].count
  const target = Date.now() - days * 86400000
  let base = h[0].count
  for (const x of h) if (new Date(x.timestamp).getTime() <= target) base = x.count
  return base > 0 ? ((last - base) / base) * 100 : 0
}

/* ── aba ofertas ── */
function OffersView({ loggedIn, onLoginClick }: { loggedIn: boolean; onLoginClick: () => void }) {
  const [offers, setOffers] = useState<Offer[]>([])
  const [counts, setCounts] = useState<Record<string, AdCount[]>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [filterCode, setFilterCode] = useState('')
  const [detail, setDetail] = useState<Offer | null>(null)
  const [adding, setAdding] = useState(false)
  const [newOffer, setNewOffer] = useState({ name: '', link: '' })
  const [statusMode, setStatusMode] = useState<'ativas' | 'inativas' | 'arquivadas' | 'todas'>('ativas')
  const [sortKey, setSortKey] = useState<'count' | 'trend'>('count')
  const [trendWin, setTrendWin] = useState(7)
  const [scraper, setScraper] = useState(() => {
    const def = { localUrl: 'http://localhost:3001', railwayUrl: (import.meta.env.VITE_SCRAPER_URL as string) || '', path: '/api/scrape' }
    try {
      return { ...def, ...JSON.parse(localStorage.getItem('purstin_scraper') || '{}') }
    } catch {
      return def
    }
  })
  const [showScraperCfg, setShowScraperCfg] = useState(false)
  const [scraping, setScraping] = useState(false)
  const saveScraper = (s: typeof scraper) => {
    setScraper(s)
    localStorage.setItem('purstin_scraper', JSON.stringify(s))
  }
  async function runScrapeNow(base: string) {
    if (!base) {
      toast('Configure a URL do scraper primeiro', 'warn')
      setShowScraperCfg(true)
      return
    }
    setScraping(true)
    toast('Scrape disparado — pode levar alguns minutos', 'ok')
    try {
      const res = await runScrape(base.replace(/\/$/, '') + scraper.path)
      toast('Scraper: ' + res, 'ok')
      setTimeout(load, 4000)
    } catch (e: any) {
      toast('Falhou: ' + e.message, 'err')
    }
    setScraping(false)
  }

  async function load() {
    setLoading(true)
    setErr('')
    try {
      const o = await getOffers()
      setOffers(o)
      const c = await getAllAdCounts(o.map((x) => x.id))
      setCounts(c)
    } catch (e: any) {
      setErr(e.message)
    }
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    return offers
      .filter((o) => {
        if (statusMode === 'todas') return true
        if (statusMode === 'arquivadas') return !!o.is_archived
        const archived = !!o.is_archived
        const hasAds = (o.last_ad_count ?? 0) > 0
        if (statusMode === 'inativas') return !archived && !hasAds
        return !archived && hasAds // ativas
      })
      .filter((o) => !search || o.name.toLowerCase().includes(search.toLowerCase()))
      .filter((o) => !filterCode || classifyOffer(counts[o.id] || []).code === filterCode)
      .sort((a, b) => {
        if (sortKey === 'trend') return trendChange(counts[b.id] || [], trendWin) - trendChange(counts[a.id] || [], trendWin)
        return (b.last_ad_count ?? 0) - (a.last_ad_count ?? 0)
      })
  }, [offers, counts, search, filterCode, statusMode, sortKey, trendWin])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar oferta..." className="rounded-[7px] border border-border bg-[#0a0c19] py-1.5 pl-8 pr-3 text-[12px] text-ink" />
        </div>
        <select value={statusMode} onChange={(e) => setStatusMode(e.target.value as any)} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink">
          <option value="ativas">Ativas</option>
          <option value="inativas">Inativas</option>
          <option value="arquivadas">Arquivadas</option>
          <option value="todas">Todas</option>
        </select>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as any)} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink">
          <option value="count">Mais ads</option>
          <option value="trend">Crescimento</option>
        </select>
        {sortKey === 'trend' && (
          <select value={trendWin} onChange={(e) => setTrendWin(+e.target.value)} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink">
            <option value={7}>7d</option>
            <option value={14}>14d</option>
            <option value={30}>30d</option>
            <option value={90}>90d</option>
          </select>
        )}
        <select value={filterCode} onChange={(e) => setFilterCode(e.target.value)} className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink">
          <option value="">Todos status</option>
          <option value="dominante">Dominante</option>
          <option value="escala_conf">Escala confirmada</option>
          <option value="escalando">Escalando</option>
          <option value="validando">Validando</option>
          <option value="testando">Testando criativos</option>
          <option value="esgotando">Esgotando</option>
          <option value="morrendo">Morrendo</option>
          <option value="morta">Morta</option>
        </select>
        <span className="text-[12px] text-muted2">{filtered.length} ofertas</span>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <button className="btn btn-ghost btn-sm" onClick={() => runScrapeNow(scraper.localUrl)} disabled={scraping} title="Rodar scraper na rede local">
            ▶ Local
          </button>
          {scraper.railwayUrl && (
            <button className="btn btn-ghost btn-sm" onClick={() => runScrapeNow(scraper.railwayUrl)} disabled={scraping} title="Rodar scraper no Railway">
              ▶ Railway
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowScraperCfg(true)} title="Configurar scraper">
            ⚙
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </div>
      </div>

      {err && <div className="rounded-lg border border-danger/30 bg-danger/[0.07] px-4 py-2 text-[12px]">❌ {err}</div>}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-brand" />
        </div>
      )}
      {!loading && !err && filtered.length === 0 && (
        <div className="rounded-xl2 border border-dashed border-border py-10 text-center">
          {!loggedIn ? (
            <>
              <p className="text-[13px] font-semibold text-ink">Nenhuma oferta retornou.</p>
              <p className="mx-auto mt-1 max-w-[420px] text-[12px] text-muted">
                Suas tabelas têm RLS por usuário (padrão do TrackerAds). Entre com sua conta para ver seus dados.
              </p>
              <button className="btn btn-primary btn-sm mx-auto mt-4" onClick={onLoginClick}>
                <LogIn className="h-3.5 w-3.5" /> Entrar na minha conta
              </button>
            </>
          ) : (
            <p className="text-[13px] text-muted2">Nenhuma oferta. Adicione um link da Ads Library para monitorar.</p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((o) => (
          <OfferCard key={o.id} offer={o} history={counts[o.id] || []} onClick={() => setDetail(o)} />
        ))}
      </div>

      {detail && (
        <OfferDetail
          offer={detail}
          history={counts[detail.id] || []}
          onClose={() => setDetail(null)}
          onChanged={load}
          onDelete={async () => {
            try {
              await deleteOffer(detail.id)
              toast('Oferta removida', 'ok')
              load()
            } catch (e: any) {
              toast(e.message, 'err')
            }
          }}
        />
      )}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAdding(false)}>
          <div className="card w-full max-w-[480px]" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <h3 className="text-[13px] font-bold">Adicionar oferta</h3>
              <button onClick={() => setAdding(false)} className="text-muted2 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="card-body flex flex-col gap-3">
              <div className="field">
                <label>Nome</label>
                <input value={newOffer.name} onChange={(e) => setNewOffer({ ...newOffer, name: e.target.value })} placeholder="ex: Concorrente XYZ" />
              </div>
              <div className="field">
                <label>Link da Ads Library</label>
                <input value={newOffer.link} onChange={(e) => setNewOffer({ ...newOffer, link: e.target.value })} placeholder="https://facebook.com/ads/library/?view_all_page_id=..." />
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    if (!newOffer.name.trim() || !newOffer.link.trim()) return toast('Preencha nome e link', 'err')
                    try {
                      await addOffer({ name: newOffer.name.trim(), link: newOffer.link.trim() })
                      toast('Oferta adicionada', 'ok')
                      setAdding(false)
                      setNewOffer({ name: '', link: '' })
                      load()
                    } catch (e: any) {
                      toast(e.message, 'err')
                    }
                  }}
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showScraperCfg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowScraperCfg(false)}>
          <div className="card w-full max-w-[480px]" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <h3 className="text-[13px] font-bold">Configurar scraper</h3>
              <button onClick={() => setShowScraperCfg(false)} className="text-muted2 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="card-body flex flex-col gap-3">
              <p className="text-[12px] text-muted">
                O scraper (Playwright) conta os anúncios e grava na Supabase. Rode <b>local</b> (o <code>.bat</code> do
                TrackerAds na porta 3001) ou no <b>Railway</b>.
              </p>
              <div className="field">
                <label>URL local (rede)</label>
                <input value={scraper.localUrl} onChange={(e) => saveScraper({ ...scraper, localUrl: e.target.value })} placeholder="http://localhost:3001" />
              </div>
              <div className="field">
                <label>URL Railway (opcional)</label>
                <input value={scraper.railwayUrl} onChange={(e) => saveScraper({ ...scraper, railwayUrl: e.target.value })} placeholder="https://...up.railway.app" />
              </div>
              <div className="field">
                <label>Rota de disparo</label>
                <input value={scraper.path} onChange={(e) => saveScraper({ ...scraper, path: e.target.value })} placeholder="/api/scrape" />
                <div className="text-[11px] text-muted2">Ajuste se o seu scraper usar outra rota (ex: /scrape, /run).</div>
              </div>
              <div className="flex justify-end">
                <button className="btn btn-primary btn-sm" onClick={() => setShowScraperCfg(false)}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── aba discovery ── */
function DiscoveryView() {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [discovered, setDiscovered] = useState<DiscoveredOffer[]>([])
  const [newKw, setNewKw] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setKeywords(await getDiscoveryKeywords())
      setDiscovered(await getDiscoveredOffers())
    } catch {}
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="mb-2 text-[13px] font-bold">Keywords de descoberta</h3>
        <div className="mb-3 flex gap-2">
          <input value={newKw} onChange={(e) => setNewKw(e.target.value)} placeholder="ex: impressão 3D, moldes festa" className="flex-1 rounded-[9px] border border-border bg-[#0a0c19] px-3 py-2 text-[13px] text-ink" />
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              if (!newKw.trim()) return
              try {
                await addKeyword(newKw.trim())
                setNewKw('')
                load()
              } catch (e: any) {
                toast(e.message, 'err')
              }
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((k) => (
            <span key={k.id} className="flex items-center gap-1.5 rounded-full border border-border bg-surface2 px-3 py-1 text-[12px]">
              {k.keyword}
              <button onClick={async () => { await deleteKeyword(k.id); load() }} className="text-muted2 hover:text-danger">
                ✕
              </button>
            </span>
          ))}
          {!keywords.length && !loading && <span className="text-[12px] text-muted2">Nenhuma keyword. O scraper busca anunciantes novos por essas palavras.</span>}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[13px] font-bold">Ofertas descobertas ({discovered.length})</h3>
        {discovered.length === 0 ? (
          <div className="rounded-xl2 border border-dashed border-border py-8 text-center text-[12px] text-muted2">Nenhuma oferta pendente. O scraper preenche aqui quando acha anunciantes novos.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {discovered.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl2 border border-border bg-surface px-4 py-3">
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{d.name || d.page_name}</div>
                  <div className="text-[11px] text-muted2">
                    {d.ad_count != null && `${d.ad_count} anúncios`} {d.days_running != null && `· ${d.days_running}d`} {d.keyword && `· "${d.keyword}"`}
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={async () => { await approveDiscovered(d); load() }}>
                  ＋ Monitorar
                </button>
                <button className="btn btn-ghost btn-sm" onClick={async () => { await dismissDiscovered(d.id); load() }}>
                  Ignorar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function TrackerPage() {
  const loc = useLocation()
  const tab = loc.pathname.includes('discovery') ? 'discovery' : 'ofertas'
  const { email } = useSession()
  const [showLogin, setShowLogin] = useState(false)

  if (!isConfigured()) return <ConnectScreen />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-extrabold tracking-tight">Tracker Ads</h2>
        <div className="flex items-center gap-2">
          {email ? (
            <>
              <span className="text-[12px] text-muted2">{email}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => signOut()}>
                <LogOut className="h-3.5 w-3.5" /> Sair
              </button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowLogin(true)}>
              <LogIn className="h-3.5 w-3.5" /> Entrar
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (confirm('Desconectar a Supabase deste navegador?')) {
                clearCreds()
                window.location.reload()
              }
            }}
          >
            <Database className="h-3.5 w-3.5" /> Trocar Supabase
          </button>
        </div>
      </div>
      {tab === 'discovery' ? (
        <DiscoveryView key={email || 'anon'} />
      ) : (
        <OffersView key={email || 'anon'} loggedIn={!!email} onLoginClick={() => setShowLogin(true)} />
      )}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}
