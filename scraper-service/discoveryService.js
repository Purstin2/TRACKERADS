import { createBrowser, createStealthContext } from './scraper.js';

/**
 * Serviço de Descoberta Automática de Ofertas — v2 (GraphQL)
 *
 * O Facebook removeu os links `view_all_page_id` do DOM da busca (por isso a
 * v1 voltava 0 anunciantes). A v2 não raspa mais o HTML visível: ela captura
 * o JSON que a própria Ad Library trafega (GraphQL + payload embutido no HTML
 * inicial), que traz page_id, page_name, ad_archive_id, start_date, is_active
 * e collation_count por anúncio.
 *
 * Fluxo:
 *  1. Busca por KEYWORD na Ad Library (país/ativos)
 *  2. Colhe todos os anúncios do resultado (HTML inicial + GraphQL das rolagens)
 *  3. Agrega por anunciante e ordena pelos MAIS ESCALADOS na keyword
 *  4. Confirma cada candidato na página do anunciante (total de ads ativos +
 *     data mais antiga, também via GraphQL/JSON — sem regex de texto PT)
 *  5. Retorna só quem passa nos filtros (≥minAdCount ads, ≥minDaysRunning dias)
 */

/* ── extração do JSON (funciona pro HTML embutido E pros bodies do GraphQL) ── */

/** Recorta arrays "collated_results":[...] de um texto, com colchetes balanceados. */
function extractCollatedArrays(text) {
    const out = [];
    const NEEDLE = '"collated_results":';
    let idx = 0;
    while ((idx = text.indexOf(NEEDLE, idx)) !== -1) {
        let i = idx + NEEDLE.length;
        while (i < text.length && text[i] !== '[' && text[i] !== 'n') i++; // 'n' = null
        if (text[i] !== '[') { idx = i; continue; }
        let depth = 0, inStr = false, esc = false, start = i;
        for (; i < text.length; i++) {
            const c = text[i];
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (c === '[') depth++;
            else if (c === ']') { depth--; if (depth === 0) { i++; break; } }
        }
        try {
            const arr = JSON.parse(text.slice(start, i));
            if (Array.isArray(arr)) out.push(...arr);
        } catch { /* pedaço corrompido — ignora */ }
        idx = i;
    }
    return out;
}

/** Normaliza um item de collated_results pro que interessa. */
function normalizeAd(item) {
    if (!item || !item.page_id) return null;
    return {
        pageId: String(item.page_id),
        pageName: item.page_name || null,
        adArchiveId: item.ad_archive_id ? String(item.ad_archive_id) : null,
        startDate: typeof item.start_date === 'number' ? item.start_date * 1000 : null,
        isActive: item.is_active !== false,
        collationCount: Math.max(1, parseInt(item.collation_count, 10) || 1),
    };
}

/** Conta "~N resultados" no texto visível (ainda funciona — só os links sumiram). */
function extractResultCount(bodyText) {
    const patterns = [
        /~?\s*([\d.,]+)\s+resultados?/i,
        /~?\s*([\d.,]+)\s+results?/i,
        /([\d.,]+)\s+anúncios?\s+ativos?/i,
    ];
    for (const pat of patterns) {
        const m = bodyText.match(pat);
        if (m) {
            const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
            if (n > 0 && n <= 1000000 && (n < 2020 || n > 2030)) return n;
        }
    }
    return null;
}

/**
 * Abre uma URL da Ad Library e colhe os anúncios (JSON embutido + GraphQL das
 * rolagens). Retorna { ads: [normalizados], resultCount, bodyText }.
 */
async function harvestAdsFromUrl(context, url, { scrolls = 4, settleMs = 6000 } = {}) {
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    const gqlAds = [];
    page.on('response', async (res) => {
        if (!/graphql/i.test(res.url())) return;
        try {
            const t = await res.text();
            if (t.includes('collated_results')) extractCollatedArrays(t).forEach((x) => gqlAds.push(x));
        } catch { /* body já consumido/binário */ }
    });

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(settleMs);
        for (let s = 0; s < scrolls; s++) {
            await page.evaluate(() => window.scrollBy(0, 1500));
            await page.waitForTimeout(1800);
        }
        const html = await page.content();
        const bodyText = await page.evaluate(() => document.body.innerText || '');
        const all = [...extractCollatedArrays(html), ...gqlAds];

        // dedupe por ad_archive_id (o mesmo ad pode vir no HTML e no GraphQL)
        const seen = new Set();
        const ads = [];
        for (const raw of all) {
            const ad = normalizeAd(raw);
            if (!ad) continue;
            const k = ad.adArchiveId || `${ad.pageId}-${ads.length}`;
            if (seen.has(k)) continue;
            seen.add(k);
            ads.push(ad);
        }
        return { ads, resultCount: extractResultCount(bodyText), bodyText };
    } finally {
        await page.close().catch(() => {});
    }
}

