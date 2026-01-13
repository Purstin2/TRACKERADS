import cron from 'node-cron';
import { scrapeFacebookAdsCount, scrapeFacebookAdsCountSimple } from './scraper.js';
import { getOffersWithFacebookLinks, updateOfferAdCount, logScrapingResult } from './supabaseService.js';
import { setLastScrapingInfo } from './lastScraping.js';

/**
 * Executa o scraping para todas as ofertas
 */
export async function runScrapingJob() {
    console.log('\n====================================');
    console.log('🚀 INICIANDO JOB DE SCRAPING');
    console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);
    console.log('====================================\n');
    
    try {
        // Busca todas as ofertas com links do Facebook
        const offers = await getOffersWithFacebookLinks();
        
        if (offers.length === 0) {
            console.log('⚠️  Nenhuma oferta com link do Facebook encontrada.');
            return;
        }
        
        console.log(`📊 Processando ${offers.length} ofertas...\n`);
        
        const results = {
            success: 0,
            failed: 0,
            total: offers.length
        };
        
        // Processa cada oferta sequencialmente (para não sobrecarregar)
        for (let i = 0; i < offers.length; i++) {
            const offer = offers[i];
            const progress = `[${i + 1}/${offers.length}]`;
            
            console.log(`\n🎯 ${progress} Processando: ${offer.name}`);
            console.log(`   Link: ${offer.link}`);
            
            // Tenta primeiro o método principal
            let result = await scrapeFacebookAdsCount(offer.link);
            
            // Se falhou, tenta o método alternativo
            if (!result.success) {
                console.log('   ⚠️  Método principal falhou, tentando alternativo...');
                result = await scrapeFacebookAdsCountSimple(offer.link);
            }
            
            if (result.success && result.adCount !== null) {
                console.log(`   ✅ Sucesso! Encontrados ${result.adCount} anúncios`);
                // Atualiza no banco de dados
                const updated = await updateOfferAdCount(offer.id, result.adCount);
                
                if (updated) {
                    console.log(`   ✅ Sucesso! ${result.adCount} anúncios encontrados e salvos`);
                    results.success++;
                } else {
                    console.log(`   ❌ Erro ao salvar no banco de dados`);
                    results.failed++;
                }
                
                await logScrapingResult(offer.id, result.adCount, true);
            } else {
                console.log(`   ❌ Falha: ${result.error}`);
                results.failed++;
                await logScrapingResult(offer.id, null, false, result.error);
            }
            
            // Aguarda 3 segundos entre cada scraping para não ser detectado como bot
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        console.log('\n====================================');
        console.log('📈 RESUMO DO JOB DE SCRAPING');
        console.log(`   Total: ${results.total}`);
        console.log(`   ✅ Sucesso: ${results.success}`);
        console.log(`   ❌ Falhas: ${results.failed}`);
        console.log(`   ⏰ Concluído em: ${new Date().toLocaleString('pt-BR')}`);
        console.log('====================================\n');
        
        // Salva informações do último scraping
        setLastScrapingInfo({
            success: results.failed === 0,
            offersProcessed: results.total,
            results: results
        });
        
        return results;
        
    } catch (error) {
        console.error('\n❌ ERRO CRÍTICO NO JOB DE SCRAPING:', error);
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
