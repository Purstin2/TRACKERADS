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
