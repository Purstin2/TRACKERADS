/*!
 * fbtrack.js — Meta Pixel (browser) + captura fbclid/_fbc/_fbp pro checkout.
 * Substitui o que a UTMIFY fazia. Sem dependências, ~3KB.
 *
 * COMO USAR:
 * 1. Hospede este arquivo (já vai no /public do PURSTINLAB → https://SEU-APP.vercel.app/fbtrack.js)
 * 2. No <head> do seu site (premium.ultrapack3d.com), antes de qualquer link de checkout.
 *    (opcional) defina o pixel ANTES, se for diferente do padrão:
 *      <script>window.FB_PIXEL_ID = '2290509241458184'</script>
 *      <script src="https://SEU-APP.vercel.app/fbtrack.js" defer></script>
 * 3. Pronto. Ele:
 *    - inicializa o Meta Pixel e dispara PageView automaticamente
 *    - expõe window.fbTrack.viewContent(...) pra páginas de produto
 *    - lê o fbclid da URL (clique do anúncio) e grava o cookie _fbc no formato do Meta
 *    - garante que o cookie _fbp exista (cria se faltar)
 *    - acrescenta _fbc, _fbp, fbclid e os UTMs em TODO link de checkout (Kirvano/Hotmart),
 *      pra o gateway repassar no webhook → nosso CAPI manda fbc/fbp.
 *
 * DIVISÃO DE EVENTOS (sem duplicar): o BROWSER dispara só topo de funil
 * (PageView/ViewContent). InitiateCheckout e Purchase ficam no SERVIDOR (CAPI no
 * webhook), que tem match melhor (email/telefone/CPF/IP do comprador).
 */
