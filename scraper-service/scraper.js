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
        
        // Aguarda um pouco para garantir que a página carregou
        await page.waitForTimeout(3000);
        
        // Tenta encontrar o número de anúncios com múltiplos seletores
        let adCount = null;
        
        // Estratégia 1: Procura por texto que contém "resultados" ou "anúncios"
        const possibleSelectors = [
            'text=/\\d+\\s+(resultados|resultado|anúncios|anúncio)/i',
            '[data-testid*="result"] >> text=/\\d+/',
            'div:has-text("resultados") >> text=/\\d+/',
            'text=/^\\d+\\s+result/i',
            'span:has-text("result") >> text=/\\d+/'
        ];
        
        for (const selector of possibleSelectors) {
            try {
                const element = await page.locator(selector).first();
                if (await element.isVisible({ timeout: 5000 })) {
                    const text = await element.textContent();
                    const match = text.match(/(\d+)/);
                    if (match) {
                        adCount = parseInt(match[1], 10);
                        console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios usando seletor: ${selector}`);
                        break;
                    }
                }
            } catch (e) {
                // Continua tentando outros seletores
                continue;
            }
        }
        
        // Estratégia 2: Se não encontrou, tenta extrair do conteúdo da página inteira
        if (adCount === null) {
            console.log('[SCRAPER] Tentando estratégia alternativa...');
            const bodyText = await page.textContent('body');
            
            // Procura por padrões como "42 resultados", "42 anúncios", "42 results"
            const patterns = [
                /(\d+)\s+(resultados|resultado)/i,
                /(\d+)\s+(anúncios|anúncio)/i,
                /(\d+)\s+results?/i
            ];
            
            for (const pattern of patterns) {
                const match = bodyText.match(pattern);
                if (match) {
                    adCount = parseInt(match[1], 10);
                    console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios usando padrão regex`);
                    break;
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
