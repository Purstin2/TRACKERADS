import { useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { usePersistentState } from '@/lib/appState'

interface PriceTest {
  price: number
  conv: number   // 0 = preço aplicado, resultado ainda não medido
  views: number
  tipo: string
  note: string
  date: string
}
interface Tracker {
  products: Record<string, PriceTest[]>
  imported?: string[] // lotes de baseline já importados (não reimportar)
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

/* ── Baseline medido no export Kirvano de 29/07/2026 ──────────────────────────
 * Fonte: report_sales 01/04→29/07 (6.405 aprovadas) cruzado com LPV do Meta.
 *
 * DENOMINADORES (não misture com linhas antigas sem olhar):
 *  · Principal → conv = vendas ÷ VISITAS na página (LPV do Meta). É conversão de verdade.
 *    Não dá pra usar checkout iniciado: o `omni_initiated_checkout` do Meta está quebrado
 *    no período (reporta mais compras do que checkouts em abr/mai).
 *  · Order bumps → conv = take rate ENTRE COMPRADORES (% dos pedidos da oferta principal
 *    que levaram o bump). Contagem exata.
 *
 * ⚠ Os PREÇOS dos bumps são ESTIMADOS: o CSV da Kirvano só traz o Total somado do pedido,
 * então preço-base e preço-de-bump foram resolvidos juntos por mínimos quadrados
 * (erro médio R$1,08; 74% dos pedidos dentro de R$1). Os take rates são exatos, os preços
 * unitários não. Corrija pela UI se souber o valor real.
 */
const BASELINE_ID = '2026-07-29-ultrapack'
const PEND = 'PREÇO APLICADO 29/07 — aguardando resultado'
const MEDIDO = 'medido CSV 29/07'

const BASELINE: Record<string, PriceTest[]> = {
  'ULTRA PACK STL (principal)': [
    { price: 49.9, conv: 3.5, views: 30325, tipo: 'Principal', date: '2026-04-20', note: `${MEDIDO} · regime A · ROAS 1,60x` },
    { price: 64.9, conv: 2.95, views: 26037, tipo: 'Principal', date: '2026-05-18', note: `${MEDIDO} · regime B · melhor ROAS 1,76x` },
    { price: 59.9, conv: 3.4, views: 36590, tipo: 'Principal', date: '2026-06-15', note: `${MEDIDO} · regime C · ROAS 1,23 = breakeven; custo/visita +51%` },
    { price: 64.9, conv: 0, views: 0, tipo: 'Principal', date: '2026-07-29', note: `${PEND} · volta ao preço do regime B` },
  ],
  'Mascotes (OB)': [
    { price: 23.9, conv: 54.2, views: 853, tipo: 'OB', date: '2026-04-30', note: `${MEDIDO} · preço ≈estimado` },
    { price: 24.9, conv: 38.1, views: 1432, tipo: 'OB', date: '2026-05-31', note: `${MEDIDO} · preço ≈estimado` },
    { price: 24.9, conv: 33.5, views: 825, tipo: 'OB', date: '2026-06-30', note: `${MEDIDO} · preço ≈estimado` },
    { price: 25.9, conv: 16.2, views: 874, tipo: 'OB', date: '2026-07-29', note: `${MEDIDO} · QUEDA ESTRUTURAL (54%→16% desde abr), não é preço — não aumentar` },
  ],
  'Chaveiros (OB)': [
    { price: 25.9, conv: 31.1, views: 1239, tipo: 'OB', date: '2026-05-31', note: `${MEDIDO} · preço ≈estimado` },
    { price: 24.9, conv: 31.6, views: 825, tipo: 'OB', date: '2026-06-30', note: `${MEDIDO} · preço ≈estimado` },
    { price: 25.9, conv: 18.9, views: 874, tipo: 'OB', date: '2026-07-29', note: `${MEDIDO} · o mais resiliente do grupo · testar 29,90` },
  ],
  'Virais da Internet (OB)': [
    { price: 24.9, conv: 25.1, views: 1306, tipo: 'OB', date: '2026-05-31', note: `${MEDIDO} · preço ≈estimado` },
    { price: 25.9, conv: 28.6, views: 825, tipo: 'OB', date: '2026-06-30', note: `${MEDIDO} · preço ≈estimado` },
    { price: 34.9, conv: 13.7, views: 874, tipo: 'OB', date: '2026-07-29', note: `${MEDIDO} · +35% e manteve posição relativa — tem espaço p/ 39,90` },
  ],
  'Guia Impressão 3D PDF (OB)': [
    { price: 22.9, conv: 27.9, views: 852, tipo: 'OB', date: '2026-04-30', note: `${MEDIDO} · ⚠ preço ≈estimado, diverge do log manual (17,90) — conferir` },
    { price: 23.9, conv: 20.9, views: 1432, tipo: 'OB', date: '2026-05-31', note: `${MEDIDO} · preço ≈estimado` },
    { price: 23.9, conv: 23.0, views: 825, tipo: 'OB', date: '2026-06-30', note: `${MEDIDO} · preço congelado desde mai` },
    { price: 23.9, conv: 12.8, views: 874, tipo: 'OB', date: '2026-07-29', note: `${MEDIDO} · caiu 44% SEM mexer no preço = prova da canibalização do Mega Combo` },
  ],
  'Mega Combo (OB) — DESATIVADO': [
    { price: 65.9, conv: 15.1, views: 874, tipo: 'OB', date: '2026-07-29', note: `${MEDIDO} · trouxe R$9,95/chk e destruiu R$15,13 dos individuais = LÍQUIDO −R$5,18. Desativado em 29/07` },
  ],
}

const revPerVisit = (price: number, conv: number) => price * (conv / 100)
const fmtDate = (iso: string) => {
  if (!iso) return '—'
  const p = iso.split('-')
  return p.length === 3 ? p[2] + '/' + p[1] : iso
}

export default function PrecosView() {
  // tracker de preços persistido no Supabase
  const [tracker, save, loaded] = usePersistentState<Tracker>('meta_price_tracker', JSON.parse(JSON.stringify(SEED)))
  const [form, setForm] = useState({ prod: '', price: '', conv: '', views: '', date: '', tipo: 'OB', note: '' })

  /* Importa o baseline medido uma única vez. Mexer só no SEED não bastaria: o
   * usePersistentState prioriza o Supabase, então quem já tem tracker salvo nunca
   * veria o lote novo. O ref evita reentrada enquanto o save faz o round-trip. */
  const merging = useRef(false)
  useEffect(() => {
    if (!loaded) return // sem isto, mesclaria no cache e gravaria por cima do remoto
    if (merging.current) return
    if (tracker.imported?.includes(BASELINE_ID)) return
    merging.current = true
    const t: Tracker = {
      products: { ...tracker.products },
      imported: [...(tracker.imported || []), BASELINE_ID],
    }
    let novos = 0
    for (const [prod, tests] of Object.entries(BASELINE)) {
      const cur = t.products[prod] ? [...t.products[prod]] : []
      for (const nt of tests) {
        // dedupe por data+preço: reimportar não duplica linha
        if (cur.some((x) => x.date === nt.date && Math.abs(x.price - nt.price) < 0.01)) continue
        cur.push({ ...nt })
        novos++
      }
      cur.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
      t.products[prod] = cur
    }
    save(t)
    if (novos) toast(`✓ ${novos} registros de preço importados (baseline 29/07)`, 'ok')
  }, [tracker, save, loaded])

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
  // conv 0 = preço aplicado mas ainda não medido: fica fora de vencedor/veredicto,
  // senão uma linha pendente vira "RUIM −100%" e rouba o pódio de quem tem dado real.
  const measured = withRev.filter((t) => t.conv > 0)
  const pendentes = withRev.length - measured.length
  const maxRev = measured.length ? Math.max(...measured.map((t) => t.rev)) : 0
  const winner = measured.length ? measured.reduce((a, b) => (a.rev >= b.rev ? a : b)) : null
  const sorted = [...measured].sort((a, b) => b.rev - a.rev)
  const margin = winner && sorted[1] ? (winner.rev - sorted[1].rev).toFixed(2) : null
  const next = winner ? winner.price + 5 : 0

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
              const pendente = t.conv <= 0
              // compara com o último ponto MEDIDO anterior (pula pendentes)
              const prev = pendente ? null : withRev.slice(0, i).filter((x) => x.conv > 0).pop() || null
              let verdict = <span className="text-muted2">—</span>
              if (pendente) verdict = <span className="font-semibold text-brand-2">⏳ aguardando</span>
              else if (prev) {
                const diff = t.rev - prev.rev
                const up = t.price > prev.price
                const pct = prev.rev > 0 ? Math.abs((diff / prev.rev) * 100).toFixed(0) : '?'
                if (Math.abs(diff) < 0.001) verdict = <span className="text-muted2">= igual</span>
                else if (diff > 0)
                  verdict = <span className="font-semibold text-ok">{up ? '↑ Subir' : '↓ Baixar'} foi BOM +{pct}%</span>
                else verdict = <span className="font-semibold text-danger">{up ? '↑ Subir' : '↓ Baixar'} foi RUIM −{pct}%</span>
              }
              const isWin = !pendente && measured.length > 0 && Math.abs(t.rev - maxRev) < 0.001
              return (
                <tr
                  key={i}
                  className={`border-b border-border/50 ${isWin ? 'bg-ok/[0.05]' : ''} ${pendente ? 'bg-brand/[0.04]' : ''}`}
                >
                  <td className="py-1.5 pl-4">
                    {isWin ? '🏆 ' : ''}
                    <b>R${t.price.toFixed(2)}</b>
                  </td>
                  <td className="py-1.5 text-[11px] text-muted2">{fmtDate(t.date)}</td>
                  <td className="py-1.5">{pendente ? <span className="text-muted2">—</span> : `${t.conv.toFixed(1)}%`}</td>
                  <td className="py-1.5 font-mono font-semibold text-brand-2">
                    {pendente ? <span className="font-sans font-normal text-muted2">—</span> : `R$${t.rev.toFixed(2)}`}
                  </td>
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
        {winner ? (
          <>
            🏆 Melhor: <b className="text-ink">R${winner.price.toFixed(2)}</b> com <b className="text-ink">{winner.conv.toFixed(1)}%</b> →{' '}
            <b className="text-brand-2">R${winner.rev.toFixed(2)}/visitante</b>
            {margin ? ` (+R$${margin} vs 2º)` : ''}.{measured.length < 3 ? ' Poucos dados — continue testando.' : ''} Próximo: teste{' '}
            <b className="text-ink">R${next.toFixed(2)}</b> e compare.
          </>
        ) : (
          <>⏳ Preço aplicado, sem medição ainda. Registre a conversão quando tiver o próximo export.</>
        )}
        {pendentes > 0 && winner ? (
          <span className="ml-1 text-brand-2">
            · {pendentes} preço{pendentes > 1 ? 's' : ''} aplicado{pendentes > 1 ? 's' : ''} aguardando medição.
          </span>
        ) : null}
      </div>
    </div>
  )
}
