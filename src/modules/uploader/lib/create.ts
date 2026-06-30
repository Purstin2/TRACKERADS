import type {
  BudgetType,
  ContaExtra,
  Estrutura,
  FormState,
  SearchVideoSel,
} from '../types'
import { fbPost, fbDel } from './fb'
import { buildNome, buildUTMString, getCampNome } from './naming'

export interface CreateItem {
  id: string
  nome: string
  thumbUrl: string
}

export interface CreateCtx {
  form: FormState
  paises: string[]
  paisBatches?: string[][] // multi-país: cada lote vira uma estrutura própria
  budgetType: BudgetType
  estrutura: Estrutura
  lista: CreateItem[]
  searchPlacementActive: boolean
  searchVideoSel: SearchVideoSel | null
  contas: ContaExtra[]
  startUTC: string | null
  endUTC: string | null
  onLog: (msg: string, tipo?: string) => void
  onResult: (nome: string, ok: boolean, det: string) => void
  onProgress: (cur: number, total: number) => void
  onContaHeader: (label: string) => void
  shouldCancel?: () => boolean
}

/** Valor efetivo: override da conta extra > valor do form */
function eff(conta: ContaExtra, form: FormState, key: keyof ContaExtra): string {
  const ov = (conta[key] || '').trim()
  if (ov) return ov
  return (form[key as keyof FormState] || '').trim()
}

const gv = (form: FormState, k: keyof FormState) => (form[k] || '').trim()

function buildCreativeBody(
  ctx: CreateCtx,
  conta: ContaExtra,
  v: CreateItem,
  urlBase: string,
  nomeCriativo: string,
): Record<string, unknown> {
  const { form } = ctx
  // catálogo tem prioridade (esconde na biblioteca); precisa do product_set
  if (gv(form, 'tipo_anuncio') === 'catalogo' && gv(form, 'product_set_id'))
    return buildCreativeBodyCatalogo(ctx, conta, v, urlBase, nomeCriativo)
  if (ctx.searchPlacementActive && ctx.searchVideoSel)
    return buildCreativeBodyPesquisa(ctx, conta, v, urlBase, nomeCriativo)

  const vd: Record<string, unknown> = {
    video_id: v.id,
    message: eff(conta, form, 'copy'),
    title: gv(form, 'titulo'),
    call_to_action: {
      type: gv(form, 'cta'),
      value: { link: urlBase, link_caption: gv(form, 'url_exibicao') },
    },
  }
  if (v.thumbUrl) vd.image_url = v.thumbUrl
  const spec: Record<string, unknown> = { page_id: eff(conta, form, 'page_id'), video_data: vd }
  const ig = eff(conta, form, 'instagram_id')
  if (ig) spec.instagram_user_id = ig
  const body: Record<string, unknown> = { name: nomeCriativo, object_story_spec: spec }
  const utms = buildUTMString(form)
  if (utms) body.url_tags = utms
  return body
}

function buildCreativeBodyPesquisa(
  ctx: CreateCtx,
  conta: ContaExtra,
  v: CreateItem,
  urlBase: string,
  nomeCriativo: string,
): Record<string, unknown> {
  const { form } = ctx
  const L_MAIN = { name: 'asset_main' }
  const L_SEARCH = { name: 'asset_search' }
  const L_AMBOS = [L_MAIN, L_SEARCH]
  const sv = ctx.searchVideoSel!
  const tituloMain = gv(form, 'titulo')
  const tituloSearch = gv(form, 'search_titulo') || tituloMain
  const urlSearch = gv(form, 'search_url') || urlBase
  const displayUrl = gv(form, 'url_exibicao')

  const videoMain: Record<string, unknown> = { video_id: v.id, adlabels: [L_MAIN] }
  if (v.thumbUrl) videoMain.thumbnail_url = v.thumbUrl
  const videoSearch: Record<string, unknown> = { video_id: sv.id, adlabels: [L_SEARCH] }
  if (sv.thumbUrl) videoSearch.thumbnail_url = sv.thumbUrl

  const linkMain: Record<string, unknown> = {
    website_url: urlBase,
    adlabels: urlSearch === urlBase ? L_AMBOS : [L_MAIN],
  }
  if (displayUrl) linkMain.display_url = displayUrl

  const afs: Record<string, any> = {
    videos: [videoMain, videoSearch],
    bodies: [{ text: eff(conta, form, 'copy'), adlabels: L_AMBOS }],
    titles:
      tituloSearch === tituloMain
        ? [{ text: tituloMain, adlabels: L_AMBOS }]
        : [
            { text: tituloMain, adlabels: [L_MAIN] },
            { text: tituloSearch, adlabels: [L_SEARCH] },
          ],
    link_urls:
      urlSearch === urlBase
        ? [linkMain]
        : [linkMain, { website_url: urlSearch, adlabels: [L_SEARCH] }],
    ad_formats: ['SINGLE_VIDEO'],
    optimization_type: 'PLACEMENT',
    asset_customization_rules: [
      {
        customization_spec: {
          publisher_platforms: ['facebook'],
          facebook_positions: ['search'],
        },
        video_label: L_SEARCH,
        body_label: L_SEARCH,
        title_label: L_SEARCH,
        link_url_label: L_SEARCH,
        priority: 1,
      },
      {
        customization_spec: { age_min: 18, age_max: 65 },
        is_default: true,
        video_label: L_MAIN,
        body_label: L_MAIN,
        title_label: L_MAIN,
        link_url_label: L_MAIN,
        priority: 2,
      },
    ],
  }
  if (gv(form, 'cta') && gv(form, 'cta') !== 'NO_BUTTON')
    afs.call_to_action_types = [gv(form, 'cta')]
  if (gv(form, 'descricao')) {
    afs.descriptions = [{ text: gv(form, 'descricao'), adlabels: L_AMBOS }]
    afs.asset_customization_rules[0].description_label = L_SEARCH
    afs.asset_customization_rules[1].description_label = L_MAIN
  }

  const spec: Record<string, unknown> = { page_id: eff(conta, form, 'page_id') }
  const ig = eff(conta, form, 'instagram_id')
  if (ig) spec.instagram_user_id = ig
  const body: Record<string, unknown> = {
    name: nomeCriativo,
    object_story_spec: spec,
    asset_feed_spec: afs,
  }
  const utms = buildUTMString(form)
  if (utms) body.url_tags = utms
  return body
}

