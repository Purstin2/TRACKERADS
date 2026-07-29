import { chromium } from 'playwright';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MOTOR DE SCRAPING — Biblioteca de Anúncios do Facebook
 * ════════════════════════════════════════════════════════════════════════════
 *  Objetivo: extrair com PRECISÃO a quantidade de anúncios ativos + sinais de
 *  vitalidade (oferta morta? há quantos dias roda?) para classificar se a
 *  oferta está escalando ou já morreu.
 *
 *  Melhorias-chave em relação à versão anterior:
 *   • Detecta explicitamente oferta MORTA (0 anúncios) — antes virava "erro".
 *   • Espera inteligente (waitForFunction) em vez de sleep fixo → +rápido e +confiável.
 *   • Bloqueia imagens/vídeo/fontes → carregamento muito mais rápido.
 *   • Reuso de navegador/contexto (passar { context }) para jobs em lote.
 *   • Extração unificada e robusta, sem falsos positivos do "ad" solto.
 *   • Captura data do anúncio mais antigo + dias rodando.
 * ════════════════════════════════════════════════════════════════════════════
 */

const DEFAULT_NAV_TIMEOUT = 30000;   // navegação
const CONTENT_WAIT_TIMEOUT = 20000;  // espera o conteúdo dinâmico do FB aparecer

// ─── Stealth / performance ────────────────────────────────────────────────────
const LAUNCH_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check'
];

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Cria um navegador com configuração otimizada. Reaproveite em jobs em lote.
 */
export async function createBrowser() {
    return chromium.launch({ headless: true, args: LAUNCH_ARGS });
}

/**
 * Cria um contexto "stealth" pt-BR com bloqueio de recursos pesados.
 * Bloqueia imagem/vídeo/fonte (não precisamos delas para ler o texto) — isso
 * derruba drasticamente o tempo de carregamento da página do Facebook.
 */
export async function createStealthContext(browser) {
    const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        viewport: { width: 1366, height: 900 },
        extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' }
    });

    // Mascarar sinais de automação
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'language', { get: () => 'pt-BR' });
        Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en'] });
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Bloqueia recursos que não ajudam na extração de texto (ganho de velocidade)
    await context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (type === 'image' || type === 'media' || type === 'font') {
            return route.abort();
        }
        return route.continue();
    });

    return context;
}

// ─── Extração de número (lado Node) ─────────────────────────────────────────────

function parseIntWithSeparators(str) {
    return parseInt(String(str).replace(/[.,\s ]/g, ''), 10);
}

/**
 * Analisa o texto da página e retorna { adCount, isDead }.
 *  - isDead = true  → o Facebook explicitamente diz que não há anúncios ativos.
 *  - adCount = 0    → oferta morta (acompanha isDead).
 *  - adCount = N>0  → anúncios ativos encontrados.
 *  - adCount = null → não foi possível determinar (não confundir com morta!).
 */
export function extractAdData(bodyText) {
    if (!bodyText) return { adCount: null, isDead: false };
    const text = bodyText.replace(/ /g, ' ');

    // 1) OFERTA MORTA / ZERO — detecção explícita (CRÍTICO p/ saber se morreu)
    const deadPatterns = [
        /\b0\s+resultados?\b/i,
        /\b0\s+results?\b/i,
        /\b0\s+an[úu]ncios?\b/i,
        /nenhum\s+an[úu]ncio/i,
        /nenhum\s+resultado/i,
        /n[ãa]o\s+encontramos\s+(?:nenhum\s+)?an[úu]ncio/i,
        /n[ãa]o\s+h[áa]\s+an[úu]ncios?/i,
        /no\s+ads?\s+(?:found|match|to\s+show)/i,
        /no\s+results?\s+found/i
    ];
    for (const p of deadPatterns) {
        if (p.test(text)) return { adCount: 0, isDead: true };
    }

    // 2) CONTAGEM POSITIVA — padrões adjacentes à palavra-chave (mais específico → genérico).
    //    Não usamos "ad" solto (evita casar "download", "carregando", etc.).
    const patterns = [
        /mostrando\s+~?\s*([\d.,]{1,9})\s+resultados?/i,
        /~?\s*([\d.,]{1,9})\s+resultados?/i,
        /~?\s*([\d.,]{1,9})\s+results?/i,
        /([\d.,]{1,9})\s+an[úu]ncios?\s+ativos?/i,
        /~?\s*([\d.,]{1,9})\s+an[úu]ncios?/i,
        /([\d.,]{1,9})\s+active\s+ads?\b/i,
        /약?\s*([\d.,]{1,9})\s*개?\s*결과/i,   // coreano
        /約?\s*([\d.,]{1,9})\s*條?\s*結果/i    // chinês
    ];

    for (const p of patterns) {
        const m = text.match(p);
        if (m) {
            const n = parseIntWithSeparators(m[1]);
            if (Number.isFinite(n) && n >= 1 && n <= 2000000) {
                return { adCount: n, isDead: false };
            }
        }
    }

    return { adCount: null, isDead: false };
}

