import cron from 'node-cron';
import { scrapeFacebookAdsCount, scrapeFacebookAdsCountSimple, createBrowser, createStealthContext } from './scraper.js';
import { getOffersWithFacebookLinks, updateOfferAdCount, logScrapingResult, getActiveDiscoveryKeywords, saveDiscoveredOffers, updateKeywordLastRun } from './supabaseService.js';
import { discoverOffersByKeyword } from './discoveryService.js';
import { setLastScrapingInfo } from './lastScraping.js';

// Quantas ofertas processar em paralelo. Mais = mais rápido, porém mais risco
// de o Facebook limitar requisições. 3 é um equilíbrio seguro. Configurável por env.
const SCRAPE_CONCURRENCY = parseInt(process.env.SCRAPE_CONCURRENCY || '3', 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => Math.floor(min + Math.random() * (max - min));

/**
 * Processa UMA oferta: tenta o método principal e, se falhar, o alternativo,
 * com uma 2ª tentativa. Aceita uma oferta MORTA (0 anúncios) como sucesso.
 */
async function processOffer(offer, context, index, total) {
    const tag = `[${index}/${total}] ${offer.name}`;
    let result = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
        if (attempt > 1) {
            console.log(`   🔄 ${tag}: tentativa ${attempt}/2`);
            await sleep(jitter(3000, 6000));
        }

        result = await scrapeFacebookAdsCount(offer.link, { context });

        // Fallback: método simplificado quando o principal não conseguiu ler a contagem
        if (!result.success) {
            const alt = await scrapeFacebookAdsCountSimple(offer.link, { context });
            if (alt.success) result = alt;
        }

        if (result.success && result.adCount !== null) break;
    }

    // adCount === 0 É um resultado VÁLIDO (oferta morta) — precisa ser gravado!
    if (result && result.success && result.adCount !== null) {
        const saved = await updateOfferAdCount(offer.id, result.adCount, {
            oldestAdDate: result.oldestAdDate,
            daysRunning: result.daysRunning
        });
        await logScrapingResult(offer.id, result.adCount, saved);
        const label = result.adCount === 0 ? '💀 MORTA (0 ads)' : `${result.adCount} ads`;
        console.log(`   ${saved ? '✅' : '❌'} ${tag}: ${label}${saved ? ' salvo' : ' (erro ao salvar)'}`);
        return saved ? 'success' : 'failed';
    }

    console.log(`   ❌ ${tag}: falha — ${result?.error || 'desconhecido'}`);
    await logScrapingResult(offer.id, null, false, result?.error || 'Erro desconhecido');
    return 'failed';
}

/**
 * Executa o scraping para todas as ofertas.
 * Reusa UM navegador para todo o job e processa em paralelo controlado.
 */
export async function runScrapingJob() {
    console.log('\n====================================');
    console.log('🚀 INICIANDO JOB DE SCRAPING');
    console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);
    console.log('====================================\n');

    let browser = null;

    try {
        const offers = await getOffersWithFacebookLinks();

        if (offers.length === 0) {
            console.log('⚠️  Nenhuma oferta com link do Facebook encontrada.');
            return { success: 0, failed: 0, total: 0 };
        }

        console.log(`📊 Processando ${offers.length} ofertas (concorrência: ${SCRAPE_CONCURRENCY})...\n`);

        const results = { success: 0, failed: 0, total: offers.length };

        // Um navegador + um contexto reaproveitados por todo o job
        browser = await createBrowser();
        const context = await createStealthContext(browser);

        // Fila com workers paralelos (concorrência controlada)
        let cursor = 0;
        const worker = async () => {
            while (cursor < offers.length) {
                const i = cursor++;
                const offer = offers[i];
                const status = await processOffer(offer, context, i + 1, offers.length);
                if (status === 'success') results.success++;
                else results.failed++;
                // Pequeno respiro entre requisições para não parecer bot
                await sleep(jitter(800, 2200));
            }
        };

        const workers = Array.from(
            { length: Math.min(SCRAPE_CONCURRENCY, offers.length) },
            () => worker()
        );
        await Promise.all(workers);

        await context.close().catch(() => {});

        console.log('\n====================================');
        console.log('📈 RESUMO DO JOB DE SCRAPING');
        console.log(`   Total: ${results.total}`);
        console.log(`   ✅ Sucesso: ${results.success}`);
        console.log(`   ❌ Falhas: ${results.failed}`);
        console.log(`   ⏰ Concluído em: ${new Date().toLocaleString('pt-BR')}`);
        console.log('====================================\n');

        setLastScrapingInfo({
            success: results.failed === 0,
            offersProcessed: results.total,
            results
        });

        return results;
    } catch (error) {
        console.error('\n❌ ERRO CRÍTICO NO JOB DE SCRAPING:', error);
        throw error;
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

/**
 * Job de descoberta automática de ofertas
 * Processa todas as keywords ativas de todos os usuários
 */
export async function runDiscoveryJob() {
    console.log('\n====================================');
    console.log('🔍 INICIANDO JOB DE DISCOVERY');
    console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);
    console.log('====================================\n');

    try {
        const keywords = await getActiveDiscoveryKeywords();

        if (keywords.length === 0) {
            console.log('⚠️  Nenhuma keyword de discovery ativa encontrada.');
            return { processed: 0, found: 0 };
        }

        console.log(`🔑 Keywords a processar: ${keywords.length}`);

        let totalFound = 0;

        for (const kw of keywords) {
            console.log(`\n🔑 Processando keyword: "${kw.keyword}" (user: ${kw.user_id.substring(0, 8)}...)`);

            const result = await discoverOffersByKeyword(kw.keyword, {
                minAdCount: 20,
                minDaysRunning: 2,
                maxAdvertisers: 15,
                country: 'BR'
            });

            if (result.success && result.offers.length > 0) {
                await saveDiscoveredOffers(kw.user_id, result.offers);
                totalFound += result.offers.length;
                console.log(`✅ "${kw.keyword}": ${result.offers.length} oferta(s) qualificada(s) salvas`);
            } else {
                console.log(`ℹ️  "${kw.keyword}": nenhuma oferta qualificada`);
            }

            await updateKeywordLastRun(kw.id);

            // Pausa entre keywords para não sobrecarregar
            if (keywords.indexOf(kw) < keywords.length - 1) {
                const pause = 10000 + Math.random() * 5000;
                console.log(`⏸️  Aguardando ${(pause / 1000).toFixed(0)}s antes da próxima keyword...`);
                await new Promise(r => setTimeout(r, pause));
            }
        }

        console.log('\n====================================');
        console.log('📊 RESUMO DO JOB DE DISCOVERY');
        console.log(`   Keywords processadas: ${keywords.length}`);
        console.log(`   Ofertas encontradas: ${totalFound}`);
        console.log(`   ⏰ ${new Date().toLocaleString('pt-BR')}`);
        console.log('====================================\n');

        return { processed: keywords.length, found: totalFound };

    } catch (error) {
        console.error('\n❌ ERRO CRÍTICO NO JOB DE DISCOVERY:', error);
        throw error;
    }
}

