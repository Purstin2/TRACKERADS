import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { startScheduler, startSchedulerWithInitialRun, runScrapingJob } from './scheduler.js';
import { scrapeFacebookAdsCount } from './scraper.js';
import { getOffersWithFacebookLinks } from './supabaseService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

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
        
        res.json({
            status: 'running',
            offersMonitored: offers.length,
            schedulerActive: true,
            nextRun: 'A cada 12 horas (00:00 e 12:00)',
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
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL é obrigatória'
            });
        }
        
        console.log(`🧪 Testando scraping para: ${url}`);
        
        const result = await scrapeFacebookAdsCount(url);
        
        res.json({
            success: result.success,
            adCount: result.adCount,
            error: result.error,
            url: url,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

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
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
    console.error('❌ Erro não tratado:', error);
});

process.on('SIGINT', () => {
    console.log('\n\n👋 Encerrando servidor...');
    process.exit(0);
});
