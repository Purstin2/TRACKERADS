/* Identidade de uma oferta, pra detectar duplicata na hora de cadastrar.
 *
 * O NOME não serve: todo favorito da Biblioteca de Anúncios do Facebook chega
 * chamado "Biblioteca de Anúncios", então uma pasta com 30 favoritos vira 30
 * targets com nome idêntico. Quem identifica de verdade é o LINK — e mesmo ele
 * precisa ser normalizado, porque o mesmo anunciante salvo duas vezes vem com
 * ordem de parâmetro diferente, país diferente no meio, media_type a mais...
 *
 * A chave resolve isso reduzindo o link ao que realmente identifica o alvo.
 */

// parâmetros de rastreio: nunca fazem parte da identidade
const RUIDO = /^(utm_|fbclid$|gclid$|ttclid$|ttp$|_ga$|mc_cid$|mc_eid$)/i

const textoNorm = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

/**
 * Chave canônica do link. Dois links com a mesma chave são a MESMA oferta.
 * Devolve null quando não há link (aí não dá pra afirmar duplicata).
 */
export function chaveOferta(link) {
  const bruto = String(link || '').trim()
  if (!bruto) return null

  let u
  try {
    u = new URL(/^https?:\/\//i.test(bruto) ? bruto : 'https://' + bruto)
  } catch {
    return 'cru:' + textoNorm(bruto) // não é URL válida: compara o texto puro
  }

  const host = u.hostname.toLowerCase().replace(/^(www|m|web|business|pt-br|es-la|en-gb)\./, '')

  /* BIBLIOTECA DE ANÚNCIOS — o alvo é a PÁGINA anunciante (view_all_page_id) ou
   * o termo pesquisado (q). Todo o resto (active_status, ad_type, media_type,
   * search_type, sort_data, ordem dos parâmetros) é ruído que muda de um
   * favorito pro outro e faria a mesma oferta parecer nova. */
  if (/(^|\.)facebook\.com$/.test(host) && /\/ads\/library/.test(u.pathname)) {
    const p = u.searchParams
    const pais = (p.get('country') || '').toLowerCase()
    const sufixoPais = pais && pais !== 'all' ? '@' + pais : ''

    const pageId = p.get('view_all_page_id') || p.get('page_ids')
    if (pageId) return 'fbads:page:' + pageId.trim() + sufixoPais

    const adId = p.get('id')
    if (adId) return 'fbads:ad:' + adId.trim()

    const termo = textoNorm(p.get('q'))
    if (termo) return 'fbads:q:' + termo + sufixoPais

    return 'fbads:' + textoNorm(u.search) // sem alvo reconhecível: usa a query toda
  }

  // link comum: host + caminho + parâmetros relevantes, em ordem estável
  const caminho = u.pathname.replace(/\/+$/, '').toLowerCase()
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !RUIDO.test(k))
    .map(([k, v]) => k.toLowerCase() + '=' + textoNorm(v))
    .sort()
  return host + caminho + (params.length ? '?' + params.join('&') : '')
}

/**
 * Índice chave -> oferta já cadastrada. Inclui arquivadas de propósito: uma
 * oferta arquivada continua "já existindo lá dentro", e reimportar criaria uma
 * segunda linha da mesma coisa.
 */
export function indiceDeOfertas(offers) {
  const idx = new Map()
  for (const o of offers || []) {
    const k = chaveOferta(o && o.link)
    if (k && !idx.has(k)) idx.set(k, o)
  }
  return idx
}
