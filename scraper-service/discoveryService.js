import { createBrowser, createStealthContext, extractAdData, scrapeFacebookAdsCount } from './scraper.js';

/**
 * Serviço de Descoberta Automática de Ofertas
 *
 * Busca por anunciantes na Biblioteca de Anúncios do Facebook
 * com base em uma keyword e retorna apenas os que passam nos filtros:
 *  - Mínimo de adCount anúncios ativos
 *  - Rodando há pelo menos minDaysRunning dias
 */

/**
 * Descobre ofertas escalando para uma keyword específica
 * @param {string} keyword - Palavra-chave para busca
 * @param {Object} options
 * @param {number} options.minAdCount - Mínimo de anúncios ativos (padrão: 20)
 * @param {number} options.minDaysRunning - Mínimo de dias rodando (padrão: 2)
 * @param {number} options.maxAdvertisers - Máximo de anunciantes a processar (padrão: 15)
 * @param {string} options.country - País (padrão: 'BR')
 * @returns {Promise<{success: boolean, offers: Array, keyword: string, error?: string}>}
 */
export async function discoverOffersByKeyword(keyword, options = {}) {
    const {
        minAdCount = 20,
        minDaysRunning = 2,
        maxAdvertisers = 15,
        country = 'BR'
    } = options;

    let browser;
    const qualifiedOffers = [];

    try {
        console.log(`\n[DISCOVERY] ========================================`);
        console.log(`[DISCOVERY] Iniciando busca por: "${keyword}"`);
        console.log(`[DISCOVERY] Filtros: ≥${minAdCount} ads | ≥${minDaysRunning} dias | país: ${country}`);
        console.log(`[DISCOVERY] ========================================`);

        browser = await createBrowser();
        const context = await createStealthContext(browser);

        // ── SESSÃO LOGADA DO FB (opcional) ──────────────────────────────────
        // Se FB_COOKIES estiver setado (JSON do Cookie-Editor), injeta a sessão
        // logada → o FB passa a entregar os resultados da busca pro robô.
        // Sem isso, a busca volta vazia (FB esconde resultados de bot deslogado).
        if (process.env.FB_COOKIES) {
            try {
                const raw = JSON.parse(process.env.FB_COOKIES);
                const arr = Array.isArray(raw) ? raw : (raw.cookies || []);
                const cookies = arr.map((c) => {
                    const ss = String(c.sameSite || '').toLowerCase();
                    const sameSite = ss.includes('strict') ? 'Strict' : (ss.includes('none') || ss.includes('no_restriction')) ? 'None' : 'Lax';
                    return {
                        name: c.name,
                        value: c.value,
                        domain: c.domain || '.facebook.com',
                        path: c.path || '/',
                        httpOnly: !!c.httpOnly,
                        secure: sameSite === 'None' ? true : (c.secure !== false),
                        sameSite,
                    };
                }).filter((c) => c.name && c.value);
                if (cookies.length) {
                    await context.addCookies(cookies);
                    console.log(`[DISCOVERY] sessão FB injetada (${cookies.length} cookies)`);
                }
            } catch (e) {
                console.log('[DISCOVERY] FB_COOKIES inválido (segue deslogado):', e.message);
            }
        }

        // ── PASSO 1: Busca por keyword ──────────────────────────────────────
        const searchPage = await context.newPage();
        searchPage.setDefaultTimeout(30000);

        const searchUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(keyword)}&search_type=keyword_unordered`;

        // ── WARM-UP: visita a home da Biblioteca pra o FB setar cookies (datr/sb)
        // e aceita o banner de consentimento, ANTES de buscar. Sem isso o FB serve
        // a página vazia pro bot (resultados não renderizam). ──────────────────
        try {
            console.log('[DISCOVERY] Warm-up: home da Biblioteca…');
            await searchPage.goto('https://www.facebook.com/ads/library/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await searchPage.waitForTimeout(2500);
            await searchPage.evaluate(() => {
                const els = [...document.querySelectorAll('div[role="button"], button, [aria-label]')];
                const hit = els.find(e => /permitir todos|aceitar todos|allow all|accept all|permitir cookies|aceitar/i.test((e.innerText || '') + ' ' + (e.getAttribute?.('aria-label') || '')));
                if (hit) hit.click();
            }).catch(() => {});
            await searchPage.waitForTimeout(1800);
        } catch (e) {
            console.log('[DISCOVERY] warm-up falhou (segue mesmo assim):', e.message);
        }

        console.log(`[DISCOVERY] Navegando: ${searchUrl}`);
        await searchPage.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});

        // Espera os cards de anunciantes aparecerem (ou o aviso de vazio), sem sleep cego.
        // Anunciante agora = link facebook.com/<id_da_página>/
        await searchPage
            .waitForFunction(
                () => [...document.querySelectorAll('a[href]')].some((a) => /^https?:\/\/(?:www\.|web\.|m\.)?facebook\.com\/\d{5,}\/?(?:[?#]|$)/.test(a.href || '')) ||
                    /nenhum (an[úu]ncio|resultado)|no ads?\b/i.test(document.body?.innerText || ''),
                { timeout: 25000 }
            )
            .catch(() => {});

        // Scroll para carregar mais resultados
        for (let s = 0; s < 4; s++) {
            await searchPage.evaluate(() => window.scrollBy(0, 900));
            await searchPage.waitForTimeout(1200);
        }

        // page_id do próprio usuário logado (pra não capturar o perfil dele)
        let selfId = '';
        try { selfId = (JSON.parse(process.env.FB_COOKIES || '[]').find((c) => c.name === 'c_user') || {}).value || ''; } catch { /* noop */ }

        // ── PASSO 2: Extrai page IDs únicos dos resultados ──────────────────
        // O FB mudou: o link do anunciante agora é facebook.com/<page_id>/
        // (antes era view_all_page_id). Pega esses, ignorando redirects de saída
        // (l.facebook.com), páginas de ajuda e o próprio usuário logado.
        const advertisers = await searchPage.evaluate((selfId) => {
            const seen = new Set();
            const result = [];
            const links = document.querySelectorAll('a[href]');
            links.forEach((link) => {
                const href = link.href || '';
                if (/l\.facebook\.com|\/help\//i.test(href)) return;
                const m = href.match(/^https?:\/\/(?:www\.|web\.|m\.)?facebook\.com\/(\d{5,})\/?(?:[?#]|$)/);
                if (!m) return;
                const pageId = m[1];
                if (!pageId || pageId === selfId || seen.has(pageId)) return;
                seen.add(pageId);

                // nome do anunciante a partir do card pai (se houver)
                const card = link.closest('div[role="article"]') || link.closest('[data-testid]') || link.parentElement;
                const strongEl = card?.querySelector('strong');
                const h2El = card?.querySelector('h2, h3');
                const nameFromLink = (link.textContent || link.getAttribute('aria-label') || '').trim();
                const name = (strongEl?.textContent?.trim() || h2El?.textContent?.trim() || nameFromLink || '').substring(0, 120);

                result.push({ pageId, name: name || `Anunciante ${pageId}` });
            });
            return result;
        }, selfId);

        console.log('[DISCOVERY][PROBE-IDS]', JSON.stringify(advertisers.slice(0, 6)));

        // SONDA: se não achou ninguém, captura o que o FB devolveu (login? bloqueio? vazio?)
        let diag = null;
        if (advertisers.length === 0) {
            diag = await searchPage.evaluate(() => {
                const t = document.title || '';
                const txt = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
                const loginWall = /(entrar no facebook|fazer login|log in to facebook|create new account|você precisa fazer login|entre para ver)/i.test(txt);
                const anyLink = document.querySelectorAll('a[href*="view_all_page_id"]').length;
                const allLinks = document.querySelectorAll('a').length;
                // quantos "resultados/anúncios" o FB diz que achou
                const resultsCount = (txt.match(/~?\s*[\d.\s]+\s*(resultados?|an[úu]ncios?)/i) || [])[0] || null;
                // amostra de hrefs que têm número longo (IDs de página/anúncio) → revela o padrão real
                const hrefs = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(Boolean);
                const digitHrefs = [...new Set(hrefs.filter(h => /\d{6,}/.test(h)))].slice(0, 20);
                // padrões alternativos de link de página/anunciante
                const pat = {
                    view_all_page_id: anyLink,
                    library_id: document.querySelectorAll('a[href*="ads/library/?id="]').length,
                    page_profile: document.querySelectorAll('a[href*="/profile.php?id="]').length,
                    role_article: document.querySelectorAll('div[role="article"]').length,
                };
                return { title: t, loginWall, viewAllLinks: anyLink, totalLinks: allLinks, resultsCount, pat, digitHrefs, sample: txt.slice(0, 250) };
            }).catch((e) => ({ error: e.message }));
        }

        await searchPage.close();

        console.log(`[DISCOVERY] Anunciantes únicos encontrados: ${advertisers.length}`);

        if (advertisers.length === 0) {
            console.log('[DISCOVERY] Nenhum anunciante encontrado para essa keyword.');
            console.log('[DISCOVERY][SONDA]', JSON.stringify(diag));
            await browser.close();
            return { success: true, offers: [], keyword };
        }

        // ── PASSO 3: Verifica cada anunciante contra os filtros ─────────────
        const toProcess = advertisers.slice(0, maxAdvertisers);

        // Contexto LIMPO (deslogado) só pra CONTAR os anúncios de cada página.
        // Logado, o FB não renderiza o "~X resultados" — deslogado funciona
        // (mesmo método do contador de ofertas, que roda 85/85). A busca acima
        // continua usando o contexto LOGADO (`context`).
        const countContext = await createStealthContext(browser);

        for (let i = 0; i < toProcess.length; i++) {
            const { pageId, name } = toProcess[i];
            console.log(`\n[DISCOVERY] [${i + 1}/${toProcess.length}] Verificando: ${name}`);

            const adPage = await countContext.newPage();
            adPage.setDefaultTimeout(30000);

            try {
                const libUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&view_all_page_id=${pageId}`;

                await adPage.goto(libUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                // Espera a contagem (ou aviso de vazio) renderizar
                await adPage
                    .waitForFunction(
                        () => {
                            const t = document.body?.innerText || '';
                            return /[\d.,]+\s*(resultados?|results?|an[úu]ncios?)/i.test(t) ||
                                /nenhum (an[úu]ncio|resultado)|no ads?\b/i.test(t);
                        },
                        { timeout: 15000 }
                    )
                    .catch(() => {});

                // Scroll para garantir carregamento das datas dos anúncios
                await adPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
                await adPage.waitForTimeout(1200);
                await adPage.evaluate(() => window.scrollTo(0, 0));
                await adPage.waitForTimeout(600);

                // Conta os anúncios reusando a função COMPROVADA (a mesma do contador
                // de ofertas, que roda 85/85). A contagem inline anterior voltava 0.
                const _cnt = await scrapeFacebookAdsCount(libUrl, { context: countContext });
                const adCount = (_cnt && typeof _cnt.adCount === 'number') ? _cnt.adCount : null;

                if (i === 0) {
                    const bodyText = await adPage.evaluate(() => document.body.innerText || '').catch(() => '');
                    console.log(`[DISCOVERY][PROBE2] url=${libUrl} | success=${_cnt?.success} | adCount=${adCount} | days=${_cnt?.daysRunning} | inline="${bodyText.replace(/\s+/g, ' ').slice(0, 140)}"`);
                }

                if (adCount === null || adCount < minAdCount) {
                    console.log(`[DISCOVERY] ✗ ${name}: ${adCount ?? 0} ads ativos (mínimo: ${minAdCount})`);
                    await adPage.close();
                    await randomDelay(3000, 6000);
                    continue;
                }

                console.log(`[DISCOVERY] ✓ ${name}: ${adCount} ads — verificando datas...`);

                // Extrai a data do anúncio mais antigo ativo
                const oldestDateStr = await adPage.evaluate(() => {
                    const text = document.body.innerText;
                    const timestamps = [];

                    const monthsPt = {
                        'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
                        'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11,
                        'janeiro': 0, 'fevereiro': 1, 'marco': 2, 'março': 2, 'abril': 3,
                        'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8,
                        'outubro': 9, 'novembro': 10, 'dezembro': 11
                    };

                    // Português: "Iniciado em 15 de jan. de 2024"
                    const ptRegex = /Iniciado em\s+(\d{1,2})\s+de\s+(\w+)\.?\s+de\s+(\d{4})/gi;
                    let m;
                    while ((m = ptRegex.exec(text)) !== null) {
                        const day = parseInt(m[1]);
                        const monthKey = m[2].toLowerCase().replace('.', '').replace('ç', 'c');
                        const year = parseInt(m[3]);
                        const month = monthsPt[monthKey];
                        if (month !== undefined && year >= 2020) {
                            timestamps.push(new Date(year, month, day).getTime());
                        }
                    }

                    // Inglês: "Started running on January 15, 2024"
                    const enRegex = /Started running on\s+(\w+\s+\d{1,2},?\s+\d{4})/gi;
                    while ((m = enRegex.exec(text)) !== null) {
                        const d = new Date(m[1]);
                        if (!isNaN(d.getTime()) && d.getFullYear() >= 2020) {
                            timestamps.push(d.getTime());
                        }
                    }

                    if (timestamps.length === 0) return null;
                    return new Date(Math.min(...timestamps)).toISOString();
                });

                const daysRunning = oldestDateStr
                    ? Math.floor((Date.now() - new Date(oldestDateStr).getTime()) / (1000 * 60 * 60 * 24))
                    : null;

                if (daysRunning !== null && daysRunning < minDaysRunning) {
                    console.log(`[DISCOVERY] ✗ ${name}: apenas ${daysRunning} dia(s) rodando (mínimo: ${minDaysRunning})`);
                    await adPage.close();
                    await randomDelay(3000, 6000);
                    continue;
                }

                // Tenta refinar o nome do anunciante via título da página
                let advertiserName = name;
                if (!advertiserName || advertiserName.startsWith('Anunciante ')) {
                    const pageTitle = await adPage.title();
                    if (pageTitle && !pageTitle.toLowerCase().includes('facebook')) {
                        advertiserName = pageTitle.split(' - ')[0].trim();
                    }
                }

                console.log(`[DISCOVERY] ✅ QUALIFICADO: "${advertiserName}" | ${adCount} ads | ${daysRunning ?? '?'} dias`);

                qualifiedOffers.push({
                    advertiser_name: advertiserName,
                    facebook_page_id: pageId,
                    facebook_link: libUrl,
                    ad_count: adCount,
                    days_running: daysRunning,
                    oldest_ad_date: oldestDateStr
                        ? new Date(oldestDateStr).toISOString().split('T')[0]
                        : null,
                    keyword
                });

            } catch (err) {
                console.log(`[DISCOVERY] Erro ao processar ${pageId}: ${err.message}`);
            } finally {
                await adPage.close().catch(() => {});
            }

            // Delay aleatório entre requests (anti-bloqueio)
            await randomDelay(4000, 9000);
        }

        await browser.close();

        console.log(`\n[DISCOVERY] ========================================`);
        console.log(`[DISCOVERY] Resultado para "${keyword}": ${qualifiedOffers.length} qualificadas`);
        console.log(`[DISCOVERY] ========================================\n`);

        return { success: true, offers: qualifiedOffers, keyword };

    } catch (error) {
        console.error('[DISCOVERY] Erro crítico:', error);
        if (browser) await browser.close().catch(() => {});
        return { success: false, offers: [], keyword, error: error.message };
    }
}

/**
 * Helper: delay aleatório entre min e max ms
 */
function randomDelay(min, max) {
    const ms = Math.floor(min + Math.random() * (max - min));
    console.log(`[DISCOVERY] Aguardando ${(ms / 1000).toFixed(1)}s...`);
    return new Promise(r => setTimeout(r, ms));
}