/** Criativo de CATÁLOGO/COLEÇÃO: seu vídeo como capa + um product_set do
 *  catálogo. Na biblioteca aparece como anúncio de catálogo (template), não
 *  com o vídeo cru — é o que "esconde". O product_set fica no nível do criativo;
 *  o conjunto segue otimizando conversão normal (não vira DPA dinâmico). */
function buildCreativeBodyCatalogo(
  ctx: CreateCtx,
  conta: ContaExtra,
  v: CreateItem,
  urlBase: string,
  nomeCriativo: string,
): Record<string, unknown> {
  const { form } = ctx
  const vd: Record<string, unknown> = {
    video_id: v.id,
    message: eff(conta, form, 'copy'),
    title: gv(form, 'titulo'),
    call_to_action: {
      type: gv(form, 'cta'),
      value: { link: urlBase, link_caption: gv(form, 'url_exibicao') },
    },
  }
  if (v.thumbUrl) vd.image_url = v.thumbUrl
  const spec: Record<string, unknown> = { page_id: eff(conta, form, 'page_id'), video_data: vd }
  const ig = eff(conta, form, 'instagram_id')
  if (ig) spec.instagram_user_id = ig
  const body: Record<string, unknown> = {
    name: nomeCriativo,
    object_story_spec: spec,
    product_set_id: gv(form, 'product_set_id'),
  }
  const utms = buildUTMString(form)
  if (utms) body.url_tags = utms
  return body
}

function buildTargeting(paises: string[]) {
  return { geo_locations: { countries: paises }, device_platforms: ['mobile'] }
}

function campaignBody(ctx: CreateCtx, nome: string): Record<string, unknown> {
  const { form, budgetType } = ctx
  const body: Record<string, unknown> = {
    name: nome,
    objective: 'OUTCOME_SALES',
    status: gv(form, 'status_inicial'),
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  }
  if (budgetType === 'CBO') {
    body.daily_budget = parseInt(gv(form, 'budget'))
    body.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
  }
  return body
}

function adsetBody(
  ctx: CreateCtx,
  nome: string,
  campId: string,
): Record<string, unknown> {
  const { form, budgetType, paises, startUTC, endUTC } = ctx
  const body: Record<string, unknown> = {
    name: nome,
    campaign_id: campId,
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    targeting: buildTargeting(paises),
    promoted_object: {
      pixel_id: gv(form, 'pixel_id'),
      custom_event_type: gv(form, 'pixel_event'),
    },
    destination_type: 'WEBSITE',
    start_time: startUTC,
    status: gv(form, 'status_inicial'),
  }
  if (budgetType === 'ABO') {
    body.daily_budget = parseInt(gv(form, 'budget'))
    body.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
  }
  if (endUTC) body.end_time = endUTC
  // DSA (União Europeia): declara quem é promovido e quem paga.
  // O Meta usa "dsa_payor" (com o); mandamos as duas grafias por segurança.
  const dsa = gv(form, 'dsa_beneficiary')
  if (dsa) {
    body.dsa_beneficiary = dsa
    body.dsa_payor = dsa
    body.dsa_payer = dsa
  }
  return body
}

