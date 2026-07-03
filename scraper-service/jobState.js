// Estado vivo do job de discovery (memória) + configurações persistidas em disco.
// É o que alimenta o painel: status/progresso/logs, botão Parar e filtros editáveis.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, 'discovery-settings.json');

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
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2));
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
}

export function jobKeywordStart(kw) { state.currentKeywords.push(kw); }
export function jobKeywordDone(kw, found) {
    state.currentKeywords = state.currentKeywords.filter((k) => k !== kw);
    state.keywordsDone++;
    state.found += found;
}

export function jobFinish(error = null) {
    state.finishedAt = new Date().toISOString();
    state.currentKeywords = [];
    if (error) { state.status = 'error'; state.error = String(error); }
    else state.status = state.cancelRequested ? 'stopped' : 'done';
}

export function isRunning() { return state.status === 'running'; }
export function requestStop() {
    if (state.status !== 'running') return false;
    state.cancelRequested = true;
    jobLog('⏹ Parada solicitada — finalizando o que está em andamento e parando…');
    return true;
}
export function shouldStop() { return state.cancelRequested; }
