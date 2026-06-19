import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import { usePersistentState } from '@/lib/appState'

interface PriceTest {
  price: number
  conv: number
  views: number
  tipo: string
  note: string
  date: string
}
interface Tracker {
  products: Record<string, PriceTest[]>
}

const SEED: Tracker = {
  products: {
    'Mascotes (OB)': [
      { price: 13.9, conv: 15.8, views: 487, tipo: 'OB', note: 'abaixo do botão', date: '2026-04-03' },
      { price: 17.9, conv: 33.9, views: 708, tipo: 'OB', note: 'acima do botão', date: '2026-04-06' },
      { price: 24.9, conv: 46.9, views: 1403, tipo: 'OB', note: 'acima do botão', date: '2026-04-21' },
      { price: 29.9, conv: 44.6, views: 621, tipo: 'OB', note: 'acima do botão', date: '2026-05-15' },
    ],
    'Chaveiros (OB)': [
      { price: 24.9, conv: 35.2, views: 795, tipo: 'OB', note: '', date: '' },
      { price: 27.9, conv: 29.4, views: 289, tipo: 'OB', note: 'público sensível a preço', date: '' },
    ],
    'Virais da Internet (OB)': [
      { price: 19.9, conv: 19.4, views: 618, tipo: 'OB', note: 'checkout antigo — não comparável', date: '' },
      { price: 21.9, conv: 30.7, views: 639, tipo: 'OB', note: 'checkout novo (salto = checkout)', date: '' },
    ],
    'Guia Impressão 3D PDF (OB)': [
      { price: 9.9, conv: 7.7, views: 1539, tipo: 'OB', note: 'abaixo do botão', date: '2026-04-04' },
      { price: 12.9, conv: 11.0, views: 391, tipo: 'OB', note: 'acima do botão', date: '2026-04-06' },
      { price: 14.9, conv: 24.6, views: 317, tipo: 'OB', note: 'acima do botão', date: '2026-04-13' },
      { price: 17.9, conv: 21.4, views: 1139, tipo: 'OB', note: 'acima do botão', date: '2026-04-21' },
      { price: 19.9, conv: 24.3, views: 666, tipo: 'OB', note: 'acima do botão', date: '2026-05-15' },
    ],
    'Upsell 1 (principal)': [
      { price: 22.9, conv: 6.1, views: 618, tipo: 'Upsell', note: 'data anterior', date: '2026-05-13' },
      { price: 19.9, conv: 9.7, views: 547, tipo: 'Upsell', note: 'baixou de 22,90 → melhorou', date: '2026-05-15' },
    ],
    'Upsell Crochês': [{ price: 20.9, conv: 2.4, views: 1201, tipo: 'Upsell', note: '2º upsell — fadiga de funil', date: '' }],
  },
}

const revPerVisit = (price: number, conv: number) => price * (conv / 100)
const fmtDate = (iso: string) => {
  if (!iso) return '—'
  const p = iso.split('-')
  return p.length === 3 ? p[2] + '/' + p[1] : iso
}

export default function PrecosView() {
  // tracker de preços persistido no Supabase
  const [tracker, save] = usePersistentState<Tracker>('meta_price_tracker', JSON.parse(JSON.stringify(SEED)))
  const [form, setForm] = useState({ prod: '', price: '', conv: '', views: '', date: '', tipo: 'OB', note: '' })

  function addTest() {
    const prod = form.prod.trim()
    const price = parseFloat(form.price)
    const conv = parseFloat(form.conv)
    if (!prod) return toast('Digite o nome do produto', 'err')
    if (isNaN(price) || price <= 0) return toast('Preço inválido', 'err')
    if (isNaN(conv) || conv < 0 || conv > 100) return toast('Conversão inválida (0–100)', 'err')
    const t = tracker
    if (!t.products[prod]) t.products[prod] = []
    t.products[prod].push({
      price,
      conv,
      views: parseInt(form.views) || 0,
      tipo: form.tipo,
      note: form.note.trim(),
      date: form.date || new Date().toISOString().slice(0, 10),
    })
    t.products[prod].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    save(t)
    toast(`✓ R$${price.toFixed(2)} registrado para ${prod}`, 'ok')
    setForm({ ...form, price: '', conv: '', views: '', note: '', date: '' })
  }
  function deleteTest(prod: string, idx: number) {
    if (!confirm('Remover este teste?')) return
    tracker.products[prod].splice(idx, 1)
    if (!tracker.products[prod].length) delete tracker.products[prod]
    save(tracker)
  }
  function deleteProd(prod: string) {
    if (!confirm(`Remover todos os testes de "${prod}"?`)) return
    delete tracker.products[prod]
    save(tracker)
  }

  const prods = Object.keys(tracker.products)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-[15px] font-bold">🏷️ Testador de Preços</h3>
        <p className="text-[12px] text-muted">Registre cada preço testado e veja se subir/baixar foi bom (por R$/visitante).</p>
      </div>

      {/* form */}
      <div className="card card-body flex flex-wrap items-end gap-2">
        <div className="field flex-1" style={{ minWidth: 130 }}>
          <label>Produto</label>
          <input list="ptProds" value={form.prod} onChange={(e) => setForm({ ...form, prod: e.target.value })} placeholder="ex: Mascotes OB" />
          <datalist id="ptProds">
            {prods.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="field" style={{ width: 90 }}>
          <label>Preço R$</label>
          <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="29.90" />
        </div>
        <div className="field" style={{ width: 86 }}>
          <label>Conv %</label>
          <input type="number" step="0.1" value={form.conv} onChange={(e) => setForm({ ...form, conv: e.target.value })} placeholder="44.6" />
        </div>
        <div className="field" style={{ width: 78 }}>
          <label>Views</label>
          <input type="number" value={form.views} onChange={(e) => setForm({ ...form, views: e.target.value })} placeholder="621" />
        </div>
        <div className="field">
          <label>Data</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ colorScheme: 'dark' }} />
        </div>
        <div className="field">
          <label>Tipo</label>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option>OB</option>
            <option>Upsell</option>
            <option>Downsell</option>
            <option>Principal</option>
          </select>
        </div>
        <div className="field flex-1" style={{ minWidth: 110 }}>
          <label>Obs</label>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="ex: pós-checkout novo" />
        </div>
        <button className="btn btn-primary" onClick={addTest}>
          ＋ Registrar
        </button>
      </div>

      {prods.length === 0 ? (
        <div className="rounded-xl2 border border-dashed border-border py-8 text-center text-[12px] text-muted2">
          Nenhum teste registrado.
        </div>
      ) : (
        prods.map((prod) => <ProductTable key={prod} prod={prod} tests={tracker.products[prod]} onDelTest={deleteTest} onDelProd={deleteProd} />)
      )}
    </div>
  )
}

