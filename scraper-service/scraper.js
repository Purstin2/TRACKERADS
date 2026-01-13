import { chromium } from 'playwright';

/**
 * Extrai o número de anúncios ativos da Biblioteca de Anúncios do Facebook
 * @param {string} facebookAdsLibraryUrl - URL da biblioteca de anúncios
 * @returns {Promise<{success: boolean, adCount: number|null, error: string|null}>}
 */
export async function scrapeFacebookAdsCount(facebookAdsLibraryUrl) {
    let browser;
    
    try {
        console.log(`[SCRAPER] Iniciando scraping para: ${facebookAdsLibraryUrl}`);
        
        // Lança o navegador (headless para rodar em background)
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        const page = await context.newPage();
        
        // Define timeout maior para páginas do Facebook
        page.setDefaultTimeout(30000);
        
        console.log('[SCRAPER] Navegando para a página...');
        await page.goto(facebookAdsLibraryUrl, {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        // Aguarda a página carregar completamente
        console.log('[SCRAPER] Aguardando página carregar...');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(5000); // Aguarda 5 segundos extras
        
        // Tenta encontrar o número de anúncios com múltiplos seletores
        let adCount = null;
        
        // Estratégia 1: Procura por elementos específicos do Facebook Ads Library
        console.log('[SCRAPER] Estratégia 1: Procurando elementos específicos...');
        const facebookSelectors = [
            // Seletores específicos do Facebook Ads Library
            '[role="main"] span:has-text("result")',
            '[role="main"] div:has-text("active ad")',
            'div[class*="x9f619"] span',
            'span:has-text("See all")',
            // Texto que contém números seguidos de "results", "ads", etc
            'text=/\\d+\\s+(active\\s+)?ad/i',
            'text=/\\d+\\s+result/i',
            'text=/\\d+\\s+anúncio/i',
            'text=/\\d+\\s+resultado/i'
        ];
        
        for (const selector of facebookSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 3000 }).catch(() => null);
                const elements = await page.locator(selector).all();
                
                for (const element of elements) {
                    const text = await element.textContent().catch(() => '');
                    const match = text.match(/(\d+)/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > 0) {
                            adCount = num;
                            console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios usando seletor: ${selector}`);
                            console.log(`[SCRAPER] ✓ Texto encontrado: "${text}"`);
                            break;
                        }
                    }
                }
                if (adCount !== null) break;
            } catch (e) {
                // Continua tentando outros seletores
                continue;
            }
        }
        
        // Estratégia 2: Extrai todo o texto visível e procura padrões
        if (adCount === null) {
            console.log('[SCRAPER] Estratégia 2: Analisando todo o conteúdo da página...');
            const bodyText = await page.evaluate(() => document.body.innerText);
            
            console.log('[SCRAPER] Primeiras 500 caracteres do texto:', bodyText.substring(0, 500));
            
            // Padrões MUITO específicos (ordem importa - do mais específico ao menos)
            const patterns = [
                /(\d+)\s+active\s+ads?/i,
                /(\d+)\s+ads?\s+active/i,
                /(\d+)\s+anúncios?\s+ativos?/i,
                /(\d+)\s+resultados?/i,
                /(\d+)\s+results?\s+found/i,
                /showing\s+(\d+)\s+results?/i,
                /(\d+)\s+results?\s+in/i,
                /(\d+)\s+results?$/im, // No final da linha
            ];
            
            for (const pattern of patterns) {
                const match = bodyText.match(pattern);
                if (match) {
                    const num = parseInt(match[1], 10);
                    // Validações:
                    // - Número entre 0 e 10000 (anúncios normalmente não passam disso)
                    // - Não é um ano (2020-2030)
                    if (num >= 0 && num <= 10000 && (num < 2020 || num > 2030)) {
                        adCount = num;
                        console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios usando regex: ${pattern}`);
                        console.log(`[SCRAPER] ✓ Match completo: "${match[0]}"`);
                        break;
                    } else {
                        console.log(`[SCRAPER] ⚠️  Número ${num} rejeitado (parece ser ano ou número inválido)`);
                    }
                }
            }
        }
        
        // Estratégia 3: Se ainda não achou, procura especificamente por padrão "XX results"
        if (adCount === null) {
            console.log('[SCRAPER] Estratégia 3: Procurando padrão específico do Facebook...');
            // Procura especificamente por linhas que contenham "result" mas não "2026"
            const lines = bodyText.split('\n');
            for (const line of lines) {
                if (line.match(/results?/i) && !line.match(/20\d{2}/)) {
                    const match = line.match(/(\d+)/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > 0 && num <= 10000) {
                            adCount = num;
                            console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios na linha: "${line.trim()}"`);
                            break;
                        }
                    }
                }
            }
        }
        
        // Tira um screenshot para debug (opcional)
        await page.screenshot({ 
            path: `./scraper-service/screenshots/debug-${Date.now()}.png`,
            fullPage: false 
        });
        
        await browser.close();
        
        if (adCount !== null) {
            console.log(`[SCRAPER] ✅ Scraping concluído com sucesso! Anúncios encontrados: ${adCount}`);
            return { success: true, adCount, error: null };
        } else {
            console.log('[SCRAPER] ⚠️  Não foi possível encontrar o número de anúncios');
            return { 
                success: false, 
                adCount: null, 
                error: 'Não foi possível extrair o número de anúncios da página' 
            };
        }
        
    } catch (error) {
        console.error('[SCRAPER] ❌ Erro durante o scraping:', error);
        if (browser) {
            await browser.close();
        }
        return { 
            success: false, 
            adCount: null, 
            error: error.message 
        };
    }
}

/**
 * Versão simplificada que tenta extrair diretamente do HTML
 * Útil como fallback
 */
export async function scrapeFacebookAdsCountSimple(facebookAdsLibraryUrl) {
    let browser;
    
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        await page.goto(facebookAdsLibraryUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 20000 
        });
        
        await page.waitForTimeout(5000);
        
        // Executa JavaScript diretamente na página para pegar o número
        const adCount = await page.evaluate(() => {
            // Procura por elementos que contenham números de resultados
            const bodyText = document.body.innerText;
            const match = bodyText.match(/(\d+)\s+(resultados|anúncios|results?)/i);
            return match ? parseInt(match[1], 10) : null;
        });
        
        await browser.close();
        
        if (adCount !== null) {
            return { success: true, adCount, error: null };
        } else {
            return { 
                success: false, 
                adCount: null, 
                error: 'Não foi possível extrair o número de anúncios' 
            };
        }
        
    } catch (error) {
        if (browser) await browser.close();
        return { success: false, adCount: null, error: error.message };
    }
}