/** Fallback DOM antigo (se o Facebook voltar atrás no layout). */
async function domFallbackAdvertisers(context, url) {
    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(5000);
        for (let s = 0; s < 4; s++) {
            await page.evaluate(() => window.scrollBy(0, 900));
            await page.waitForTimeout(1500);
        }
        return await page.evaluate(() => {
            const seen = new Set();
            const result = [];
            document.querySelectorAll('a[href*="view_all_page_id"]').forEach((link) => {
                const match = link.href.match(/view_all_page_id=(\d+)/);
                if (!match || seen.has(match[1])) return;
                seen.add(match[1]);
                result.push({ pageId: match[1], name: (link.textContent || '').trim().substring(0, 120) || `Anunciante ${match[1]}` });
            });
            return result;
        });
    } finally {
        await page.close().catch(() => {});
    }
}

/**
 * Descobre ofertas escalando para uma keyword específica
 * @param {string} keyword
 * @param {Object} options
 * @param {number} options.minAdCount     - mínimo de anúncios ativos do anunciante (padrão 20)
 * @param {number} options.minDaysRunning - mínimo de dias rodando (padrão 2)
 * @param {number} options.maxAdvertisers - máximo de anunciantes a confirmar (padrão 15)
 * @param {string} options.country        - país (padrão 'BR')
 * @param {(msg: string) => void} [options.onLog]     - log pro painel (além do console)
 * @param {() => boolean}         [options.shouldStop] - retorna true = usuário pediu Parar
 * @returns {Promise<{success: boolean, offers: Array, keyword: string, error?: string, stopped?: boolean}>}
 */