// ─── Extração de data do anúncio mais antigo (sinal de vitalidade) ──────────────

/**
 * Roda dentro da página. Encontra a data do anúncio ativo mais antigo,
 * que indica há quanto tempo a oferta está no ar.
 */
function inPageOldestAdDate() {
    const text = document.body.innerText || '';
    const timestamps = [];

    const monthsPt = {
        jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
        jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
        janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
        julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11
    };

    // PT: "Iniciado em 15 de jan. de 2024" / "Veiculação iniciada em 15 de jan de 2024"
    const ptRegex = /(?:iniciad[oa] em|come[çc]ou em)\s+(\d{1,2})\s+de\s+([a-zç]+)\.?\s+de\s+(\d{4})/gi;
    let m;
    while ((m = ptRegex.exec(text)) !== null) {
        const day = parseInt(m[1], 10);
        const monthKey = m[2].toLowerCase().replace('.', '').replace('ç', 'c');
        const year = parseInt(m[3], 10);
        const month = monthsPt[monthKey];
        if (month !== undefined && year >= 2018) {
            timestamps.push(new Date(year, month, day).getTime());
        }
    }

    // EN: "Started running on January 15, 2024"
    const enRegex = /started running on\s+([a-z]+\s+\d{1,2},?\s+\d{4})/gi;
    while ((m = enRegex.exec(text)) !== null) {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2018) {
            timestamps.push(d.getTime());
        }
    }

    if (timestamps.length === 0) return null;
    return new Date(Math.min(...timestamps)).toISOString();
}

// ─── URL ────────────────────────────────────────────────────────────────────

/**
 * Garante que a URL da biblioteca tenha os parâmetros que estabilizam o resultado.
 * Não destrói parâmetros existentes do usuário.
 */
export function normalizeAdsLibraryUrl(url) {
    try {
        const u = new URL(url);
        if (!u.searchParams.has('active_status')) u.searchParams.set('active_status', 'active');
        if (!u.searchParams.has('ad_type')) u.searchParams.set('ad_type', 'all');
        if (!u.searchParams.has('media_type')) u.searchParams.set('media_type', 'all');
        return u.toString();
    } catch {
        return url;
    }
}

// ─── Core: extrai a partir de uma page já criada ────────────────────────────────

/**
 * Faz o scraping usando uma `page` do Playwright já existente.
 * Espera o conteúdo dinâmico aparecer (sem sleeps cegos) e extrai os dados.
 *
 * @returns {Promise<{success, adCount, isDead, oldestAdDate, daysRunning, error}>}
 */
