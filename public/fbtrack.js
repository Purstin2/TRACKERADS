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

  // ── _fbc: fb.1.<timestamp_ms>.<fbclid> ───────────────────────────────────────
  var fbclid = getParam('fbclid')
  var fbc = getCookie('_fbc')
  if (fbclid) {
    // chegou clique novo do anúncio → (re)grava o _fbc com timestamp atual
    fbc = 'fb.1.' + Date.now() + '.' + fbclid
    setCookie('_fbc', fbc, 90)
  }

  // ── _fbp: fb.1.<timestamp_ms>.<random> (cria se o Pixel não tiver criado) ────
  var fbp = getCookie('_fbp')
  if (!fbp) {
    fbp = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 1e10)
    setCookie('_fbp', fbp, 90)
  }

  // ── UTMs: persiste em cookie pra não perder na navegação ─────────────────────
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
  var utms = {}
  UTM_KEYS.forEach(function (k) {
    var v = getParam(k)
    if (v) setCookie('k_' + k, v, 90)
    utms[k] = v || getCookie('k_' + k) || ''
  })
  // gclid também (Google), caso rode tráfego no Google depois
  var gclid = getParam('gclid')
  if (gclid) setCookie('k_gclid', gclid, 90)
  gclid = gclid || getCookie('k_gclid') || ''

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
        // o que estiver em src/sck/xcod. Então empacotamos fbc/fbp/fbclid num blob
        // compacto "fbc:VALOR|fbp:VALOR" que o nosso webhook (parseTrkField) lê.
        var parts = []
        if (fbc) parts.push('fbc:' + fbc)
        if (fbp) parts.push('fbp:' + fbp)
        if (fbclid) parts.push('fbclid:' + fbclid)
        if (gclid) parts.push('gclid:' + gclid)
        if (parts.length) {
          var blob = parts.join('|')
          u.searchParams.set('sck', blob)   // sck é o campo de tracking devolvido no webhook
          u.searchParams.set('src', blob)   // redundância: a Hotmart às vezes usa src
        }
        // campanha vai pros UTMs normais (não no src, que agora carrega fbc/fbp)
        UTM_KEYS.forEach(function (k) { if (utms[k]) u.searchParams.set(k, utms[k]) })
        return u.toString()
      }

      // Kirvano e demais: params diretos
      if (fbc) u.searchParams.set('fbc', fbc)
      if (fbp) u.searchParams.set('fbp', fbp)
      if (fbclid) u.searchParams.set('fbclid', fbclid)
      UTM_KEYS.forEach(function (k) { if (utms[k]) u.searchParams.set(k, utms[k]) })
      if (gclid) u.searchParams.set('gclid', gclid)
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

  // intercepta clique direto (caso o href seja trocado por JS no último instante)
  document.addEventListener(
    'click',
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null
      if (a && isCheckout(a.href) && !a.getAttribute('data-fbtrack')) {
        a.href = decorate(a.href)
        a.setAttribute('data-fbtrack', '1')
      }
    },
    true
  )

  // ── ViewContent (página de produto) ──────────────────────────────────────────
  // Chame em páginas de produto: fbTrack.viewContent({ content_ids:['SKU'],
  // content_name:'Pack Festas', value:29.9, currency:'BRL' }).
  // Ou, sem código, defina window.FB_VIEW_CONTENT = {...} antes do script → auto-dispara.
  function viewContent(data) {
    try { fbq('track', 'ViewContent', data || {}) } catch (e) {}
  }
  window.fbTrack = { viewContent: viewContent, decorate: decorate, pixelId: PIXEL_ID }
  if (window.FB_VIEW_CONTENT) viewContent(window.FB_VIEW_CONTENT)

  // expõe pra debug no console: window.__fbtrack
  window.__fbtrack = { fbc: fbc, fbp: fbp, fbclid: fbclid, utms: utms, gclid: gclid, decorate: decorate, pixelId: PIXEL_ID }
})()