export async function discoverOffersByKeyword(keyword, options = {}) {
    const {
        minAdCount = 20,
        minDaysRunning = 2,
        maxAdvertisers = 15,
        country = 'BR',
        onLog,
        shouldStop = () => false,
    } = options;
    const log = (msg) => { if (onLog) onLog(msg); else console.log(msg); };

    let browser;
    const qualifiedOffers = [];

    try {
        log(`🔍 "${keyword}" — filtros: ≥${minAdCount} ads · ≥${minDaysRunning} dias · ${country}`);

        // browser/contexto stealth compartilhados com o scraper (máscara de
        // automação + bloqueio de imagem/fonte = mais rápido; GraphQL passa)
        browser = await createBrowser();
        const context = await createStealthContext(browser);

        // ── PASSO 1: busca por keyword e colhe os anúncios do resultado ──────
        const searchUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(keyword)}&search_type=keyword_unordered&media_type=all`;
        const search = await harvestAdsFromUrl(context, searchUrl, { scrolls: 5 });
        log(`📥 "${keyword}": ${search.ads.length} anúncios colhidos (total na keyword: ${search.resultCount ?? '?'})`);

        // ── PASSO 2: agrega por anunciante (quem tem MAIS anúncios na keyword) ──
        const byPage = new Map();
        for (const ad of search.ads) {
            if (!ad.isActive) continue;
            const p = byPage.get(ad.pageId) || { pageId: ad.pageId, name: ad.pageName, matched: 0, minStart: null, bestAd: null, bestCollation: 0 };
            p.matched += ad.collationCount;
            if (!p.name && ad.pageName) p.name = ad.pageName;
            if (ad.startDate && (!p.minStart || ad.startDate < p.minStart)) p.minStart = ad.startDate;
            if (ad.adArchiveId && ad.collationCount >= p.bestCollation) { p.bestAd = ad.adArchiveId; p.bestCollation = ad.collationCount; }
            byPage.set(ad.pageId, p);
        }

        let advertisers = [...byPage.values()].sort((a, b) => b.matched - a.matched);

        // fallback: layout novo não rendeu nada? tenta o DOM antigo
        if (advertisers.length === 0) {
            log(`⚠ "${keyword}": JSON não rendeu — tentando fallback DOM…`);
            const domAds = await domFallbackAdvertisers(context, searchUrl);
            advertisers = domAds.map((a) => ({ pageId: a.pageId, name: a.name, matched: 0, minStart: null, bestAd: null }));
        }

        log(`👥 "${keyword}": ${advertisers.length} anunciantes únicos`);
        if (advertisers.length === 0) {
            await browser.close();
            return { success: true, offers: [], keyword };
        }

        // ── PASSO 3: confirma cada candidato na página do anunciante ─────────
        let stopped = false;
        const toProcess = advertisers.slice(0, maxAdvertisers);
        for (let i = 0; i < toProcess.length; i++) {
            if (shouldStop()) { stopped = true; log(`⏹ "${keyword}": interrompida pelo usuário (${i}/${toProcess.length} verificados)`); break; }
            const cand = toProcess[i];
            const name0 = cand.name || `Anunciante ${cand.pageId}`;
            log(`🔎 "${keyword}" [${i + 1}/${toProcess.length}] ${name0} — ${cand.matched} ads na keyword`);

            const libUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&view_all_page_id=${cand.pageId}`;
            try {
                const adv = await harvestAdsFromUrl(context, libUrl, { scrolls: 2, settleMs: 4500 });

                // total de anúncios ativos: texto "~N resultados" (preciso), senão o nº colhido
                const adCount = adv.resultCount ?? adv.ads.length;
                if (!adCount || adCount < minAdCount) {
                    log(`✗ ${name0}: ${adCount ?? 0} ads ativos (mínimo: ${minAdCount})`);
                    await randomDelay(2500, 5000);
                    continue;
                }

                // dias rodando: menor start_date do JSON (da página do anunciante,
                // senão o da busca) — sem depender de regex de "Iniciado em"
                const starts = adv.ads.filter((a) => a.startDate).map((a) => a.startDate);
                const oldest = starts.length ? Math.min(...starts) : cand.minStart;
                const daysRunning = oldest ? Math.floor((Date.now() - oldest) / 86400000) : null;
                if (daysRunning !== null && daysRunning < minDaysRunning) {
                    log(`✗ ${name0}: só ${daysRunning} dia(s) rodando (mínimo: ${minDaysRunning})`);
                    await randomDelay(2500, 5000);
                    continue;
                }

                // nome real: JSON da própria página do anunciante é a fonte mais confiável
                const advertiserName = adv.ads.find((a) => a.pageName)?.pageName || name0;
                const sampleAd = cand.bestAd || adv.ads.find((a) => a.adArchiveId)?.adArchiveId || null;

                log(`✅ QUALIFICADO: "${advertiserName}" | ${adCount} ads | ${daysRunning ?? '?'} dias`);
                qualifiedOffers.push({
                    advertiser_name: advertiserName,
                    facebook_page_id: cand.pageId,
                    facebook_link: libUrl,
                    // link direto do anúncio mais "colado" (variações) da keyword:
                    sample_ad_link: sampleAd ? `https://www.facebook.com/ads/library/?id=${sampleAd}` : null,
                    ad_count: adCount,
                    days_running: daysRunning,
                    oldest_ad_date: oldest ? new Date(oldest).toISOString().split('T')[0] : null,
                    keyword
                });
            } catch (err) {
                log(`⚠ Erro ao confirmar ${cand.pageId}: ${err.message}`);
            }
            await randomDelay(3000, 6000);
        }

        await browser.close();
        log(`🏁 "${keyword}": ${qualifiedOffers.length} qualificada(s) de ${Math.min(toProcess.length, maxAdvertisers)} verificadas${stopped ? ' (parcial — parado)' : ''}`);

        return { success: true, offers: qualifiedOffers, keyword, stopped };

    } catch (error) {
        log(`❌ "${keyword}" erro crítico: ${error.message}`);
        if (browser) await browser.close().catch(() => {});
        return { success: false, offers: [], keyword, error: error.message };
    }
}

/** Helper: delay aleatório entre min e max ms (anti-bloqueio) */
function randomDelay(min, max) {
    const ms = Math.floor(min + Math.random() * (max - min));
    return new Promise(r => setTimeout(r, ms));
}
