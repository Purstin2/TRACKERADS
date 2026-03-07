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
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'pt-BR', // Força português
            timezoneId: 'America/Sao_Paulo'
        });
        
        // Força idioma português no navegador
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'language', { get: () => 'pt-BR' });
            Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en'] });
        });
        
        const page = await context.newPage();
        
        // Define timeout maior para páginas do Facebook
        page.setDefaultTimeout(30000);
        
        console.log('[SCRAPER] Navegando para a página...');
        await page.goto(facebookAdsLibraryUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        // Aguarda a página carregar completamente
        console.log('[SCRAPER] Aguardando página carregar...');
        await page.waitForTimeout(5000); // Aguarda 5 segundos para conteúdo dinâmico
        
        // Tenta esperar por elementos específicos do Facebook
        try {
            await page.waitForSelector('[role="main"]', { timeout: 15000 });
            console.log('[SCRAPER] ✓ Elemento principal encontrado');
        } catch (e) {
            console.log('[SCRAPER] ⚠️  Elemento principal não encontrado, continuando...');
        }
        
        // Aguarda mais um pouco para conteúdo dinâmico carregar
        await page.waitForTimeout(2000);
        
        // Tenta rolar a página para garantir que o conteúdo carregou
        try {
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight / 2);
            });
            await page.waitForTimeout(1000);
            await page.evaluate(() => {
                window.scrollTo(0, 0);
            });
            await page.waitForTimeout(1000);
        } catch (e) {
            console.log('[SCRAPER] ⚠️  Erro ao rolar página:', e.message);
        }
        
        // Tenta encontrar o número de anúncios com múltiplos seletores
        let adCount = null;
        
        // Estratégia 0: Procura por elementos específicos do Facebook que mostram o número
        console.log('[SCRAPER] Estratégia 0: Buscando elementos específicos do Facebook...');
        try {
            adCount = await page.evaluate(() => {
                // Procura por elementos com aria-label ou texto que contenha números de resultados
                const selectors = [
                    '[aria-label*="resultado"]',
                    '[aria-label*="result"]',
                    '[aria-label*="anúncio"]',
                    '[aria-label*="ad"]',
                    'span[dir="auto"]',
                    'div[role="status"]',
                    'div[role="alert"]'
                ];
                
                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        const text = el.textContent || el.innerText || el.getAttribute('aria-label') || '';
                        // Procura por padrões como "110 resultados", "~110 resultados", etc.
                        const match = text.match(/(?:~|约)?\s*([\d.,]+)\s*(?:resultados?|results?|anúncios?|ads?)/i);
                        if (match) {
                            const numStr = match[1].replace(/[.,]/g, '');
                            const num = parseInt(numStr, 10);
                            if (num > 0 && num <= 1000000 && (num < 2020 || num > 2030)) {
                                return num;
                            }
                        }
                    }
                }
                return null;
            });
            
            if (adCount !== null) {
                console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios usando elementos específicos do Facebook`);
            } else {
                console.log('[SCRAPER] ⚠️  Estratégia 0 não encontrou número');
            }
        } catch (e) {
            console.log('[SCRAPER] ⚠️  Erro na estratégia 0:', e.message);
        }
        
        // Estratégia 1: Usa JavaScript direto no DOM para encontrar o número
        if (adCount === null) {
            console.log('[SCRAPER] Estratégia 1: Buscando no DOM com JavaScript...');
            
            adCount = await page.evaluate(() => {
            // Função para encontrar número de resultados (FUNCIONA EM QUALQUER IDIOMA!)
            function findAdCount() {
                const bodyText = document.body.innerText || document.body.textContent || '';
                
                // Padrões específicos em MÚLTIPLOS IDIOMAS
                // IMPORTANTE: Suporta números com separadores (1.100, 1,100) e números grandes
                const patterns = [
                    // Português - com separadores de milhar (mais específicos primeiro)
                    /~?\s*([\d.,]+)\s+resultados?/i,
                    /([\d.,]+)\s+resultados?/i,
                    /~?\s*([\d.,]+)\s+anúncios?/i,
                    /([\d.,]+)\s+anúncios?\s+ativos?/i,
                    /mostrando\s+([\d.,]+)\s+resultados?/i,
                    /([\d.,]+)\s+anúncios?\s+encontrados?/i,
                    // Inglês - com separadores
                    /~?\s*([\d.,]+)\s+results?/i,
                    /([\d.,]+)\s+results?/i,
                    /([\d.,]+)\s+active\s+ads?/i,
                    /([\d.,]+)\s+ads?\s+active/i,
                    /showing\s+([\d.,]+)\s+results?/i,
                    /([\d.,]+)\s+ads?/i,
                    // Chinês (约 = aproximadamente, 条 = unidade, 结果 = resultado)
                    /约?\s*([\d.,]+)\s*条\s*结果/i,
                    /([\d.,]+)\s*条\s*结果/i,
                    /约\s*([\d.,]+)/i,
                    // Espanhol
                    /~?\s*([\d.,]+)\s+resultados?/i,
                    /mostrando\s+([\d.,]+)\s+resultados?/i,
                    // Francês
                    /~?\s*([\d.,]+)\s+résultats?/i,
                    /affichage\s+de\s+([\d.,]+)\s+résultats?/i,
                    // Alemão
                    /~?\s*([\d.,]+)\s+ergebnisse?/i,
                    // Padrões mais genéricos (últimos)
                    /~?\s*([\d.,]+)\s+\w+/i,
                    // Procura apenas números grandes próximos de palavras-chave
                    /\b([\d.,]{1,7})\b(?=.*(?:resultado|result|anúncio|ad|结果|条))/i
                ];
                
                // Função para converter número com separadores para inteiro
                function parseNumberWithSeparators(str) {
                    // Remove pontos e vírgulas (separadores de milhar)
                    const cleaned = str.replace(/[.,]/g, '');
                    return parseInt(cleaned, 10);
                }
                
                // Procura em todo o texto
                for (const pattern of patterns) {
                    try {
                        const matches = bodyText.matchAll(new RegExp(pattern, 'gi'));
                        for (const match of matches) {
                            const numStr = match[1];
                            const num = parseNumberWithSeparators(numStr);
                            const fullMatch = match[0].toLowerCase();
                            
                            // Validações: suporta até 1 milhão de anúncios
                            if (num > 0 && num <= 1000000 && (num < 2020 || num > 2030)) {
                                // Para padrões mais genéricos, verifica se há palavras-chave próximas
                                if (pattern.source.includes('\\w+') || pattern.source.includes('\\b')) {
                                    // Procura contexto ao redor do número
                                    const matchIndex = bodyText.toLowerCase().indexOf(fullMatch);
                                    const contextStart = Math.max(0, matchIndex - 50);
                                    const contextEnd = Math.min(bodyText.length, matchIndex + fullMatch.length + 50);
                                    const context = bodyText.substring(contextStart, contextEnd).toLowerCase();
                                    
                                    if (context.includes('resultado') || 
                                        context.includes('anúncio') || 
                                        context.includes('result') ||
                                        context.includes('ad') ||
                                        context.includes('结果') ||
                                        context.includes('条')) {
                                        return num;
                                    }
                                } else {
                                    // Para padrões específicos, confia no match
                                    if (fullMatch.includes('resultado') || 
                                        fullMatch.includes('anúncio') || 
                                        fullMatch.includes('result') ||
                                        fullMatch.includes('ad') ||
                                        fullMatch.includes('结果') ||
                                        fullMatch.includes('条')) {
                                        return num;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Ignora erros de regex e continua
                        continue;
                    }
                }
                
                // Procura linha por linha (FUNCIONA EM QUALQUER IDIOMA)
                const lines = bodyText.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    // Procura por palavras-chave em múltiplos idiomas
                    const hasResultKeyword = 
                        trimmed.toLowerCase().includes('resultado') || 
                        trimmed.toLowerCase().includes('anúncio') ||
                        trimmed.toLowerCase().includes('result') ||
                        trimmed.toLowerCase().includes('ad') ||
                        trimmed.includes('结果') || // Chinês: resultado
                        trimmed.includes('条') || // Chinês: unidade
                        trimmed.includes('约'); // Chinês: aproximadamente
                    
                    if (hasResultKeyword && !trimmed.match(/20\d{2}/)) {
                        // Procura número com ou sem ~ ou 约, suporta separadores
                        const match = trimmed.match(/(?:~|约)?\s*([\d.,]+)/);
                        if (match) {
                            const numStr = match[1].replace(/[.,]/g, '');
                            const num = parseInt(numStr, 10);
                            if (num > 0 && num <= 1000000 && (num < 2020 || num > 2030)) {
                                return num;
                            }
                        }
                    }
                }
                
                return null;
            }
            
            return findAdCount();
        });
            
            if (adCount !== null) {
                console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios usando JavaScript no DOM`);
            } else {
                console.log('[SCRAPER] ⚠️  Estratégia 1 não encontrou número');
            }
        }
        
        // Estratégia 2: Extrai todo o texto visível e procura padrões ESPECÍFICOS
        if (adCount === null) {
            console.log('[SCRAPER] Estratégia 2: Analisando todo o conteúdo da página...');
            const bodyText = await page.evaluate(() => document.body.innerText);
            
            console.log('[SCRAPER] DEBUG - Tamanho total do texto:', bodyText.length, 'caracteres');
            console.log('[SCRAPER] DEBUG - Primeiras 2000 caracteres do texto:');
            console.log(bodyText.substring(0, 2000));
            
            // Procura especificamente por linhas que contenham números próximos de "resultado"
            console.log('[SCRAPER] DEBUG - Procurando linhas com "resultado"...');
            const lines = bodyText.split('\n');
            const relevantLines = lines.filter(line => 
                line.toLowerCase().includes('resultado') || 
                line.toLowerCase().includes('anúncio') ||
                line.toLowerCase().includes('result')
            );
            console.log(`[SCRAPER] DEBUG - Encontradas ${relevantLines.length} linhas relevantes:`);
            relevantLines.slice(0, 10).forEach((line, i) => {
                console.log(`[SCRAPER] DEBUG - Linha ${i + 1}: "${line.trim()}"`);
            });
            
            // Padrões MUITO específicos - MÚLTIPLOS IDIOMAS
            // IMPORTANTE: Suporta números com separadores (1.100, 1,100)
            const patterns = [
                // Português - com separadores
                /~?\s*([\d.,]+)\s+resultados?/i,
                /([\d.,]+)\s+resultados?/i,
                /~?\s*([\d.,]+)\s+anúncios?/i,
                /([\d.,]+)\s+anúncios?\s+ativos?/i,
                /mostrando\s+([\d.,]+)\s+resultados?/i,
                /([\d.,]+)\s+anúncios?\s+encontrados?/i,
                // Inglês - com separadores
                /~?\s*([\d.,]+)\s+results?/i,
                /([\d.,]+)\s+results?/i,
                /([\d.,]+)\s+active\s+ads?/i,
                /([\d.,]+)\s+ads?\s+active/i,
                /showing\s+([\d.,]+)\s+results?/i,
                /([\d.,]+)\s+ads?/i,
                // Chinês (约110条结果 = aproximadamente 110 resultados)
                /约?\s*([\d.,]+)\s*条\s*结果/i,
                /([\d.,]+)\s*条\s*结果/i,
                /约\s*([\d.,]+)/i,
                // Padrões genéricos
                /\b([\d.,]{1,7})\b(?=.*(?:resultado|result|anúncio|ad|结果|条))/i
            ];
            
            // Função para converter número com separadores
            function parseNumberWithSeparators(str) {
                return parseInt(str.replace(/[.,]/g, ''), 10);
            }
            
            for (const pattern of patterns) {
                try {
                    const matches = [...bodyText.matchAll(new RegExp(pattern, 'gi'))];
                    
                    for (const match of matches) {
                        const numStr = match[1];
                        const num = parseNumberWithSeparators(numStr);
                        const fullMatch = match[0];
                        
                        // Validações rigorosas:
                        // 1. Não é ano (2020-2030)
                        // 2. Range válido (1-1000000) - suporta até 1 milhão
                        // 3. O match deve conter palavras-chave em QUALQUER IDIOMA
                        if (num > 0 && num <= 1000000 && (num < 2020 || num > 2030)) {
                            const lowerMatch = fullMatch.toLowerCase();
                            const hasKeyword = 
                                lowerMatch.includes('resultado') || 
                                lowerMatch.includes('anúncio') || 
                                lowerMatch.includes('result') ||
                                lowerMatch.includes('ad') ||
                                fullMatch.includes('结果') || // Chinês
                                fullMatch.includes('条') || // Chinês
                                fullMatch.includes('约'); // Chinês
                            
                            // Para padrões genéricos, verifica contexto
                            if (pattern.source.includes('\\b')) {
                                const matchIndex = bodyText.toLowerCase().indexOf(lowerMatch);
                                const contextStart = Math.max(0, matchIndex - 100);
                                const contextEnd = Math.min(bodyText.length, matchIndex + lowerMatch.length + 100);
                                const context = bodyText.substring(contextStart, contextEnd).toLowerCase();
                                
                                if (context.includes('resultado') || 
                                    context.includes('anúncio') || 
                                    context.includes('result') ||
                                    context.includes('ad') ||
                                    context.includes('结果') ||
                                    context.includes('条')) {
                                    adCount = num;
                                    console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios usando regex: ${pattern}`);
                                    console.log(`[SCRAPER] ✓ Match completo: "${fullMatch}"`);
                                    console.log(`[SCRAPER] ✓ Número original: "${numStr}"`);
                                    break;
                                }
                            } else if (hasKeyword) {
                                adCount = num;
                                console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios usando regex: ${pattern}`);
                                console.log(`[SCRAPER] ✓ Match completo: "${fullMatch}"`);
                                console.log(`[SCRAPER] ✓ Número original: "${numStr}"`);
                                break;
                            }
                        }
                    }
                    if (adCount !== null) break;
                } catch (e) {
                    // Ignora erros de regex e continua
                    continue;
                }
            }
        }
        
        // Estratégia 3: Procura linha por linha (mais preciso)
        if (adCount === null) {
            console.log('[SCRAPER] Estratégia 3: Analisando linha por linha...');
            const bodyText = await page.evaluate(() => document.body.innerText);
            const lines = bodyText.split('\n');
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                // Procura linhas que contenham palavras-chave em QUALQUER IDIOMA mas NÃO anos
                const hasKeyword = 
                    trimmedLine.toLowerCase().includes('resultado') || 
                    trimmedLine.toLowerCase().includes('anúncio') ||
                    trimmedLine.toLowerCase().includes('result') ||
                    trimmedLine.toLowerCase().includes('ad') ||
                    trimmedLine.includes('结果') || // Chinês
                    trimmedLine.includes('条') || // Chinês
                    trimmedLine.includes('约'); // Chinês
                
                if (hasKeyword && !trimmedLine.match(/20\d{2}/)) {
                    // Procura número com ~, 约 ou sem prefixo, suporta separadores
                    const match = trimmedLine.match(/(?:~|约)?\s*([\d.,]+)/);
                    if (match) {
                        const numStr = match[1].replace(/[.,]/g, '');
                        const num = parseInt(numStr, 10);
                        if (num > 0 && num <= 1000000 && (num < 2020 || num > 2030)) {
                            adCount = num;
                            console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios na linha: "${trimmedLine}"`);
                            console.log(`[SCRAPER] ✓ Número original: "${match[1]}"`);
                            break;
                        }
                    }
                }
            }
        }
        
        // Estratégia 4: Procura no HTML por atributos data-* ou aria-* que possam conter o número
        if (adCount === null) {
            console.log('[SCRAPER] Estratégia 4: Buscando em atributos HTML...');
            try {
                adCount = await page.evaluate(() => {
                    // Procura por todos os elementos que possam conter o número
                    const allElements = document.querySelectorAll('*');
                    
                    for (const el of allElements) {
                        // Verifica atributos
                        const attrs = ['aria-label', 'title', 'data-testid', 'data-content'];
                        for (const attr of attrs) {
                            const value = el.getAttribute(attr);
                            if (value) {
                                const match = value.match(/(?:~|约)?\s*([\d.,]+)\s*(?:resultados?|results?|anúncios?|ads?)/i);
                                if (match) {
                                    const numStr = match[1].replace(/[.,]/g, '');
                                    const num = parseInt(numStr, 10);
                                    if (num > 0 && num <= 1000000 && (num < 2020 || num > 2030)) {
                                        return num;
                                    }
                                }
                            }
                        }
                        
                        // Verifica texto do elemento
                        const text = el.textContent || el.innerText;
                        if (text && text.length < 100) { // Apenas textos curtos (mais prováveis de conter o número)
                            const match = text.match(/(?:~|约)?\s*([\d.,]+)\s*(?:resultados?|results?|anúncios?|ads?)/i);
                            if (match) {
                                const numStr = match[1].replace(/[.,]/g, '');
                                const num = parseInt(numStr, 10);
                                if (num > 0 && num <= 1000000 && (num < 2020 || num > 2030)) {
                                    return num;
                                }
                            }
                        }
                    }
                    return null;
                });
                
                if (adCount !== null) {
                    console.log(`[SCRAPER] ✓ Encontrado ${adCount} anúncios usando atributos HTML`);
                } else {
                    console.log('[SCRAPER] ⚠️  Estratégia 4 não encontrou número');
                }
            } catch (e) {
                console.log('[SCRAPER] ⚠️  Erro na estratégia 4:', e.message);
            }
        }
        
        // Debug: Salva HTML e screenshot
        if (adCount === null) {
            console.log('[SCRAPER] ⚠️  Não encontrou número, salvando debug...');
            try {
                const html = await page.content();
                const bodyText = await page.evaluate(() => document.body.innerText);
                
                console.log('[SCRAPER] DEBUG - Primeiros 2000 caracteres do texto:');
                console.log(bodyText.substring(0, 2000));
                console.log('[SCRAPER] DEBUG - Procurando por "resultado" no texto...');
                const resultadoMatches = bodyText.match(/resultado/gi);
                console.log(`[SCRAPER] DEBUG - Encontrou "resultado" ${resultadoMatches ? resultadoMatches.length : 0} vezes`);
                
                // Tira screenshot
                await page.screenshot({ 
                    path: `/tmp/debug-${Date.now()}.png`,
                    fullPage: true 
                }).catch(e => console.log('[SCRAPER] Erro ao salvar screenshot:', e.message));
            } catch (e) {
                console.log('[SCRAPER] Erro no debug:', e.message);
            }
        }
        
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
            // Suporta números com separadores (1.100, 1,100)
            const bodyText = document.body.innerText;
            const match = bodyText.match(/([\d.,]+)\s+(resultados|anúncios|results?)/i);
            if (match) {
                const numStr = match[1].replace(/[.,]/g, '');
                return parseInt(numStr, 10);
            }
            return null;
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