async function scrapePage(page, url) {
    page.setDefaultTimeout(DEFAULT_NAV_TIMEOUT);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: DEFAULT_NAV_TIMEOUT });

    // Espera INTELIGENTE: resolve assim que aparece a contagem OU o aviso de "sem anúncios".
    // Em vez de dormir 5s sempre, retorna no instante em que o dado existe.
    await page
        .waitForFunction(
            () => {
                const t = document.body ? document.body.innerText || '' : '';
                const hasCount = /[\d.,]+\s*(resultados?|results?|an[úu]ncios?)/i.test(t);
                const isEmpty =
                    /nenhum (an[úu]ncio|resultado)|n[ãa]o encontramos|no ads?\b|\b0\s+(resultados?|results?|an[úu]ncios?)/i.test(t);
                return hasCount || isEmpty;
            },
            { timeout: CONTENT_WAIT_TIMEOUT }
        )
        .catch(() => {
            // Se estourar o timeout, seguimos com o que houver carregado.
        });

    // 1ª leitura
    let bodyText = await page.evaluate(() => document.body.innerText || '');
    let data = extractAdData(bodyText);

    // Se não achou nada (nem morta, nem contagem), faz 1 scroll e tenta de novo —
    // às vezes o header de contagem só renderiza após interação.
    if (data.adCount === null && !data.isDead) {
        await page.evaluate(() => window.scrollTo(0, Math.floor(document.body.scrollHeight / 3)));
        await page.waitForTimeout(1200);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(600);
        bodyText = await page.evaluate(() => document.body.innerText || '');
        data = extractAdData(bodyText);
    }

    // Data do anúncio mais antigo (best-effort, não bloqueia o resultado principal)
    let oldestAdDate = null;
    let daysRunning = null;
    try {
        oldestAdDate = await page.evaluate(inPageOldestAdDate);
        if (oldestAdDate) {
            daysRunning = Math.floor((Date.now() - new Date(oldestAdDate).getTime()) / 86400000);
        }
    } catch {
        /* ignora */
    }

    if (data.adCount !== null) {
        return {
            success: true,
            adCount: data.adCount,
            isDead: data.isDead,
            oldestAdDate,
            daysRunning,
            error: null
        };
    }

    return {
        success: false,
        adCount: null,
        isDead: false,
        oldestAdDate,
        daysRunning,
        error: 'Não foi possível extrair o número de anúncios da página'
    };
}

// ─── API pública (compatível com a versão antiga) ──────────────────────────────

/**
 * Extrai o número de anúncios ativos da Biblioteca de Anúncios do Facebook.
 *
 * @param {string} facebookAdsLibraryUrl - URL da biblioteca de anúncios
 * @param {Object} [options]
 * @param {import('playwright').BrowserContext} [options.context] - reaproveita um
 *        contexto já criado (jobs em lote). Se omitido, abre/fecha o próprio navegador.
 * @returns {Promise<{success, adCount, isDead, oldestAdDate, daysRunning, error}>}
 */
export async function scrapeFacebookAdsCount(facebookAdsLibraryUrl, options = {}) {
    const url = normalizeAdsLibraryUrl(facebookAdsLibraryUrl);
    const sharedContext = options.context || null;

    let browser = null;
    let context = sharedContext;
    let page = null;
    const startTime = Date.now();

    try {
        console.log(`[SCRAPER] ▶ ${url}`);

        if (!context) {
            browser = await createBrowser();
            context = await createStealthContext(browser);
        }

        page = await context.newPage();
        const result = await scrapePage(page, url);

        const secs = ((Date.now() - startTime) / 1000).toFixed(1);
        if (result.success) {
            console.log(
                `[SCRAPER] ✅ ${result.isDead ? 'MORTA (0 ads)' : result.adCount + ' ads'}` +
                    `${result.daysRunning != null ? ` | rodando há ${result.daysRunning}d` : ''} (${secs}s)`
            );
        } else {
            console.log(`[SCRAPER] ⚠️  Sem contagem (${secs}s): ${result.error}`);
        }
        return result;
    } catch (error) {
        console.error('[SCRAPER] ❌ Erro:', error.message);
        return {
            success: false,
            adCount: null,
            isDead: false,
            oldestAdDate: null,
            daysRunning: null,
            error: error.message
        };
    } finally {
        if (page) await page.close().catch(() => {});
        // Só fecha o navegador se nós criamos (não fechar o contexto compartilhado)
        if (browser) await browser.close().catch(() => {});
    }
}

/**
 * Versão simplificada/fallback. Mantida por compatibilidade — agora também
 * detecta oferta morta e usa a mesma extração robusta.
 */
export async function scrapeFacebookAdsCountSimple(facebookAdsLibraryUrl, options = {}) {
    const url = normalizeAdsLibraryUrl(facebookAdsLibraryUrl);
    const sharedContext = options.context || null;

    let browser = null;
    let context = sharedContext;
    let page = null;

    try {
        if (!context) {
            browser = await createBrowser();
            context = await createStealthContext(browser);
        }
        page = await context.newPage();
        page.setDefaultTimeout(DEFAULT_NAV_TIMEOUT);

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: DEFAULT_NAV_TIMEOUT });
        await page
            .waitForFunction(
                () => {
                    const t = document.body ? document.body.innerText || '' : '';
                    return /[\d.,]+\s*(resultados?|results?|an[úu]ncios?)/i.test(t) ||
                        /nenhum (an[úu]ncio|resultado)|no ads?\b|\b0\s+(resultados?|results?)/i.test(t);
                },
                { timeout: 12000 }
            )
            .catch(() => {});

        const bodyText = await page.evaluate(() => document.body.innerText || '');
        const data = extractAdData(bodyText);

        if (data.adCount !== null) {
            return { success: true, adCount: data.adCount, isDead: data.isDead, error: null };
        }
        return { success: false, adCount: null, isDead: false, error: 'Não foi possível extrair o número de anúncios' };
    } catch (error) {
        return { success: false, adCount: null, isDead: false, error: error.message };
    } finally {
        if (page) await page.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
    }
}

