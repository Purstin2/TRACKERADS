import { useMemo, useState } from 'react'
import { Search, Film, Check, X, Upload, ExternalLink } from 'lucide-react'
import { useUploader } from '../UploaderContext'
import { Card, Input } from '../components/fields'
import { fetchVideos, uploadVideo } from '../lib/fb'
import { toast } from '@/components/ui/toast'
import type { VideoItem } from '../types'

interface UpItem { name: string; pct: number; status: 'up' | 'ok' | 'err'; msg?: string }

function fmtData(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
}
function dataKey(iso?: string): string {
  return iso
    ? new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : ''
}

function VCard({
  v,
  selected,
  onClick,
  showDate = true,
}: {
  v: VideoItem
  selected: boolean
  onClick: () => void
  showDate?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden rounded-[11px] border text-left transition-all ${
        selected
          ? 'border-brand bg-surface shadow-[0_0_0_3px_rgba(99,102,241,.2)]'
          : 'border-border bg-surface2 hover:-translate-y-0.5 hover:border-brand'
      }`}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
          ✓
        </span>
      )}
      {v.thumbUrl ? (
        <img src={v.thumbUrl} alt="" loading="lazy" className="h-20 w-full object-cover" />
      ) : (
        <div className="flex h-20 w-full items-center justify-center bg-[#0a0c19] text-[10px] text-muted">
          sem thumb
        </div>
      )}
      <div className="p-2">
        <div className="break-words text-[10px] font-semibold leading-tight text-ink">
          {v.nomeClean}
          {v.isDup && (
            <span className="ml-1 rounded bg-warn px-1 py-px text-[8px] font-bold text-white">
              dup
            </span>
          )}
        </div>
        {showDate && <div className="mt-0.5 text-[9px] font-semibold text-brand-2">{fmtData(v.created_time)}</div>}
        <div className="mt-px font-mono text-[9px] text-muted2">ID: {v.id}</div>
      </div>
    </button>
  )
}

export default function StepCriativos({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}) {
  const ctx = useUploader()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [filtroData, setFiltroData] = useState('')
  const [filtroNome, setFiltroNome] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [uploads, setUploads] = useState<UpItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const accNum = ctx.form.ad_account.trim().replace(/^act_/, '')
  const adsManagerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accNum}`

  async function onFiles(files: FileList | null) {
    const arr = files ? Array.from(files).filter((f) => f.type.startsWith('video/')) : []
    if (!arr.length) return
    const token = ctx.form.token.trim()
    const acc = ctx.form.ad_account.trim()
    if (!token || !acc) {
      toast('Preencha o token e o Ad Account na aba Conta primeiro.', 'warn')
      return
    }
    setUploading(true)
    setUploads(arr.map((f) => ({ name: f.name, pct: 0, status: 'up' as const })))
    const novos: VideoItem[] = []
    for (let i = 0; i < arr.length; i++) {
      try {
        const { id, title } = await uploadVideo(token, acc, arr[i], (pct) =>
          setUploads((u) => u.map((x, idx) => (idx === i ? { ...x, pct } : x))),
        )
        setUploads((u) => u.map((x, idx) => (idx === i ? { ...x, pct: 100, status: 'ok' } : x)))
        novos.push({ id, title, nomeClean: title, isDup: false, thumbUrl: '', created_time: new Date().toISOString() })
      } catch (e: any) {
        setUploads((u) => u.map((x, idx) => (idx === i ? { ...x, status: 'err', msg: e.message } : x)))
      }
    }
    if (novos.length) {
      ctx.setVideos([...novos, ...ctx.videos])
      novos.forEach((n) => ctx.toggleVideo(n.id)) // já deixa selecionado pra subir
      toast(`${novos.length} vídeo(s) enviado(s) para a conta. O FB leva ~1 min processando.`, 'ok')
    }
    setUploading(false)
  }

  async function buscar() {
    if (!ctx.form.token.trim()) {
      toast('Preencha o token na aba Conta primeiro.', 'warn')
      return
    }
    setLoading(true)
    setStatus('Buscando...')
    try {
      const { rawCount, unicos } = await fetchVideos(
        ctx.form.token.trim(),
        ctx.form.ad_account.trim(),
      )
      ctx.setVideos(unicos)
      ctx.selectAllVideos(unicos.map((v) => v.id))
      setStatus(`${rawCount} vídeos — ${unicos.length} únicos`)
    } catch (e: any) {
      setStatus('Erro: ' + e.message)
    }
    setLoading(false)
  }

  const datas = useMemo(
    () => [...new Set(ctx.videos.map((v) => dataKey(v.created_time)).filter(Boolean))],
    [ctx.videos],
  )

  const lista = useMemo(
    () =>
      ctx.videos.filter((v) => {
        if (filtroData && dataKey(v.created_time) !== filtroData) return false
        if (filtroNome && !v.nomeClean.toLowerCase().includes(filtroNome.toLowerCase()))
          return false
        return true
      }),
    [ctx.videos, filtroData, filtroNome],
  )

  const searchLista = useMemo(
    () =>
      ctx.videos.filter(
        (v) => !searchFilter || v.nomeClean.toLowerCase().includes(searchFilter.toLowerCase()),
      ),
    [ctx.videos, searchFilter],
  )

  return (
    <div>
      <div className="mb-1 text-[21px] font-extrabold tracking-tight">Selecionar Criativos</div>
      <div className="mb-6 text-[13px] text-muted2">
        Busca os vídeos da biblioteca do seu Ad Account
      </div>

      <div className="card mb-4">
        <div className="card-body flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button className="btn btn-primary" onClick={buscar} disabled={loading}>
              <Search className="h-3.5 w-3.5" /> {loading ? 'Buscando...' : 'Buscar Vídeos'}
            </button>
            <label className={`btn btn-ghost cursor-pointer ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
              <Upload className="h-3.5 w-3.5" /> {uploading ? 'Enviando...' : 'Enviar vídeos'}
              <input type="file" accept="video/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = '' }} />
            </label>
            <a className="btn btn-ghost btn-sm" href={adsManagerUrl} target="_blank" rel="noreferrer" title="Abrir o Gerenciador já nesta conta">
              <ExternalLink className="h-3 w-3" /> Abrir conta no FB
            </a>
            <span className="text-[13px] text-muted">{status}</span>
          </div>

          {/* zona de arrastar */}
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files) }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl2 border-2 border-dashed px-4 py-5 text-center transition-colors ${dragOver ? 'border-brand bg-brand/[0.06]' : 'border-border hover:border-brand/50'}`}
          >
            <Upload className="h-5 w-5 text-muted2" />
            <span className="text-[12px] text-muted">Arraste vídeos aqui ou clique pra enviar pra <b>{ctx.form.ad_account || 'conta'}</b></span>
            <span className="text-[10.5px] text-muted2">Sobem pro Facebook e já entram selecionados na lista abaixo</span>
            <input type="file" accept="video/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.currentTarget.value = '' }} />
          </label>

          {uploads.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {uploads.map((u, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]" title={u.msg}>
                  <span className="w-44 truncate text-muted">{u.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded bg-surface2">
                    <div className={`h-full transition-all ${u.status === 'err' ? 'bg-danger' : u.status === 'ok' ? 'bg-ok' : 'bg-brand'}`} style={{ width: `${u.status === 'err' ? 100 : u.pct}%` }} />
                  </div>
                  <span className={`w-14 text-right font-semibold ${u.status === 'err' ? 'text-danger' : u.status === 'ok' ? 'text-ok' : 'text-muted2'}`}>
                    {u.status === 'err' ? 'erro' : u.status === 'ok' ? '✓ ok' : `${u.pct}%`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {ctx.videos.length > 0 && (
        <>
          <Card title="Vídeos Encontrados" icon={<Film className="h-3.5 w-3.5" />}>
            <div className="mb-3.5 flex flex-wrap items-center gap-2">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => ctx.selectAllVideos(lista.map((v) => v.id))}
              >
                <Check className="h-3 w-3" /> Todos
              </button>
              <button className="btn btn-ghost btn-sm" onClick={ctx.clearVideoSel}>
                <X className="h-3 w-3" /> Limpar
              </button>
              <div className="flex items-center gap-1.5">
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted2">
                  Data:
                </label>
                <select
                  value={filtroData}
                  onChange={(e) => setFiltroData(e.target.value)}
                  className="rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
                >
                  <option value="">Todas</option>
                  {datas.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted2">
                  Buscar:
                </label>
                <input
                  value={filtroNome}
                  onChange={(e) => setFiltroNome(e.target.value)}
                  placeholder="nome do vídeo..."
                  className="w-[180px] rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
                />
              </div>
              <span className="ml-auto rounded-full bg-brand/10 px-3 py-1 text-[12px] font-bold text-brand-2">
                {ctx.videosSel.size} selecionado{ctx.videosSel.size !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
              {lista.map((v) => (
                <VCard
                  key={v.id}
                  v={v}
                  selected={ctx.videosSel.has(v.id)}
                  onClick={() => ctx.toggleVideo(v.id)}
                />
              ))}
            </div>
          </Card>

          {/* search placement */}
          <div className="card mb-4">
            <div
              className="card-header cursor-pointer select-none"
              onClick={() => ctx.setSearchPlacementActive(!ctx.searchPlacementActive)}
            >
              <h3 className="flex items-center gap-2.5 text-[13px] font-bold">
                <span className="flex h-[27px] w-[27px] items-center justify-center rounded-lg bg-brand/12 text-brand-2">
                  <Search className="h-3.5 w-3.5" />
                </span>
                Personalizar Posicionamento de Pesquisa
              </h3>
              <span
                className={`text-[12px] font-semibold ${
                  ctx.searchPlacementActive ? 'text-ok' : 'text-muted2'
                }`}
              >
                {ctx.searchPlacementActive ? 'Ativado' : 'Desativado'}
              </span>
            </div>
            {ctx.searchPlacementActive && (
              <div className="card-body">
                <div className="mb-3.5 rounded-[9px] border border-brand/16 border-l-[3px] border-l-brand bg-brand/[0.07] px-3.5 py-2.5 text-[12px] text-ink">
                  O posicionamento{' '}
                  <strong>"Coluna da direita / Resultados da pesquisa"</strong> usará vídeo,
                  título e URL diferentes — dificultando cópias.
                </div>
                <div className="mb-3.5 grid gap-4 sm:grid-cols-2">
                  <Input
                    field="search_titulo"
                    label="Título para pesquisa"
                    placeholder="Se vazio, usa o título principal"
                  />
                  <Input
                    field="search_url"
                    label="URL de destino para pesquisa"
                    placeholder="Se vazio, usa a URL principal"
                  />
                </div>
                <div className="mb-2.5 flex items-center gap-2">
                  <input
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filtrar vídeos..."
                    className="flex-1 rounded-[7px] border border-border bg-[#0a0c19] px-2.5 py-1.5 text-[12px] text-ink"
                  />
                  {ctx.searchVideoSel && (
                    <span className="whitespace-nowrap text-[12px] font-semibold text-ok">
                      ✓ {ctx.searchVideoSel.nome}
                    </span>
                  )}
                </div>
                <div className="grid max-h-[300px] grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 overflow-y-auto">
                  {searchLista.map((v) => (
                    <VCard
                      key={v.id}
                      v={v}
                      showDate={false}
                      selected={ctx.searchVideoSel?.id === v.id}
                      onClick={() =>
                        ctx.setSearchVideoSel(
                          ctx.searchVideoSel?.id === v.id
                            ? null
                            : { id: v.id, nome: v.nomeClean, thumbUrl: v.thumbUrl },
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-5 flex gap-2.5">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Voltar
        </button>
        <button className="btn btn-primary" onClick={onNext}>
          Próximo: Revisar →
        </button>
      </div>
    </div>
  )
}
