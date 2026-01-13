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
        
        // Estratégia 1: Procura especificamente por "~XX resultados" ou "XX resultados" (padrão do Facebook)
        console.log('[SCRAPER] Estratégia 1: Procurando padrão "~XX resultados"...');
        
        // Primeiro, tenta encontrar o padrão específico "~XX resultados" ou "XX resultados"
        const specificPatterns = [
            /~?\s*(\d+)\s+resultados?/i,
            /(\d+)\s+resultados?/i,
            /~?\s*(\d+)\s+anúncios?/i,
            /(\d+)\s+anúncios?\s+ativos?/i
        ];
        
        // Procura em elementos específicos da página do Facebook
        const facebookSelectors = [
            // Área do perfil onde aparece "~42 resultados"
            '[role="main"]',
            'div[class*="x1i10hfl"]', // Classes comuns do Facebook
            'div[class*="x9f619"]',
            'span:has-text("resultado")',
            'span:has-text("anúncio")'
        ];
        
        for (const selector of facebookSelectors) {
            try {
                const elements = await page.locator(selector).all();
                
                for (const element of elements) {
                    const text = await element.textContent().catch(() => '');
                    
                    // Procura pelos padrões específicos
                    for (const pattern of specificPatterns) {
                        const match = text.match(pattern);
                        if (match) {
                            const num = parseInt(match[1], 10);
                            // Valida: não é ano e está em range válido
                            if (num > 0 && num <= 10000 && (num < 2020 || num > 2030)) {
                                // Verifica se o texto contém "resultado" ou "anúncio" (confirma que é o número certo)
                                if (text.toLowerCase().includes('resultado') || 
                                    text.toLowerCase().includes('anúncio') ||
                                    text.toLowerCase().includes('result')) {
                                    adCount = num;
                                    console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios usando padrão: ${pattern}`);
                                    console.log(`[SCRAPER] ✓ Texto completo: "${text.trim()}"`);
                                    break;
                                }
                            }
                        }
                    }
                    if (adCount !== null) break;
                }
                if (adCount !== null) break;
            } catch (e) {
                continue;
            }
        }
        
        // Estratégia 2: Extrai todo o texto visível e procura padrões ESPECÍFICOS
        if (adCount === null) {
            console.log('[SCRAPER] Estratégia 2: Analisando todo o conteúdo da página...');
            const bodyText = await page.evaluate(() => document.body.innerText);
            
            console.log('[SCRAPER] Primeiras 1000 caracteres do texto:', bodyText.substring(0, 1000));
            
            // Padrões MUITO específicos - PRIORIDADE para padrões com "resultado" ou "anúncio"
            const patterns = [
                // Padrões mais específicos primeiro (com ~ ou sem)
                /~?\s*(\d+)\s+resultados?/i,
                /(\d+)\s+resultados?/i,
                /~?\s*(\d+)\s+anúncios?/i,
                /(\d+)\s+anúncios?\s+ativos?/i,
                // Padrões em inglês
                /~?\s*(\d+)\s+results?/i,
                /(\d+)\s+active\s+ads?/i,
                /(\d+)\s+ads?\s+active/i,
                /showing\s+(\d+)\s+results?/i,
            ];
            
            for (const pattern of patterns) {
                const matches = [...bodyText.matchAll(new RegExp(pattern, 'gi'))];
                
                for (const match of matches) {
                    const num = parseInt(match[1], 10);
                    const fullMatch = match[0];
                    
                    // Validações rigorosas:
                    // 1. Não é ano (2020-2030)
                    // 2. Range válido (1-10000)
                    // 3. O match deve conter "resultado", "anúncio" ou "result"
                    if (num > 0 && num <= 10000 && (num < 2020 || num > 2030)) {
                        const lowerMatch = fullMatch.toLowerCase();
                        if (lowerMatch.includes('resultado') || 
                            lowerMatch.includes('anúncio') || 
                            lowerMatch.includes('result') ||
                            lowerMatch.includes('ad')) {
                            adCount = num;
                            console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios usando regex: ${pattern}`);
                            console.log(`[SCRAPER] ✓ Match completo: "${fullMatch}"`);
                            break;
                        }
                    }
                }
                if (adCount !== null) break;
            }
        }
        
        // Estratégia 3: Procura linha por linha (mais preciso)
        if (adCount === null) {
            console.log('[SCRAPER] Estratégia 3: Analisando linha por linha...');
            const bodyText = await page.evaluate(() => document.body.innerText);
            const lines = bodyText.split('\n');
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                // Procura linhas que contenham "resultado" ou "anúncio" mas NÃO anos
                if ((trimmedLine.toLowerCase().includes('resultado') || 
                     trimmedLine.toLowerCase().includes('anúncio') ||
                     trimmedLine.toLowerCase().includes('result')) &&
                    !trimmedLine.match(/20\d{2}/)) {
                    
                    const match = trimmedLine.match(/~?\s*(\d+)/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > 0 && num <= 10000 && (num < 2020 || num > 2030)) {
                            adCount = num;
                            console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios na linha: "${trimmedLine}"`);
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
