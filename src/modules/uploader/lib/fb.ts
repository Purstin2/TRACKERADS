import { META_API } from '../types'

interface FbError {
  message: string
  code?: number
  error_subcode?: number
  error_user_msg?: string
}

export function fmtErr(e: FbError): string {
  let m = `${e.message} (code ${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})`
  if (e.error_user_msg) m += ` — ${e.error_user_msg}`
  return m
}

export async function fbGet(url: string): Promise<any> {
  const r = await fetch(url)
  const j = await r.json()
  if (j.error) throw new Error(fmtErr(j.error))
  return j
}

export async function fbPost(
  token: string,
  ep: string,
  body: Record<string, unknown>,
): Promise<any> {
  const p = new URLSearchParams()
  p.append('access_token', token)
  for (const [k, v] of Object.entries(body)) {
    if (v === null || v === undefined) continue
    p.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  const r = await fetch(`https://graph.facebook.com/${META_API}/${ep}`, {
    method: 'POST',
    body: p,
  })
  const j = await r.json()
  if (j.error) throw new Error(fmtErr(j.error))
  return j
}

export async function fbDel(token: string, id: string): Promise<void> {
  const p = new URLSearchParams({ access_token: token })
  await fetch(`https://graph.facebook.com/${META_API}/${id}`, {
    method: 'DELETE',
    body: p,
  })
}

export const fbBase = `https://graph.facebook.com/${META_API}`

/** Verifica token → retorna nome da conta ou lança erro */
export async function verifyToken(token: string): Promise<string> {
  const d = await fbGet(`${fbBase}/me?fields=name&access_token=${token}`)
  return d.name
}

/**
 * Inspeciona o próprio token via debug_token → quando expira.
 * expiresAt em segundos Unix; 0 = não expira (System User / token permanente).
 * Erro 190/463 ("Session has expired") = token vencido — gere um novo.
 */
export async function debugToken(token: string): Promise<{ valid: boolean; expiresAt: number }> {
  const d = await fbGet(`${fbBase}/debug_token?input_token=${token}&access_token=${token}`)
  const data = d.data || {}
  return { valid: !!data.is_valid, expiresAt: data.expires_at || 0 }
}

/** Verifica página acessível → { id, name } */
export async function verifyPage(token: string, pageId: string) {
  return fbGet(`${fbBase}/${pageId}?fields=id,name&access_token=${token}`)
}

/** Lista páginas do token */
export async function listPages(token: string) {
  const d = await fbGet(`${fbBase}/me/accounts?fields=id,name&limit=50&access_token=${token}`)
  return (d.data || []) as { id: string; name: string }[]
}

/** Instagram business account vinculado à página */
export async function lookupInstagram(token: string, pageId: string): Promise<string> {
  const d = await fbGet(
    `${fbBase}/${pageId}?fields=instagram_business_account&access_token=${token}`,
  )
  return d.instagram_business_account?.id || ''
}

/** Sobe um arquivo de vídeo direto pra biblioteca da conta de anúncio
 *  (POST /act_X/advideos, multipart). Usa XHR pra reportar progresso do upload.
 *  Retorna o video_id criado. O Facebook ainda leva ~1min processando depois. */
export function uploadVideo(
  token: string,
  adAccount: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ id: string; title: string }> {
  return new Promise((resolve, reject) => {
    const title = file.name.replace(/\.[^.]+$/, '').trim() || file.name
    const fd = new FormData()
    fd.append('access_token', token)
    fd.append('source', file)
    fd.append('title', title)
    fd.append('name', title)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${fbBase}/${adAccount}/advideos`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try {
        const j = JSON.parse(xhr.responseText)
        if (j.error) reject(new Error(fmtErr(j.error)))
        else if (!j.id) reject(new Error('Facebook não retornou o ID do vídeo'))
        else resolve({ id: j.id, title })
      } catch {
        reject(new Error('resposta inválida do Facebook (HTTP ' + xhr.status + ')'))
      }
    }
    xhr.onerror = () => reject(new Error('falha de rede no upload'))
    xhr.send(fd)
  })
}

/* ── Catálogo (para anúncios de catálogo/coleção — "esconder" na biblioteca) ── */

/** Negócios (Business Manager) do token — pra saber onde criar o catálogo. */
export async function listBusinesses(token: string) {
  const d = await fbGet(`${fbBase}/me/businesses?fields=id,name&limit=50&access_token=${token}`)
  return (d.data || []) as { id: string; name: string }[]
}
/** Catálogos de um negócio. */
export async function listCatalogs(token: string, businessId: string) {
  const d = await fbGet(`${fbBase}/${businessId}/owned_product_catalogs?fields=id,name,product_count&limit=100&access_token=${token}`)
  return (d.data || []) as { id: string; name: string; product_count?: number }[]
}
/** Cria um catálogo de produtos no negócio. */
export async function createCatalog(token: string, businessId: string, name: string): Promise<{ id: string }> {
  return fbPost(token, `${businessId}/owned_product_catalogs`, { name })
}
/** Conjuntos de produtos de um catálogo (o adset de catálogo aponta pra um deles). */
export async function listProductSets(token: string, catalogId: string) {
  const d = await fbGet(`${fbBase}/${catalogId}/product_sets?fields=id,name,product_count&limit=100&access_token=${token}`)
  return (d.data || []) as { id: string; name: string; product_count?: number }[]
}
/** Vincula o catálogo à conta de anúncio (necessário pra rodar anúncio de catálogo nela). */
export async function linkCatalogToAccount(token: string, catalogId: string, adAccount: string) {
  const accId = adAccount.replace(/^act_/, '')
  return fbPost(token, `${catalogId}/agencies`, { business: accId }).catch(() => null)
}

export interface NewProduct { retailer_id: string; name: string; url: string; image_url: string; price: number; currency: string; description?: string }
/** Cria um produto no catálogo. price em unidade da moeda (ex.: 97.00). */
export async function createProduct(token: string, catalogId: string, p: NewProduct): Promise<{ id: string }> {
  return fbPost(token, `${catalogId}/products`, {
    retailer_id: p.retailer_id,
    name: p.name,
    url: p.url,
    image_url: p.image_url,
    price: Math.round((p.price || 0) * 100), // centavos
    currency: p.currency || 'BRL',
    availability: 'in stock',
    condition: 'new',
    brand: p.name.slice(0, 70) || 'Loja',
    description: p.description || p.name,
  })
}

/** Busca a thumbnail de um vídeo específico — usado como fallback quando thumbUrl está vazio */
export async function getVideoThumbnail(token: string, videoId: string): Promise<string> {
  try {
    const d = await fbGet(`${fbBase}/${videoId}?fields=thumbnails&access_token=${token}`)
    return d.thumbnails?.data?.[0]?.uri || ''
  } catch {
    return ''
  }
}

/** Busca todos os advideos da conta (paginado) → { raw, unicos } */
export async function fetchVideos(token: string, adAccount: string) {
  let todos: any[] = []
  let url = `${fbBase}/${adAccount}/advideos?fields=id,title,thumbnails,created_time&limit=100&access_token=${token}`
  while (url) {
    const d = await fbGet(url)
    if (d.data) todos.push(...d.data)
    url = d.paging?.next || ''
  }
  todos.sort(
    (a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime(),
  )
  const seen = new Map<string, any>()
  const dups = new Set<string>()
  todos.forEach((v) => {
    const nome = (v.title || `video_${v.id}`).replace(/\.mp4$/i, '').trim()
    seen.has(nome) ? dups.add(nome) : seen.set(nome, v)
  })
  const unicos = Array.from(seen.values()).map((v) => {
    const nomeClean = (v.title || `video_${v.id}`).replace(/\.mp4$/i, '').trim()
    return {
      ...v,
      nomeClean,
      isDup: dups.has(nomeClean),
      thumbUrl: v.thumbnails?.data?.[0]?.uri || '',
    }
  })
  return { rawCount: todos.length, unicos }
}