function ProductTable({
  prod,
  tests,
  onDelTest,
  onDelProd,
}: {
  prod: string
  tests: PriceTest[]
  onDelTest: (p: string, i: number) => void
  onDelProd: (p: string) => void
}) {
  const withRev = tests.map((t) => ({ ...t, rev: revPerVisit(t.price, t.conv) }))
  const maxRev = Math.max(...withRev.map((t) => t.rev))
  const winner = withRev.reduce((a, b) => (a.rev >= b.rev ? a : b))
  const sorted = [...withRev].sort((a, b) => b.rev - a.rev)
  const margin = sorted[1] ? (winner.rev - sorted[1].rev).toFixed(2) : null
  const next = winner.price + 5

  return (
    <div className="card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="text-[13px] font-bold">{prod}</span>
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand-2">
          {tests.length} teste{tests.length !== 1 ? 's' : ''}
        </span>
        <button onClick={() => onDelProd(prod)} className="ml-auto text-[12px] text-muted2 hover:text-danger">
          🗑
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted2">
              <th className="py-2 pl-4 text-left">Preço</th>
              <th className="py-2 text-left">Data</th>
              <th className="py-2 text-left">Conv%</th>
              <th className="py-2 text-left">R$/Visit.</th>
              <th className="py-2 text-left">Views</th>
              <th className="py-2 text-left">Tipo</th>
              <th className="py-2 text-left">Veredicto</th>
              <th className="py-2 text-left">Obs</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {withRev.map((t, i) => {
              const prev = i > 0 ? withRev[i - 1] : null
              let verdict = <span className="text-muted2">—</span>
              if (prev) {
                const diff = t.rev - prev.rev
                const up = t.price > prev.price
                const pct = prev.rev > 0 ? Math.abs((diff / prev.rev) * 100).toFixed(0) : '?'
                if (Math.abs(diff) < 0.001) verdict = <span className="text-muted2">= igual</span>
                else if (diff > 0)
                  verdict = <span className="font-semibold text-ok">{up ? '↑ Subir' : '↓ Baixar'} foi BOM +{pct}%</span>
                else verdict = <span className="font-semibold text-danger">{up ? '↑ Subir' : '↓ Baixar'} foi RUIM −{pct}%</span>
              }
              const isWin = Math.abs(t.rev - maxRev) < 0.001
              return (
                <tr key={i} className={`border-b border-border/50 ${isWin ? 'bg-ok/[0.05]' : ''}`}>
                  <td className="py-1.5 pl-4">
                    {isWin ? '🏆 ' : ''}
                    <b>R${t.price.toFixed(2)}</b>
                  </td>
                  <td className="py-1.5 text-[11px] text-muted2">{fmtDate(t.date)}</td>
                  <td className="py-1.5">{t.conv.toFixed(1)}%</td>
                  <td className="py-1.5 font-mono font-semibold text-brand-2">R${t.rev.toFixed(2)}</td>
                  <td className="py-1.5 text-muted">{t.views || '—'}</td>
                  <td className="py-1.5 text-[11px] text-muted2">{t.tipo || 'OB'}</td>
                  <td className="py-1.5">{verdict}</td>
                  <td className="max-w-[140px] py-1.5 text-[11px] text-muted2">{t.note}</td>
                  <td className="py-1.5 pr-3">
                    <button onClick={() => onDelTest(prod, i)} className="text-muted2 hover:text-danger">
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border px-4 py-2.5 text-[12px] text-muted">
        🏆 Melhor: <b className="text-ink">R${winner.price.toFixed(2)}</b> com <b className="text-ink">{winner.conv.toFixed(1)}%</b> →{' '}
        <b className="text-brand-2">R${winner.rev.toFixed(2)}/visitante</b>
        {margin ? ` (+R$${margin} vs 2º)` : ''}.{tests.length < 3 ? ' Poucos dados — continue testando.' : ''} Próximo: teste{' '}
        <b className="text-ink">R${next.toFixed(2)}</b> e compare.
      </div>
    </div>
  )
}
