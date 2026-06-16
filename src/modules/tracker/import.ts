/** Utilitários de importação de ofertas (links da Ads Library) — colando texto
 *  ou subindo o HTML de favoritos exportado do Chrome/Edge. */

export interface ParsedOffer {
  name: string
  link: string
}

const ADS_LIBRARY_RE = /facebook\.com\/ads\/library/i

function isAdsLibrary(url: string) {
  return ADS_LIBRARY_RE.test(url)
}

/** Tira um nome decente de um link da Ads Library (page_id ou query 'q'). */
function nameFromLink(link: string): string {
  try {
    const u = new URL(link)
    const q = u.searchParams.get('q')
    if (q) return decodeURIComponent(q)
    const pid = u.searchParams.get('view_all_page_id') || u.searchParams.get('page_id')
    if (pid) return `Página ${pid}`
  } catch {}
  return 'Oferta importada'
}

/** Extrai links da Ads Library de um texto livre (um por linha, ou colados juntos).
 *  Aceita formato "Nome | link", "Nome <tab> link", ou só o link. */
export function parseLinksText(text: string): ParsedOffer[] {
  const out: ParsedOffer[] = []
  const lines = text.split(/\r?\n/)
  // também captura links soltos no meio de uma linha
  const urlRe = /(https?:\/\/[^\s|]+)/i
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    // "Nome | url" ou "Nome \t url"
    const sep = line.split(/\s*[|\t]\s*/)
    let name = ''
    let link = ''
    if (sep.length >= 2 && urlRe.test(sep[sep.length - 1])) {
      link = sep[sep.length - 1].match(urlRe)![1]
      name = sep.slice(0, -1).join(' ').trim()
    } else {
      const m = line.match(urlRe)
      if (m) link = m[1]
    }
    if (!link || !isAdsLibrary(link)) continue
    out.push({ name: name || nameFromLink(link), link })
  }
  return dedup(out)
}

/** Lê o HTML de favoritos exportado (formato Netscape, do Chrome/Edge/Firefox).
 *  Pega todos os <A HREF="...">Título</A> que apontem pra Ads Library. */
export function parseBookmarksHtml(html: string): ParsedOffer[] {
  const out: ParsedOffer[] = []
  // DOMParser está disponível no browser
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const anchors = Array.from(doc.querySelectorAll('a[href]'))
    for (const a of anchors) {
      const link = a.getAttribute('href') || ''
      if (!isAdsLibrary(link)) continue
      const name = (a.textContent || '').trim() || nameFromLink(link)
      out.push({ name, link })
    }
  } catch {
    // fallback por regex se DOMParser falhar
    const re = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      const link = m[1]
      if (!isAdsLibrary(link)) continue
      out.push({ name: (m[2] || '').trim() || nameFromLink(link), link })
    }
  }
  return dedup(out)
}

/** Remove duplicatas pelo page_id (ou link normalizado). */
function dedup(items: ParsedOffer[]): ParsedOffer[] {
  const seen = new Set<string>()
  const out: ParsedOffer[] = []
  for (const it of items) {
    const pid = it.link.match(/(?:view_all_page_id|page_id)=(\d+)/)?.[1]
    const key = pid ? 'pid:' + pid : it.link.replace(/[?#].*$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}
