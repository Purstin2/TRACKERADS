import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { startScheduler, startSchedulerWithInitialRun, runScrapingJob, runDiscoveryJob } from './scheduler.js';
import { scrapeFacebookAdsCount } from './scraper.js';
import { discoverOffersByKeyword } from './discoveryService.js';
import { getOffersWithFacebookLinks, getActiveDiscoveryKeywords, saveDiscoveredOffers, updateKeywordLastRun } from './supabaseService.js';
import { getLastScrapingInfo } from './lastScraping.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
// CORS configurado para permitir requisições de qualquer origem
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

// Aumenta o timeout do Express para requisições longas (scraping pode demorar até 2 minutos)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Timeout global para requisições (2 minutos)
app.use((req, res, next) => {
    req.setTimeout(120000); // 2 minutos
    res.setTimeout(120000);
    next();
});

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'TrackerAds Scraper Service',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Status do serviço
app.get('/api/status', async (req, res) => {
    try {
        const offers = await getOffersWithFacebookLinks();
        const lastScraping = getLastScrapingInfo();
        
        // Calcula próxima execução
        const now = new Date();
        const nowBR = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        let nextRun = new Date(nowBR);
        
        if (nowBR.getHours() < 12) {
            nextRun.setHours(12, 0, 0, 0);
        } else {
            nextRun.setDate(nextRun.getDate() + 1);
            nextRun.setHours(0, 0, 0, 0);
        }
        
        res.json({
            status: 'running',
            offersMonitored: offers.length,
            schedulerActive: true,
            schedule: '00:00 e 12:00 (horário de Brasília)',
            nextRun: nextRun.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            lastScraping: lastScraping.timestamp ? {
                timestamp: lastScraping.timestamp,
                success: lastScraping.success,
                offersProcessed: lastScraping.offersProcessed
            } : null,
            serverTime: now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            serverTimeUTC: now.toUTCString(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Endpoint para executar scraping manualmente
app.post('/api/scrape/run', async (req, res) => {
    try {
        console.log('📡 Requisição manual de scraping recebida');
        
        // Executa o job em background
        runScrapingJob()
            .then(results => {
                console.log('✅ Job manual concluído:', results);
            })
            .catch(error => {
                console.error('❌ Erro no job manual:', error);
            });
        
        res.json({
            success: true,
            message: 'Job de scraping iniciado em background',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint para testar scraping de uma URL específica
app.post('/api/scrape/test', async (req, res) => {
    // Aumenta timeout específico para este endpoint (2 minutos)
    req.setTimeout(120000);
    res.setTimeout(120000);
    
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL é obrigatória'
            });
        }
        
        console.log(`🧪 Testando scraping para: ${url}`);
        console.log(`⏱️  Timeout configurado: 120 segundos`);
        
        // Envia headers para manter conexão viva
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Keep-Alive', 'timeout=120');
        
        const startTime = Date.now();
        const result = await scrapeFacebookAdsCount(url);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log(`✅ Scraping concluído em ${duration}s`);
        
        res.json({
            success: result.success,
            adCount: result.adCount,
            error: result.error,
            url: url,
            duration: `${duration}s`,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro no endpoint /api/scrape/test:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ── DISCOVERY ENDPOINTS ───────────────────────────────────────────────────────

// Dispara o job de discovery para todas as keywords ativas
app.post('/api/discovery/run', async (req, res) => {
    try {
        console.log('🔍 Discovery job disparado manualmente');

        // Roda em background para não bloquear a resposta
        runDiscoveryJob()
            .then(results => console.log('✅ Discovery manual concluído:', results))
            .catch(error => console.error('❌ Erro no discovery manual:', error));

        res.json({
            success: true,
            message: 'Job de discovery iniciado em background',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Testa discovery para uma keyword específica (síncrono, para debug)
app.post('/api/discovery/test', async (req, res) => {
    req.setTimeout(300000); // 5 min
    res.setTimeout(300000);

    try {
        const { keyword, minAdCount = 20, minDaysRunning = 2, maxAdvertisers = 5 } = req.body;

        if (!keyword) {
            return res.status(400).json({ success: false, error: 'keyword é obrigatória' });
        }

        console.log(`🔍 Testando discovery para: "${keyword}"`);

        const result = await discoverOffersByKeyword(keyword, {
            minAdCount,
            minDaysRunning,
            maxAdvertisers
        });

        res.json({
            ...result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

// Endpoint para listar ofertas monitoradas
app.get('/api/offers', async (req, res) => {
    try {
        const offers = await getOffersWithFacebookLinks();
        
        res.json({
            success: true,
            count: offers.length,
            offers: offers.map(o => ({
                id: o.id,
                name: o.name,
                link: o.link,
                lastAdCount: o.last_ad_count,
                lastUpdate: o.last_ad_count_timestamp
            }))
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   TRACKERADS SCRAPER SERVICE           ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log(`🌐 Servidor rodando em: http://localhost:${PORT}`);
    console.log(`📅 Timezone: America/Sao_Paulo\n`);
    
    // Inicia o scheduler automático
    // Use startScheduler() para apenas agendar
    // Use startSchedulerWithInitialRun() para rodar imediatamente + agendar
    
    // Descomente a linha abaixo para rodar imediatamente ao iniciar:
    // startSchedulerWithInitialRun();
    
    // Ou use esta para apenas agendar (sem rodar imediatamente):
    startScheduler();
    
    // Log do horário atual do servidor
    const serverTime = new Date();
    console.log(`🕐 Horário do servidor: ${serverTime.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`🕐 Horário UTC: ${serverTime.toUTCString()}\n`);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
    console.error('❌ Erro não tratado:', error);
});

process.on('SIGINT', () => {
    console.log('\n\n👋 Encerrando servidor...');
    process.exit(0);
});
