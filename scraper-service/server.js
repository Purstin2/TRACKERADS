import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { startScheduler, startSchedulerWithInitialRun, runScrapingJob, runDiscoveryJob } from './scheduler.js';
import { scrapeFacebookAdsCount, scrapePageName, scrapePageNames } from './scraper.js';
import { discoverOffersByKeyword } from './discoveryService.js';
import { getOffersWithFacebookLinks, getActiveDiscoveryKeywords, saveDiscoveredOffers, updateKeywordLastRun, updateOfferName } from './supabaseService.js';
import { getLastScrapingInfo } from './lastScraping.js';
import { getJobState, requestStop, isRunning, loadSettings, loadSettingsAsync, saveSettingsRemote } from './jobState.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
// Private Network Access: o Chrome bloqueia requisição de site PÚBLICO (https, ex.
// trackerads-nine.vercel.app) para localhost a menos que o serviço local devolva este
// header. SEM isto, os botões "Local"/"Nomes reais" do site deployado dão "scraper não
// está rodando" mesmo com ele rodando. Tem que vir ANTES do cors (que encerra o OPTIONS).
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
});
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
            isDead: result.isDead ?? false,
            oldestAdDate: result.oldestAdDate ?? null,
            daysRunning: result.daysRunning ?? null,
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

// ── NOME REAL DA PÁGINA ───────────────────────────────────────────────────────

// Lê o nome real de UM link (usado no import / rename individual)
app.post('/api/scrape/name', async (req, res) => {
    req.setTimeout(60000); res.setTimeout(60000);
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'URL é obrigatória' });
        const result = await scrapePageName(url);
        res.json({ ...result, timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Renomeia EM MASSA todas as ofertas (FB, não arquivadas) com o nome real da Página
app.post('/api/scrape/names', async (req, res) => {
    try {
        const offers = await getOffersWithFacebookLinks(); // já exclui arquivadas
        // só renomeia links de PÁGINA específica (view_all_page_id); buscas por
        // palavra-chave têm vários anunciantes → não dá um nome único confiável
        const items = offers
            .filter(o => /view_all_page_id=/.test(o.link || ''))
            .map(o => ({ id: o.id, url: o.link }));

        // responde já; processa em background
        res.json({
            success: true,
            message: `Buscando o nome real de ${items.length} ofertas em background`,
            count: items.length,
            timestamp: new Date().toISOString(),
        });

        // grava cada nome assim que é raspado (incremental → o site reflete ao vivo)
        scrapePageNames(items, async (id, name) => { await updateOfferName(id, name); })
            .then((results) => {
                const ok = results.filter(r => r.name).length;
                console.log(`✅ [NAMES] concluído: ${ok}/${results.length} ofertas com nome real`);
            })
            .catch(err => console.error('❌ [NAMES] erro no job:', err));
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── DISCOVERY ENDPOINTS ───────────────────────────────────────────────────────

// Dispara o job de discovery para todas as keywords ativas.
// Aceita overrides no body: { minAdCount, minDaysRunning, maxAdvertisers, country }
app.post('/api/discovery/run', async (req, res) => {
    try {
        if (isRunning()) {
            return res.status(409).json({ success: false, error: 'Discovery já está rodando. Use /api/discovery/stop pra parar.' });
        }
        console.log('🔍 Discovery job disparado manualmente');

        // Roda em background para não bloquear a resposta
        runDiscoveryJob(req.body || {})
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

// Estado vivo do job (status/progresso/logs) — o painel consulta isso
app.get('/api/discovery/status', (req, res) => {
    res.json({ success: true, job: getJobState(), settings: loadSettings(), timestamp: new Date().toISOString() });
});

// Pede a parada do job em andamento (para no anunciante atual)
app.post('/api/discovery/stop', (req, res) => {
    const ok = requestStop();
    res.json({ success: ok, message: ok ? 'Parada solicitada — o job encerra no próximo passo' : 'Nenhum job rodando' });
});

// Filtros da descoberta (minAdCount etc.) — GET lê, POST salva (Supabase app_state
// + arquivo local; vale pro botão, pro cron local E pro robô na nuvem/Actions)
app.get('/api/discovery/settings', async (req, res) => {
    res.json({ success: true, settings: await loadSettingsAsync() });
});
app.post('/api/discovery/settings', async (req, res) => {
    try {
        const settings = await saveSettingsRemote(req.body || {});
        res.json({ success: true, settings });
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

// ── BOOKMARKS IMPORT ─────────────────────────────────────────────────────────

function findFolderByName(node, targetName) {
    if (node.type === 'folder' && node.name?.toLowerCase() === targetName.toLowerCase()) {
        return node;
    }
    if (node.children) {
        for (const child of node.children) {
            const found = findFolderByName(child, targetName);
            if (found) return found;
        }
    }
    return null;
}

function extractUrls(node) {
    const results = [];
    if (node.type === 'url' && node.url) {
        results.push({ name: node.name || node.url, url: node.url });
    }
    if (node.children) {
        for (const child of node.children) {
            results.push(...extractUrls(child));
        }
    }
    return results;
}

function getBookmarksPaths() {
    const home = os.homedir();
    return [
        path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
        path.join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Bookmarks'),
        path.join(home, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Bookmarks'),
    ];
}

app.get('/api/bookmarks/:folder', (req, res) => {
    const folderName = req.params.folder;
    const paths = getBookmarksPaths();

    for (const filePath of paths) {
        if (!fs.existsSync(filePath)) continue;
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const roots = data.roots || {};

            let found = null;
            for (const root of Object.values(roots)) {
                found = findFolderByName(root, folderName);
                if (found) break;
            }

            if (!found) {
                return res.json({ success: false, error: `Pasta "${folderName}" não encontrada`, bookmarks: [] });
            }

            const bookmarks = extractUrls(found);
            const browser = filePath.includes('Chrome') ? 'Chrome' : filePath.includes('Edge') ? 'Edge' : 'Brave';
            return res.json({ success: true, folder: folderName, browser, count: bookmarks.length, bookmarks });
        } catch (e) {
            continue;
        }
    }

    res.json({ success: false, error: 'Nenhum arquivo de bookmarks encontrado. Certifique-se de que o Chrome ou Edge está instalado.', bookmarks: [] });
});

// ─────────────────────────────────────────────────────────────────────────────

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