// ── N×1×1 ──
async function criarN11(ctx: CreateCtx, conta: ContaExtra, urlFinal: string) {
  const { form, paises, budgetType, lista } = ctx
  const acc = eff(conta, form, 'ad_account')
  const token = eff(conta, form, 'token')
  for (let i = 0; i < lista.length; i++) {
    if (ctx.shouldCancel?.()) { ctx.onLog('⛔ Cancelado pelo usuário — parou aqui.', 'warn'); return }
    const v = lista[i]
    const nome = buildNome(form, paises, budgetType, v.nome)
    ctx.onLog(`━━━ [${i + 1}/${lista.length}] ${v.nome}`, 'warn')
    let camp: any
    try {
      ctx.onLog('  [1/4] Campanha...')
      camp = await fbPost(token, `${acc}/campaigns`, campaignBody(ctx, nome))
      ctx.onLog(`  ✓ Camp: ${camp.id}`, 'ok')

      ctx.onLog('  [2/4] Conjunto...')
      const adset = await fbPost(token, `${acc}/adsets`, adsetBody(ctx, nome, camp.id))
      ctx.onLog(`  ✓ Conjunto: ${adset.id}`, 'ok')

      ctx.onLog('  [3/4] Criativo...')
      const creative = await fbPost(
        token,
        `${acc}/adcreatives`,
        buildCreativeBody(ctx, conta, v, urlFinal, nome),
      )
      ctx.onLog(`  ✓ Criativo: ${creative.id}`, 'ok')

      ctx.onLog('  [4/4] Anúncio...')
      const ad = await fbPost(token, `${acc}/ads`, {
        name: nome,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: gv(form, 'status_inicial'),
      })
      ctx.onLog(`  ✓ Ad: ${ad.id}`, 'ok')
      ctx.onResult(v.nome, true, `Camp ${camp.id} | AdSet ${adset.id} | Ad ${ad.id}`)
    } catch (e: any) {
      ctx.onLog(`  ✗ ${e.message}`, 'err')
      if (camp?.id) {
        try {
          await fbDel(token, camp.id)
          ctx.onLog(`  ↩ Rollback camp ${camp.id}`, 'warn')
        } catch {}
      }
      ctx.onResult(v.nome, false, e.message)
    }
    ctx.onProgress(i + 1, lista.length)
  }
}

// ── 1×N×1 ──
async function criar1N1(ctx: CreateCtx, conta: ContaExtra, urlFinal: string) {
  const { form, paises, budgetType, estrutura, lista } = ctx
  const acc = eff(conta, form, 'ad_account')
  const token = eff(conta, form, 'token')
  const total = lista.length
  ctx.onLog('[1/3] Criando campanha única...', 'info')
  let camp: any
  try {
    const nomeCamp = getCampNome(form, paises, budgetType, estrutura, lista[0].nome, total)
    camp = await fbPost(token, `${acc}/campaigns`, campaignBody(ctx, nomeCamp))
    ctx.onLog(`✓ Campanha: ${camp.id}`, 'ok')
  } catch (e: any) {
    ctx.onLog(`✗ Erro na campanha: ${e.message}`, 'err')
    return
  }
  for (let i = 0; i < lista.length; i++) {
    if (ctx.shouldCancel?.()) { ctx.onLog('⛔ Cancelado pelo usuário — parou aqui.', 'warn'); return }
    const v = lista[i]
    const nome = buildNome(form, paises, budgetType, v.nome)
    ctx.onLog(`━━━ [${i + 1}/${total}] ${v.nome}`, 'warn')
    let adset: any
    try {
      ctx.onLog('  [2/3] Conjunto...')
      adset = await fbPost(token, `${acc}/adsets`, adsetBody(ctx, nome, camp.id))
      ctx.onLog(`  ✓ Conjunto: ${adset.id}`, 'ok')

      ctx.onLog('  [3/3] Criativo + Anúncio...')
      const creative = await fbPost(
        token,
        `${acc}/adcreatives`,
        buildCreativeBody(ctx, conta, v, urlFinal, nome),
      )
      const ad = await fbPost(token, `${acc}/ads`, {
        name: nome,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: gv(form, 'status_inicial'),
      })
      ctx.onLog(`  ✓ Ad: ${ad.id}`, 'ok')
      ctx.onResult(v.nome, true, `AdSet ${adset.id} | Ad ${ad.id}`)
    } catch (e: any) {
      ctx.onLog(`  ✗ ${e.message}`, 'err')
      if (adset?.id) {
        try {
          await fbDel(token, adset.id)
        } catch {}
      }
      ctx.onResult(v.nome, false, e.message)
    }
    ctx.onProgress(i + 1, total)
  }
}

