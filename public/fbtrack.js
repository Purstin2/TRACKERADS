/*!
 * fbtrack.js — captura fbclid/_fbc/_fbp e repassa pro checkout Kirvano.
 * Substitui o que a UTMIFY fazia. Sem dependências, ~1.5KB.
 *
 * COMO USAR:
 * 1. Hospede este arquivo (já vai no /public do PURSTINLAB → https://SEU-APP.vercel.app/fbtrack.js)
 * 2. No <head> do seu site (premium.ultrapack3d.com), antes de qualquer link de checkout:
 *      <script src="https://SEU-APP.vercel.app/fbtrack.js" defer></script>
 * 3. Pronto. Ele:
 *    - lê o fbclid da URL (vindo do clique no anúncio) e grava o cookie _fbc no formato do Meta
 *    - garante que o cookie _fbp exista (cria se faltar)
 *    - acrescenta _fbc, _fbp, fbclid e os UTMs em TODO link que aponta pro checkout
 *      (pay.kirvano.com), pra Kirvano repassar no webhook → nosso CAPI manda fbc/fbp.
 */
(function () {
  'use strict'

  var DOMAIN = location.hostname.replace(/^www\./, '')
  // domínios de checkout pra onde devemos propagar os parâmetros
  var CHECKOUT_HOSTS = ['kirvano.com', 'pay.kirvano.com']

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

  function decorate(url) {
    try {
      var u = new URL(url, location.href)
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

  // expõe pra debug no console: window.__fbtrack
  window.__fbtrack = { fbc: fbc, fbp: fbp, fbclid: fbclid, utms: utms, gclid: gclid, decorate: decorate }
})()