/**
 * Inicia o agendamento automático
 * Roda a cada 12 horas (às 00:00 e 12:00)
 */
export function startScheduler() {
    console.log('⏰ Scheduler iniciado!');
    console.log('📅 Agendamento: 00:00 e 12:00 (horário de Brasília)');
    console.log('📅 Agendamento UTC: 03:00 e 15:00 (Railway usa UTC)');
    
    // Expressão cron: A cada 12 horas (00:00 e 12:00 BRASIL = 03:00 e 15:00 UTC)
    // Formato: minuto hora dia mês dia-da-semana
    // IMPORTANTE: Railway usa UTC, então 12:00 Brasil = 15:00 UTC (UTC-3)
    const cronExpression = '0 3,15 * * *'; // 03:00 UTC (00:00 BR) e 15:00 UTC (12:00 BR)
    
    // Alternativas:
    // '0 */12 * * *'  - A cada 12 horas
    // '0 0,12 * * *'  - Às 00:00 e 12:00
    // '*/30 * * * *'  - A cada 30 minutos (para testes)
    // '0 * * * *'     - A cada 1 hora
    
    cron.schedule(cronExpression, async () => {
        const now = new Date();
        console.log('\n🔔 ====================================');
        console.log(`🔔 CRON DISPARADO! ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
        console.log('🔔 ====================================\n');
        try {
            await runScrapingJob();
        } catch (error) {
            console.error('❌ Erro no job agendado:', error);
        }
    }, {
        timezone: "America/Sao_Paulo" // Timezone do Brasil
    });
    
    // Log do próximo agendamento
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const nextNoon = new Date(now);
    if (now.getHours() < 12) {
        nextNoon.setHours(12, 0, 0, 0);
    } else {
        nextNoon.setHours(36, 0, 0, 0); // Próximo meio-dia
    }
    
    const nextRun = nextNoon < nextMidnight ? nextNoon : nextMidnight;
    console.log(`📅 Próxima execução: ${nextRun.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    
    // Job de Discovery: 1x por dia às 08:00 BRT (11:00 UTC)
    cron.schedule('0 11 * * *', async () => {
        const now = new Date();
        console.log('\n🔔 ====================================');
        console.log(`🔔 DISCOVERY CRON! ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
        console.log('🔔 ====================================\n');
        try {
            await runDiscoveryJob();
        } catch (error) {
            console.error('❌ Erro no discovery agendado:', error);
        }
    }, { timezone: 'America/Sao_Paulo' });

    console.log('🔍 Discovery agendado: 08:00 BRT (diário)');
    console.log('✅ Scheduler configurado e rodando!\n');
}

/**
 * Para testes: roda o job imediatamente e depois agenda
 */
export async function startSchedulerWithInitialRun() {
    console.log('🚀 Executando job inicial...\n');
    
    try {
        await runScrapingJob();
    } catch (error) {
        console.error('❌ Erro no job inicial:', error);
    }
    
    console.log('\n⏰ Iniciando agendamento automático...\n');
    startScheduler();
}