// ── 1×1×N ──
async function criar11N(ctx: CreateCtx, conta: ContaExtra, urlFinal: string) {
  const { form, paises, budgetType, estrutura, lista } = ctx
  const acc = eff(conta, form, 'ad_account')
  const token = eff(conta, form, 'token')
  const total = lista.length
  ctx.onLog('[1/3] Criando campanha e conjunto únicos...', 'info')
  const nomeEstrutura = getCampNome(
    form,
    paises,
    budgetType,
    estrutura,
    lista[0].nome,
    total,
  )
  let camp: any, adset: any
  try {
    camp = await fbPost(token, `${acc}/campaigns`, campaignBody(ctx, nomeEstrutura))
    ctx.onLog(`✓ Campanha: ${camp.id}`, 'ok')
    adset = await fbPost(token, `${acc}/adsets`, adsetBody(ctx, nomeEstrutura, camp.id))
    ctx.onLog(`✓ Conjunto: ${adset.id}`, 'ok')
  } catch (e: any) {
    ctx.onLog(`✗ Erro: ${e.message}`, 'err')
    if (camp?.id) {
      try {
        await fbDel(token, camp.id)
      } catch {}
    }
    return
  }
  for (let i = 0; i < lista.length; i++) {
    if (ctx.shouldCancel?.()) { ctx.onLog('⛔ Cancelado pelo usuário — parou aqui.', 'warn'); return }
    const v = lista[i]
    const nome = buildNome(form, paises, budgetType, v.nome)
    ctx.onLog(`━━━ [${i + 1}/${total}] ${v.nome}`, 'warn')
    try {
      const creative = await fbPost(
        token,
        `${acc}/adcreatives`,
        buildCreativeBody(ctx, conta, v, urlFinal, nome),
      )
      const ad = await fbPost(token, `${acc}/ads`, {
        name: nome,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: gv(form, 'status_inicial'),
      })
      ctx.onLog(`  ✓ Ad: ${ad.id}`, 'ok')
      ctx.onResult(v.nome, true, `Ad ${ad.id}`)
    } catch (e: any) {
      ctx.onLog(`  ✗ ${e.message}`, 'err')
      ctx.onResult(v.nome, false, e.message)
    }
    ctx.onProgress(i + 1, total)
  }
}

/** Roda a estrutura em todas as contas (para um conjunto de países já fixado no ctx). */
async function runContas(ctx: CreateCtx, urlFinal: string) {
  for (let ci = 0; ci < ctx.contas.length; ci++) {
    if (ctx.shouldCancel?.()) { ctx.onLog('⛔ Cancelado pelo usuário.', 'warn'); return }
    const conta = ctx.contas[ci]
    const nomeConta = eff(conta, ctx.form, 'ad_account')
    if (ctx.contas.length > 1) {
      ctx.onLog('')
      ctx.onLog('═'.repeat(45), 'info')
      ctx.onLog(`CONTA ${ci + 1}/${ctx.contas.length}: ${nomeConta}`, 'info')
      ctx.onLog('═'.repeat(45), 'info')
      ctx.onContaHeader(`Conta ${ci + 1}/${ctx.contas.length}: ${nomeConta}`)
    }
    ctx.onLog(
      `Iniciando — estrutura ${ctx.estrutura}, ${ctx.budgetType}, ${ctx.lista.length} criativo(s)`,
      'info',
    )
    ctx.onLog(`URL: ${urlFinal}`, 'info')
    ctx.onLog(`Início: ${ctx.startUTC}`, 'info')
    ctx.onLog('')

    if (ctx.estrutura === '11N') await criar11N(ctx, conta, urlFinal)
    else if (ctx.estrutura === '1N1') await criar1N1(ctx, conta, urlFinal)
    else await criarN11(ctx, conta, urlFinal)
  }
}

export async function runCreation(ctx: CreateCtx) {
  const urlFinal = gv(ctx.form, 'url_destino')
  const batches = ctx.paisBatches && ctx.paisBatches.length ? ctx.paisBatches : [ctx.paises]
  for (let bi = 0; bi < batches.length; bi++) {
    if (ctx.shouldCancel?.()) { ctx.onLog('⛔ Cancelado pelo usuário.', 'warn'); break }
    const paises = batches[bi]
    const bctx: CreateCtx = { ...ctx, paises }
    if (batches.length > 1) {
      bctx.onLog('')
      bctx.onLog('▣'.repeat(45), 'info')
      bctx.onLog(`PAÍS ${bi + 1}/${batches.length}: ${paises.join(', ') || '—'}`, 'info')
      bctx.onLog('▣'.repeat(45), 'info')
      bctx.onContaHeader(`País ${bi + 1}/${batches.length}: ${paises.join(', ') || '—'}`)
    }
    await runContas(bctx, urlFinal)
  }
  ctx.onLog('')
  ctx.onLog('━'.repeat(29), 'info')
  ctx.onLog('CONCLUÍDO', 'info')
}