(function () {
  'use strict'

  // ── Meta Pixel (base code) ───────────────────────────────────────────────────
  var DEFAULT_PIXEL_ID = '2290509241458184'   // pixel principal (fallback)
  var PIXEL_ID = window.FB_PIXEL_ID || DEFAULT_PIXEL_ID
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  /* eslint-enable */
  if (PIXEL_ID) {
    fbq('init', PIXEL_ID)
    fbq('track', 'PageView')
  }

  // ── TikTok Pixel (base code) ─────────────────────────────────────────────────
  // Inicializa o pixel do TikTok no browser (PageView + cria o cookie _ttp, que
  // o fbtrack lê e manda pro checkout). Purchase/CompletePayment fica no SERVIDOR
  // (Events API no webhook), sem duplicar. Override por window.TIKTOK_PIXEL_ID.
  var TIKTOK_PIXEL_ID = window.TIKTOK_PIXEL_ID || 'D90PRG3C77U3814AHM4G'
  /* eslint-disable */
  !function (w, d, t) {
    w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || []; ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent']; ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } }; for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]); ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e }; ttq.load = function (e, n) { var r = 'https://analytics.tiktok.com/i18n/pixel/events.js', o = n && n.partner; ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r; ttq._t = ttq._t || {}; ttq._t[e] = +new Date; ttq._o = ttq._o || {}; ttq._o[e] = n || {}; n = document.createElement('script'); n.type = 'text/javascript'; n.async = !0; n.src = r + '?sdkid=' + e + '&lib=' + t; e = document.getElementsByTagName('script')[0]; e.parentNode.insertBefore(n, e) }
  }(window, document, 'ttq')
  /* eslint-enable */
  if (TIKTOK_PIXEL_ID && window.ttq) {
    try { window.ttq.load(TIKTOK_PIXEL_ID); window.ttq.page() } catch (e) {}
  }

  var DOMAIN = location.hostname.replace(/^www\./, '')
  // domínios de checkout pra onde propagar os parâmetros
  var KIRVANO_HOSTS = ['kirvano.com', 'pay.kirvano.com']
  var HOTMART_HOSTS = ['hotmart.com', 'pay.hotmart.com', 'go.hotmart.com', 'hotm.art']
  var CHECKOUT_HOSTS = KIRVANO_HOSTS.concat(HOTMART_HOSTS)

  // ── cookies ────────────────────────────────────────────────────────────────
  function getCookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)')
    return m ? decodeURIComponent(m.pop()) : null
  }
  function setCookie(name, value, days) {
    var d = new Date()
    d.setTime(d.getTime() + (days || 90) * 86400000)
    // domínio raiz pra valer em subdomínios (.ultrapack3d.com)
    var root = '.' + DOMAIN.split('.').slice(-2).join('.')
    document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;domain=' + root + ';SameSite=Lax'
  }

  function getParam(name) {
    return new URLSearchParams(location.search).get(name)
  }

  // ── Atribuição "primeiro toque PAGO vence" ───────────────────────────────────
  // Problema clássico: a pessoa clica no ANÚNCIO (fbclid + utm_source=FB|campanha),
  // sai, e volta DEPOIS pela BIO do Instagram (utm_source=ig, medium=social,
  // content=link_in_bio, carregando um fbclid do app). Sem tratamento, esse último
  // toque "orgânico" sobrescreve o do anúncio e a venda parece orgânica no Meta.
  // Regra: um toque ORGÂNICO nunca apaga uma atribuição de ANÚNCIO já guardada;
  // um novo clique de anúncio atualiza pra ele (last paid-click vence).
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

  // É clique de anúncio pago? (tem campanha de verdade e não é social/bio)
  function looksPaid(src, med, camp, cont) {
    src = (src || '').toLowerCase(); med = (med || '').toLowerCase()
    cont = (cont || '').toLowerCase(); camp = camp || ''
    if (cont.indexOf('link_in_bio') >= 0) return false
    if (med === 'social' || med === 'organic') return false
    // FB/IG pago manda utm_campaign (geralmente "Nome|ID"); bio orgânica não tem
    return !!camp || src === 'fb' || src === 'facebook'
  }

  var urlFbclid = getParam('fbclid')
  var urlUtm = {}
  UTM_KEYS.forEach(function (k) { urlUtm[k] = getParam(k) || '' })

  var hadStored = !!(getCookie('k_utm_source') || getCookie('k_fbclid') || getCookie('_fbc'))
  var curPaid = looksPaid(urlUtm.utm_source, urlUtm.utm_medium, urlUtm.utm_campaign, urlUtm.utm_content)
  // grava/sobrescreve a atribuição quando: é clique de anúncio pago, OU ainda não há
  // nada guardado (primeiro toque, mesmo orgânico, é melhor que nada).
  var writeAttr = curPaid || !hadStored

  if (writeAttr) {
    UTM_KEYS.forEach(function (k) { if (urlUtm[k]) setCookie('k_' + k, urlUtm[k], 90) })
    if (urlFbclid) setCookie('k_fbclid', urlFbclid, 90)
  }

  // ── _fbc: prioriza o fbclid GUARDADO (do anúncio) sobre o atual (bio) ─────────
  var fbclid = getCookie('k_fbclid') || urlFbclid || ''
  var fbc = getCookie('_fbc')
  // (re)grava o _fbc se veio clique de anúncio pago agora, OU se não existe _fbc ainda
  if (fbclid && (writeAttr || !fbc)) {
    fbc = 'fb.1.' + Date.now() + '.' + fbclid
    setCookie('_fbc', fbc, 90)
  }

  // ── _fbp: fb.1.<timestamp_ms>.<random> (cria se o Pixel não tiver criado) ────
  var fbp = getCookie('_fbp')
  if (!fbp) {
    fbp = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 1e10)
    setCookie('_fbp', fbp, 90)
  }

  // ── UTMs efetivos = os GUARDADOS (já refletem "pago vence") ───────────────────
  var utms = {}
  UTM_KEYS.forEach(function (k) { utms[k] = getCookie('k_' + k) || urlUtm[k] || '' })

  // gclid também (Google), caso rode tráfego no Google depois
  var gclid = getParam('gclid')
  if (gclid) setCookie('k_gclid', gclid, 90)
  gclid = gclid || getCookie('k_gclid') || ''

  // ttclid (TikTok) — pro Events API server-side. _ttp é o cookie que o pixel do TikTok cria.
  var ttclid = getParam('ttclid')
  if (ttclid) setCookie('k_ttclid', ttclid, 90)
  ttclid = ttclid || getCookie('k_ttclid') || ''
  var ttp = getCookie('_ttp') || ''

  // xcod (Hotmart): o uploader monta ele com campanha/adset/anúncio/placement e
  // ele chega na landing pela URL do anúncio. É o ÚNICO campo em que a campanha
  // volta no webhook da Hotmart — os utm_* que a gente põe no link do checkout
  // ela não devolve. Guarda igual aos UTMs (mesma regra de "pago vence").
  var xcod = getParam('xcod')
  if (xcod && writeAttr) setCookie('k_xcod', xcod, 90)
  xcod = xcod || getCookie('k_xcod') || ''

  // ── propaga tudo pros links de checkout ──────────────────────────────────────
  function isCheckout(href) {
    try {
      var h = new URL(href, location.href).hostname.replace(/^www\./, '')
      return CHECKOUT_HOSTS.some(function (c) { return h === c || h.endsWith('.' + c) })
    } catch (e) {
      return false
    }
  }

  function hostOf(url) {
    try { return new URL(url, location.href).hostname.replace(/^www\./, '') } catch (e) { return '' }
  }
  function isHotmart(url) {
    var h = hostOf(url)
    return HOTMART_HOSTS.some(function (c) { return h === c || h.endsWith('.' + c) })
  }

  function decorate(url) {
    try {
      var u = new URL(url, location.href)

      if (isHotmart(url)) {
        // Hotmart NÃO lê params soltos como fbc=/fbp=. Ela só DEVOLVE no webhook
        // o que estiver em src/sck/xcod. Então empacotamos fbc/fbp num blob
        // compacto "fbc:VALOR|fbp:VALOR" que o nosso webhook (parseTrkField) lê.
        //
        // ⚠ A Hotmart CORTA src/sck em 255 caracteres (medido num webhook real:
        // blob de 410 chegou com 255, decepando o que estava no fim). Por isso:
        //  - fbc e fbp vêm PRIMEIRO — são os dois sinais que importam pro Meta;
        //  - fbclid só entra se NÃO houver fbc, porque o fbc já é "fb.1.<ts>.<fbclid>"
        //    e repetir ele custava ~180 chars do orçamento à toa;
        //  - gclid/ttclid/ttp entram por último e só se ainda couber.
        var LIMITE = 255
        var parts = []
        if (fbc) parts.push('fbc:' + fbc)
        if (fbp) parts.push('fbp:' + fbp)
        if (fbclid && !fbc) parts.push('fbclid:' + fbclid)
        var blob = parts.join('|')
        // extras: só cabem se o essencial já estiver dentro do limite
        var extras = []
        if (gclid) extras.push('gclid:' + gclid)
        if (ttclid) extras.push('ttclid:' + ttclid)
        if (ttp) extras.push('ttp:' + ttp)
        for (var xi = 0; xi < extras.length; xi++) {
          var tentativa = blob ? blob + '|' + extras[xi] : extras[xi]
          if (tentativa.length <= LIMITE) blob = tentativa
        }
        if (blob) {
          u.searchParams.set('sck', blob)   // sck é o campo de tracking devolvido no webhook
          u.searchParams.set('src', blob)   // redundância: a Hotmart às vezes usa src
        }
        // xcod = campanha/adset/anúncio/placement (montado pelo uploader). É o
        // único campo que sobra, já que src/sck estão ocupados pelo fbc/fbp — e o
        // único jeito de saber DE QUAL CAMPANHA veio a venda na Hotmart.
        if (xcod) u.searchParams.set('xcod', xcod)
        // utm_* também vão (a Hotmart não devolve, mas não custa e servem se ela
        // passar adiante num redirect pra outro checkout)
        UTM_KEYS.forEach(function (k) { if (utms[k]) u.searchParams.set(k, utms[k]) })
        return u.toString()
      }

      // Kirvano e demais: params diretos (manda fbc/fbp e as variantes _fbc/_fbp,
      // pq a Kirvano só repassa no webhook alguns nomes — cobrimos os dois jeitos).
      if (fbc) { u.searchParams.set('fbc', fbc); u.searchParams.set('_fbc', fbc) }
      if (fbp) { u.searchParams.set('fbp', fbp); u.searchParams.set('_fbp', fbp) }
      if (fbclid) u.searchParams.set('fbclid', fbclid)
      UTM_KEYS.forEach(function (k) { if (utms[k]) u.searchParams.set(k, utms[k]) })
      if (gclid) u.searchParams.set('gclid', gclid)
      if (ttclid) u.searchParams.set('ttclid', ttclid)
      if (ttp) u.searchParams.set('ttp', ttp)
      return u.toString()
    } catch (e) {
      return url
    }
  }

  function decorateAllLinks() {
    var links = document.querySelectorAll('a[href]')
    for (var i = 0; i < links.length; i++) {
      var a = links[i]
      if (isCheckout(a.href) && !a.getAttribute('data-fbtrack')) {
        a.href = decorate(a.href)
        a.setAttribute('data-fbtrack', '1')
      }
    }
  }

  // roda agora e re-roda quando o DOM muda (botões que aparecem depois)
  if (document.readyState !== 'loading') decorateAllLinks()
  else document.addEventListener('DOMContentLoaded', decorateAllLinks)

  // cobre links injetados dinamicamente (popups de checkout, etc.)
  try {
    new MutationObserver(decorateAllLinks).observe(document.documentElement, { childList: true, subtree: true })
  } catch (e) {}

  // ── Evento de funil no clique (opcional, estilo "Contém CSS" da UTMIFY) ───────
  // DESLIGADO por padrão. Pra ligar, ANTES do script:
  //   window.FB_CLICK_EVENT = 'InitiateCheckout'       // evento a disparar
  //   window.FB_CLICK_SELECTOR = '.btn-checkout'       // (opcional) CSS selector do botão
  //   window.FB_CHECKOUT_KEYWORDS = ['kirvano','pay']  // (opcional) keywords no href do botão
  //   window.FB_CLICK_DATA = { value: 59.9, currency: 'BRL' }   // (opcional)
  // Dispara quando clicam num link de checkout (Kirvano/Hotmart), num elemento que
  // casa o seletor, OU num link cujo href contém qualquer uma das keywords.
  // O servidor já manda InitiateCheckout com dados do comprador (email/CPF/tel) —
  // este evento browser complementa com o clique, antes do preenchimento.
  var CLICK_EVENT = window.FB_CLICK_EVENT || null
  var CLICK_SELECTOR = window.FB_CLICK_SELECTOR || null
  var _kwSrc = window.FB_CHECKOUT_KEYWORDS
  var CHECKOUT_KEYWORDS = Array.isArray(_kwSrc)
    ? _kwSrc
    : (_kwSrc ? String(_kwSrc).split(',').map(function (k) { return k.trim() }).filter(Boolean) : [])

  function strHasKeyword(s) {
    if (!s || !CHECKOUT_KEYWORDS.length) return false
    var low = String(s).toLowerCase()
    return CHECKOUT_KEYWORDS.some(function (k) { return k && low.indexOf(k.toLowerCase()) >= 0 })
  }
  var hrefHasKeyword = strHasKeyword   // mantém nome antigo

  // Acha uma URL de checkout no elemento clicado OU nos ancestrais — cobrindo
  // não só <a href>, mas também botões com onclick="goCheckout('https://pay.kirvano...')",
  // data-href, data-url, etc. Retorna { url, node } ou null.
  function findCheckoutTarget(el) {
    var node = el
    for (var i = 0; node && node.getAttribute && i < 6; i++, node = node.parentElement) {
      // 1) link normal
      if (node.tagName === 'A' && node.getAttribute('href')) {
        var href = node.href
        if (isCheckout(href) || strHasKeyword(href)) return { url: href, node: node, isAnchor: true }
      }
      // 2) onclick / data-* que carregam a URL (botões com redirect via JS)
      var blob =
        (node.getAttribute('onclick') || '') + ' ' +
        (node.getAttribute('data-href') || '') + ' ' +
        (node.getAttribute('data-url') || '') + ' ' +
        (node.getAttribute('data-checkout') || '') + ' ' +
        (node.getAttribute('data-link') || '')
      if (blob.trim()) {
        var m = blob.match(/https?:\/\/[^'"\s)]+/)
        var url = m ? m[0] : null
        if ((url && (isCheckout(url) || strHasKeyword(url))) || strHasKeyword(blob)) {
          return { url: url, node: node, isAnchor: false }
        }
      }
    }
    return null
  }

  function fireFunnelClick() {
    if (!CLICK_EVENT) return
    try { fbq('track', CLICK_EVENT, window.FB_CLICK_DATA || {}) } catch (e) {}
  }

  // intercepta clique (em link OU botão) que leva pro checkout
  document.addEventListener(
    'click',
    function (e) {
      var t = e.target
      var hit = t && t.closest ? findCheckoutTarget(t) : null
      // se for <a href> de checkout, decora com fbc/fbp (uma vez)
      if (hit && hit.isAnchor && hit.node && !hit.node.getAttribute('data-fbtrack')) {
        try { hit.node.href = decorate(hit.node.href); hit.node.setAttribute('data-fbtrack', '1') } catch (e2) {}
      }
      // seletor manual (FB_CLICK_SELECTOR) continua valendo como alternativa
      var matchSel = CLICK_SELECTOR && t && t.closest ? t.closest(CLICK_SELECTOR) : null
      if (CLICK_EVENT && (hit || matchSel)) fireFunnelClick()
    },
    true
  )

  // ── ViewContent (página de produto) ──────────────────────────────────────────
  // Chame em páginas de produto: fbTrack.viewContent({ content_ids:['SKU'],
  // content_name:'Pack Festas', value:29.9, currency:'BRL' }).
  // Ou, sem código, defina window.FB_VIEW_CONTENT = {...} (ou = true) antes do
  // script → auto-dispara junto com o PageView.
  function viewContent(data) {
    // aceita objeto com dados; se vier `true`/vazio, manda ViewContent simples
    var payload = data && typeof data === 'object' ? data : {}
    try { fbq('track', 'ViewContent', payload) } catch (e) {}
  }
  // helpers manuais p/ disparar qualquer evento de funil onde você quiser
  function track(event, data) { try { fbq('track', event, data || {}) } catch (e) {} }
  window.fbTrack = {
    viewContent: viewContent,
    addToCart: function (d) { track('AddToCart', d) },
    initiateCheckout: function (d) { track('InitiateCheckout', d) },
    track: track,
    decorate: decorate,
    pixelId: PIXEL_ID,
  }
  if (window.FB_VIEW_CONTENT) viewContent(window.FB_VIEW_CONTENT)

  // expõe pra debug no console: window.__fbtrack
  window.__fbtrack = { fbc: fbc, fbp: fbp, fbclid: fbclid, utms: utms, xcod: xcod, gclid: gclid, decorate: decorate, pixelId: PIXEL_ID }
})()
