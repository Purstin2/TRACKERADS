// Estado vivo do job de discovery (memória) + configurações persistidas.
// É o que alimenta o painel: status/progresso/logs, botão Parar e filtros editáveis.
//
// ESPELHO NO SUPABASE (app_state): o site deployado NÃO alcança localhost:3001
// (bloqueio do browser) e o robô também roda no GitHub Actions — então o estado
// do job, os logs e os filtros são espelhados nas keys `discovery_job`,
// `discovery_settings` e `discovery_stop` da tabela app_state. A UI lê/escreve
// lá; o robô (local OU Actions) obedece.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, 'discovery-settings.json');

/* ── ponte REST com o app_state do Supabase (mesmo padrão do supabaseService) ── */
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const sbHeaders = (extra = {}) => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...extra });

async function stateUpsert(key, value) {
    if (!SB_URL || !SB_KEY) return;
    try {
        await fetch(`${SB_URL}/rest/v1/app_state?on_conflict=key`, {
            method: 'POST',
            headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
        });
    } catch { /* offline — segue só em memória */ }
}
async function stateGet(key) {
    if (!SB_URL || !SB_KEY) return null;
    try {
        const r = await fetch(`${SB_URL}/rest/v1/app_state?key=eq.${encodeURIComponent(key)}&select=value`, { headers: sbHeaders() });
        const j = await r.json();
        return Array.isArray(j) && j[0] ? j[0].value : null;
    } catch { return null; }
}

// push do estado com throttle (não marteladas no banco a cada linha de log)
let lastPush = 0;
let pushTimer = null;
function pushJobState(force = false) {
    const doPush = () => { lastPush = Date.now(); stateUpsert('discovery_job', getJobState()); };
    if (force) { if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; } doPush(); return; }
    const elapsed = Date.now() - lastPush;
    if (elapsed > 2500) doPush();
    else if (!pushTimer) pushTimer = setTimeout(() => { pushTimer = null; doPush(); }, 2600 - elapsed);
}

// vigia o pedido de Parar vindo do site (app_state.discovery_stop)
let stopWatcher = null;
function startStopWatcher() {
    stateUpsert('discovery_stop', { requested: false }); // limpa pedido velho
    stopWatcher = setInterval(async () => {
        const v = await stateGet('discovery_stop');
        if (v && v.requested) requestStop();
    }, 8000);
}
function stopStopWatcher() {
    if (stopWatcher) { clearInterval(stopWatcher); stopWatcher = null; }
    stateUpsert('discovery_stop', { requested: false });
}

/* ── settings (minAdCount etc.) — editáveis pela UI, usados também no cron ── */
export const DEFAULT_SETTINGS = {
    minAdCount: 20,      // "escalado" = anunciante com ≥N anúncios ativos
    minDaysRunning: 2,   // rodando há ≥N dias
    maxAdvertisers: 15,  // quantos anunciantes confirmar por keyword
    country: 'BR',
};

const clampInt = (v, min, max, fb) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
};

export function loadSettings() {
    try {
        const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        return sanitizeSettings(raw);
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function sanitizeSettings(s = {}) {
    return {
        minAdCount: clampInt(s.minAdCount, 1, 100000, DEFAULT_SETTINGS.minAdCount),
        minDaysRunning: clampInt(s.minDaysRunning, 0, 3650, DEFAULT_SETTINGS.minDaysRunning),
        maxAdvertisers: clampInt(s.maxAdvertisers, 1, 50, DEFAULT_SETTINGS.maxAdvertisers),
        country: /^[A-Z]{2}$/.test(String(s.country || '').toUpperCase()) ? String(s.country).toUpperCase() : DEFAULT_SETTINGS.country,
    };
}

export function saveSettings(patch) {
    const merged = sanitizeSettings({ ...loadSettings(), ...patch });
    try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2)); } catch { /* Actions: fs efêmero, tudo bem */ }
    return merged;
}

/** Settings valendo em QUALQUER robô: Supabase (app_state) por cima do arquivo local. */
export async function loadSettingsAsync() {
    const remote = await stateGet('discovery_settings');
    return remote ? sanitizeSettings({ ...loadSettings(), ...remote }) : loadSettings();
}

