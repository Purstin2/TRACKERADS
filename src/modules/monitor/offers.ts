/** Ofertas ("Produto" no filtro) são grupos de campanhas que o usuário monta na aba
 *  Por Oferta. Ficam no localStorage; aqui só lemos pra filtrar a tabela por produto. */
export interface OfferDef {
  id: string
  name: string
  members: string[] // `${accId}::${campId}`
}

const DEFS_KEY = 'meta_oferta_defs'

export function loadOfferDefs(): OfferDef[] {
  try {
    const arr = JSON.parse(localStorage.getItem(DEFS_KEY) || '[]')
    return Array.isArray(arr) ? (arr as OfferDef[]).filter((o) => o && o.id && o.name) : []
  } catch {
    return []
  }
}

/** Chaves `accId::campId` da oferta escolhida — vazio = sem filtro de produto. */
export function offerMemberSet(offerId: string): Set<string> | null {
  if (!offerId) return null
  const def = loadOfferDefs().find((o) => o.id === offerId)
  return def ? new Set(def.members || []) : null
}