// ── NOMES REAIS DA PÁGINA ────────────────────────────────────────────────────
// Entra no link da Biblioteca e lê o nome real da Página (autocontido; usa chromium).
async function extractNameFromLoadedPage(page) {
    return page.evaluate(() => {
        const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const BAD = ['biblioteca', 'ad library', 'library', 'facebook', 'instagram', 'meta ', 'privacidade',
            'privacy', 'cookies', 'termos', 'terms', 'selecionar', 'localizacao', 'location', 'entrar',
            'log in', 'sair', 'categoria', 'category', 'relatorio', 'report', 'sobre anuncios', 'about ads',
            ' api ', 'resultados', 'results', 'ver detalhes', 'see details', 'saiba mais', 'learn more',
            'foto do perfil', 'profile picture', 'conteudo de marca', 'branded content', 'status do sistema',
            'system status', 'patrocinado', 'sponsored', 'transparencia da pagina', 'page transparency',
            'assinar para receber', 'subscribe', 'atualizacoes por email', 'email updates', 'inscreva',
            'perguntas frequentes', 'faq', 'central de ajuda', 'help center', 'configuracoes', 'settings'];
        const looksUrl = (s) => /https?:|www\.|\.(com|br|net|org|io|co|app|shop|online|site|me|xyz)\b|\//i.test(s);
        const isName = (s) => {
            const c = clean(s);
            if (c.length < 2 || c.length > 60) return false;
            if (/^[\d\W]+$/.test(c)) return false;
            if (looksUrl(c)) return false;
            const n = ' ' + norm(c) + ' ';
            if (BAD.some((b) => n.includes(b))) return false;
            return true;
        };
        const links = [...document.querySelectorAll('a[href*="facebook.com/"]')].map((a) => clean(a.innerText)).filter(isName);
        const alts = [...document.querySelectorAll('img[alt]')].map((i) => clean(i.getAttribute('alt'))).filter(isName);
        const heads = [...document.querySelectorAll('[role="heading"],h1,h2')].map((e) => clean(e.innerText)).filter(isName);
        const freq = {};
        [...links, ...alts, ...alts, ...heads].forEach((s) => { freq[s] = (freq[s] || 0) + 1; });
        const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
        return sorted.length ? sorted[0][0] : null;
    });
}

function nameContext() {
    return {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    };
}

/** Lê o nome real da Página de UM link da Biblioteca de Anúncios. */
export async function scrapePageName(url) {
    let browser;
    try {
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const ctx = await browser.newContext(nameContext());
        const page = await ctx.newPage();
        page.setDefaultTimeout(30000);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(6000);
        const name = await extractNameFromLoadedPage(page);
        await browser.close();
        return { success: !!name, name: name || null, error: name ? null : 'nome nao encontrado' };
    } catch (error) {
        if (browser) await browser.close().catch(() => {});
        return { success: false, name: null, error: error.message };
    }
}

/** Lê o nome real de VÁRIOS links reusando um único browser. items = [{id, url}]. */
export async function scrapePageNames(items, onName) {
    const results = [];
    let browser;
    try {
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const ctx = await browser.newContext(nameContext());
        for (const it of items) {
            const page = await ctx.newPage();
            page.setDefaultTimeout(30000);
            try {
                await page.goto(it.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(5000);
                const name = await extractNameFromLoadedPage(page);
                results.push({ id: it.id, name: name || null });
                console.log(`[NAMES] ${it.id} => ${name || '(nada)'}`);
                if (name && typeof onName === 'function') {
                    try { await onName(it.id, name); } catch (e) { console.error('[NAMES] update falhou:', e.message); }
                }
            } catch (e) {
                results.push({ id: it.id, name: null, error: e.message });
            } finally {
                await page.close().catch(() => {});
            }
        }
        await browser.close();
    } catch (error) {
        if (browser) await browser.close().catch(() => {});
    }
    return results;
}