/* ── blocklist (anunciantes/categorias a pular) — vive no app_state ── */
export async function loadBlocklist() {
    const v = await stateGet('discovery_blocklist');
    return {
        names: Array.isArray(v?.names) ? v.names : [],
        categories: Array.isArray(v?.categories) ? v.categories : [],
    };
}
export async function saveBlocklist(patch) {
    const cur = await loadBlocklist();
    const norm = (arr) => [...new Set((arr || []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 200);
    const next = {
        names: norm(patch.names ?? cur.names),
        categories: norm(patch.categories ?? cur.categories),
    };
    await stateUpsert('discovery_blocklist', next);
    return next;
}

/* ── meta das ofertas (descrição/título/domínio/categoria) por page_id ──
 * Sem coluna nova em discovered_offers: guardamos num mapa no app_state e a
 * tela junta pelo facebook_page_id. Cap de 400 entradas (as mais recentes). */
export async function mergeDiscoveryMeta(offers) {
    const entries = (offers || []).filter((o) => o && o.facebook_page_id && (o.description || o.offer_title || o.page_category));
    if (!entries.length) return;
    const cur = (await stateGet('discovery_meta')) || {};
    for (const o of entries) {
        cur[o.facebook_page_id] = {
            description: o.description || null,
            title: o.offer_title || null,
            domain: o.offer_domain || null,
            category: o.page_category || null,
            sampleAd: o.sample_ad_link || null,
            ts: Date.now(),
        };
    }
    // cap: mantém as 400 mais recentes
    const keys = Object.keys(cur);
    if (keys.length > 400) {
        keys.sort((a, b) => (cur[a].ts || 0) - (cur[b].ts || 0));
        for (const k of keys.slice(0, keys.length - 400)) delete cur[k];
    }
    await stateUpsert('discovery_meta', cur);
}

/** Salva local + espelha no Supabase (a UI deployada e o Actions leem de lá). */
export async function saveSettingsRemote(patch) {
    const merged = saveSettings(patch);
    await stateUpsert('discovery_settings', merged);
    return merged;
}

/* ── estado do job (um por processo — o scraper roda um discovery por vez) ── */
const state = {
    status: 'idle',        // idle | running | done | error | stopped
    startedAt: null,
    finishedAt: null,
    keywordsTotal: 0,
    keywordsDone: 0,
    currentKeywords: [],   // keywords em processamento agora (roda em paralelo)
    found: 0,
    error: null,
    cancelRequested: false,
    logs: [],              // ring buffer das últimas linhas
};

export function getJobState() {
    return { ...state, currentKeywords: [...state.currentKeywords], logs: state.logs.slice(-150) };
}

export function jobLog(msg) {
    const line = `${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}  ${msg}`;
    state.logs.push(line);
    if (state.logs.length > 500) state.logs.splice(0, state.logs.length - 500);
    console.log(msg);
    pushJobState();
}

export function jobStart(keywordsTotal) {
    state.status = 'running';
    state.startedAt = new Date().toISOString();
    state.finishedAt = null;
    state.keywordsTotal = keywordsTotal;
    state.keywordsDone = 0;
    state.currentKeywords = [];
    state.found = 0;
    state.error = null;
    state.cancelRequested = false;
    state.logs = [];
    startStopWatcher();
    pushJobState(true);
}

export function jobKeywordStart(kw) { state.currentKeywords.push(kw); pushJobState(); }
export function jobKeywordDone(kw, found) {
    state.currentKeywords = state.currentKeywords.filter((k) => k !== kw);
    state.keywordsDone++;
    state.found += found;
    pushJobState();
}

export function jobFinish(error = null) {
    state.finishedAt = new Date().toISOString();
    state.currentKeywords = [];
    if (error) { state.status = 'error'; state.error = String(error); }
    else state.status = state.cancelRequested ? 'stopped' : 'done';
    stopStopWatcher();
    pushJobState(true);
}

export function isRunning() { return state.status === 'running'; }
export function requestStop() {
    if (state.status !== 'running') return false;
    state.cancelRequested = true;
    jobLog('⏹ Parada solicitada — finalizando o que está em andamento e parando…');
    return true;
}
export function shouldStop() { return state.cancelRequested; }
