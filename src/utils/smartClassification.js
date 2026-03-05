/**
 * Sistema Inteligente de Classificação de Ofertas - v2.0
 *
 * Lógica baseada nos padrões reais de quem escala no digital:
 *
 *  • VOLUME absoluto      → proxy de orçamento (mais ads = mais $)
 *  • ACELERAÇÃO           → taxa 3d > taxa 7d = início de escala detectado ("hockey stick")
 *  • CONFIRMAÇÃO MULTI-PERÍODO → 3d + 7d + 14d todos positivos = escala real, não sorte
 *  • CRESCIMENTO CONSECUTIVO  → múltiplas leituras subindo = tendência sustentada
 *  • OSCILAÇÃO            → subida/descida alternada = ciclo de A/B testing de criativos
 *  • QUEDA DO PICO        → caindo do máximo histórico = fadiga criativa / esgotamento
 *  • INATIVIDADE          → sem dados recentes = campanha pausada
 */

import { getSafeDate } from './helpers';

// ─── Construtor de objeto de classificação ────────────────────────────────────
function makeTag(status, label, color, bgColor, borderColor, priority, description, action = '', confidence = 'medium') {
    return { status, label, color, bgColor, borderColor, priority, description, action, confidence };
}

// ─── % de variação do primeiro ao último elemento de uma janela ───────────────
function windowChange(entries) {
    if (!entries || entries.length < 2) return null;
    const from = entries[0].count;
    const to   = entries[entries.length - 1].count;
    if (from === 0) return to > 0 ? 999 : 0;
    return ((to - from) / from) * 100;
}

// ─── Coeficiente de variação → CV alto indica oscilação (padrão de A/B test) ──
function coefficientOfVariation(entries) {
    if (!entries || entries.length < 3) return 0;
    const vals = entries.map(e => e.count || 0);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (mean === 0) return 0;
    const variance = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length;
    return (Math.sqrt(variance) / mean) * 100;
}

// ─── Quantas leituras consecutivas foram na mesma direção (sorted: mais recente primeiro) ─
function countConsecutive(sorted, direction) {
    let count = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
        const curr = sorted[i].count;
        const prev = sorted[i + 1].count;
        if (direction === 'up'   && curr > prev) count++;
        else if (direction === 'down' && curr < prev) count++;
        else break;
    }
    return count;
}

// ─────────────────────────────────────────────────────────────────────────────
export const smartClassifyOffer = (adCountsHistory = [], options = {}) => {

    // ── 1. VALIDAÇÕES BÁSICAS ────────────────────────────────────────────────
    if (!adCountsHistory || adCountsHistory.length === 0) {
        return makeTag('NO_DATA', 'SEM DADOS', 'text-slate-500', 'bg-slate-900/30', 'border-slate-700/50', 0,
            'Aguardando primeiro scraping');
    }

    // sorted: mais recente primeiro
    const sorted = [...adCountsHistory].sort((a, b) => {
        const da = getSafeDate(a.timestamp);
        const db = getSafeDate(b.timestamp);
        return (db || 0) - (da || 0);
    });

    const latest = sorted[0];
    if (!latest || typeof latest.count !== 'number') {
        return makeTag('NO_DATA', 'SEM DADOS', 'text-slate-500', 'bg-slate-900/30', 'border-slate-700/50', 0,
            'Dados inválidos');
    }

    const latestCount = latest.count;
    const latestDate  = getSafeDate(latest.timestamp);
    if (!latestDate) {
        return makeTag('NO_DATA', 'SEM DADOS', 'text-slate-500', 'bg-slate-900/30', 'border-slate-700/50', 0,
            'Timestamp inválido');
    }

    const now = new Date();

    // ── 2. CAMPANHA PAUSADA (sem atualização há 5+ dias) ────────────────────
    const daysSinceUpdate = Math.floor((now - latestDate) / (1000 * 60 * 60 * 24));
    if (daysSinceUpdate >= 5 && latestCount > 0) {
        return makeTag('INACTIVE', 'PAUSADO', 'text-slate-400', 'bg-slate-900/40', 'border-slate-600/40', 0,
            `Sem atualização há ${daysSinceUpdate} dias`,
            'Verificar se campanha foi pausada');
    }

    // ── 3. JANELAS TEMPORAIS (oldest→newest para windowChange) ──────────────
    const getWindow = (days) => {
        const cutoff = new Date(latestDate);
        cutoff.setDate(cutoff.getDate() - days);
        return sorted
            .filter(e => {
                const ed = getSafeDate(e.timestamp);
                return ed && ed >= cutoff && ed <= latestDate;
            })
            .reverse(); // mais antigo primeiro
    };

    const w3  = getWindow(3);
    const w7  = getWindow(7);
    const w14 = getWindow(14);

    const c3  = windowChange(w3);
    const c7  = windowChange(w7);
    const c14 = windowChange(w14);

    // ── 4. MÉTRICAS AVANÇADAS ────────────────────────────────────────────────

    // a) Pico histórico e queda a partir do pico (fadiga criativa)
    const allCounts    = sorted.map(e => e.count || 0);
    const peakCount    = Math.max(...allCounts);
    const dropFromPeak = peakCount > 0 ? ((peakCount - latestCount) / peakCount) * 100 : 0;

    // b) Crescimentos/quedas consecutivas nas últimas leituras
    const consGrowth  = countConsecutive(sorted, 'up');
    const consDecline = countConsecutive(sorted, 'down');

    // c) ACELERAÇÃO: taxa diária de 3d vs 7d
    //    Se a taxa por dia dos últimos 3d for maior que a dos últimos 7d
    //    → o anunciante acabou de apertar o acelerador ("hockey stick")
    const rate3d = (c3 !== null && isFinite(c3) && w3.length >= 2) ? c3 / 3 : null;
    const rate7d = (c7 !== null && isFinite(c7) && w7.length >= 2) ? c7 / 7 : null;
    const isAccelerating = rate3d !== null && rate7d !== null
        && rate3d > rate7d + 3   // 3d claramente mais rápido que 7d
        && rate3d > 4;           // e crescendo de verdade (>4%/dia)

    // d) Confirmação multi-período: 3d, 7d e 14d todos positivos = escala real
    const positiveC3   = c3  === null || c3  >= 0;
    const positiveC7   = c7  !== null && c7  > 0;
    const positiveC14  = c14 === null || c14 >= 0;
    const multiConfirm = positiveC3 && positiveC7 && positiveC14;

    // e) Oscilação (CV alto = anunciante pausando/criando ads = A/B test ativo)
    const cv7          = coefficientOfVariation(w7);
    const isOscillating = cv7 > 30 && sorted.length >= 4;

    // f) Quantidade de histórico disponível
    const firstDate    = getSafeDate(sorted[sorted.length - 1]?.timestamp);
    const totalHistDays = firstDate
        ? Math.floor((latestDate - firstDate) / (1000 * 60 * 60 * 24))
        : 0;
    const isDataSparse  = sorted.length < 3 || totalHistDays < 4;

    // ── 5. MOTOR DE CLASSIFICAÇÃO (ordem decrescente de prioridade) ──────────

    // ── 5.1 DOMINANTE
    // Volume muito alto + mantendo → dono da vertical, escala consolidada
    if (latestCount >= 150 && (c7 === null || c7 > -20)) {
        const growing = c7 !== null && c7 > 5;
        return makeTag('DOMINANT', 'DOMINANTE',
            'text-emerald-300', 'bg-emerald-950/50', 'border-emerald-500/40', 8,
            growing
                ? `Escala consolidada — ${latestCount} ads +${c7.toFixed(0)}% (7d)`
                : `Alta presença estável: ${latestCount} anúncios ativos`,
            'Estudar estratégia e criativos', 'high');
    }

    // ── 5.2 ESCALA CONFIRMADA
    // Alto volume + multiConfirm + crescimento consecutivo = escala real sem dúvida
    if (latestCount >= 60 && multiConfirm && c7 >= 20 && consGrowth >= 2) {
        return makeTag('SCALING_CONFIRMED', 'ESCALA CONFIRMADA',
            'text-green-400', 'bg-green-950/50', 'border-green-500/40', 7,
            `+${c7.toFixed(0)}% (7d) | confirmado 3d+14d | ${consGrowth} leituras consecutivas ↑`,
            'Copiar estrutura da campanha', 'high');
    }

    // ── 5.3 ESCALANDO
    // Crescimento forte com volume relevante
    if (latestCount >= 40 && c7 !== null && c7 >= 30) {
        return makeTag('SCALING', 'ESCALANDO',
            'text-green-400', 'bg-green-950/50', 'border-green-500/40', 6,
            `Crescendo +${c7.toFixed(0)}% em 7 dias — ${latestCount} ads ativos`,
            'Monitorar frequência, aumentar rastreio', 'high');
    }

    // ── 5.4 ACELERANDO  ← sinal mais precoce e valioso de início de escala
    // A taxa de crescimento nos últimos 3d supera a dos últimos 7d
    // → anunciante acabou de escalar o orçamento
    if (isAccelerating && latestCount >= 15 && c3 > 10) {
        return makeTag('ACCELERATING', 'ACELERANDO',
            'text-lime-400', 'bg-lime-950/50', 'border-lime-500/40', 6,
            `Taxa 3d (${c3.toFixed(0)}%) > Taxa 7d (${c7 !== null ? c7.toFixed(0) : '?'}%) — começando a escalar`,
            'Início de escala detectado, fique de olho', 'medium');
    }

    // ── 5.5 ESGOTANDO
    // Estava alto, agora caindo continuamente do pico = fadiga de criativo
    if (peakCount >= 50 && dropFromPeak >= 35 && consDecline >= 2) {
        return makeTag('EXHAUSTING', 'ESGOTANDO',
            'text-orange-400', 'bg-orange-950/50', 'border-orange-500/40', 2,
            `${dropFromPeak.toFixed(0)}% abaixo do pico de ${peakCount} ads — reduzindo presença`,
            'Possível troca de criativo ou produto', 'medium');
    }

    // ── 5.6 MORRENDO
    // Queda acelerada e severa = campanha sendo desligada
    if (c7 !== null && c7 <= -40) {
        return makeTag('DYING', 'MORRENDO',
            'text-red-400', 'bg-red-950/50', 'border-red-500/40', 1,
            `Queda de ${Math.abs(c7).toFixed(0)}% em 7 dias (${latestCount} ads restantes)`,
            'Campanha encerrando ou pivotando', 'high');
    }

    // ── 5.7 VALIDANDO
    // Crescimento moderado e consistente = encontrou algo que funciona, testando escala
    if (latestCount >= 15 && c7 !== null && c7 >= 10 && c7 < 30) {
        return makeTag('VALIDATING', 'VALIDANDO',
            'text-sky-400', 'bg-sky-950/50', 'border-sky-500/40', 4,
            `Crescimento consistente: +${c7.toFixed(0)}% (7d) — testando capacidade de escala`,
            'Avaliar potencial de escala', 'medium');
    }

    // ── 5.8 TESTANDO CRIATIVOS
    // Oscilação (criação e pausa de ads) = A/B testing ativo, buscando criativo vencedor
    if (isOscillating && latestCount >= 5 && latestCount < 80) {
        return makeTag('CREATIVE_TESTING', 'TESTANDO CRIATIVOS',
            'text-yellow-400', 'bg-yellow-950/50', 'border-yellow-500/40', 3,
            `Oscilação detectada (CV: ${cv7.toFixed(0)}%) — criação e pausa de ads ativos`,
            'Aguardar definição de criativo vencedor', 'medium');
    }

    // ── 5.9 LANÇAMENTO
    // Histórico muito recente, ainda acumulando dados
    if (isDataSparse && latestCount > 0) {
        return makeTag('LAUNCH', 'LANÇAMENTO',
            'text-blue-400', 'bg-blue-950/50', 'border-blue-500/40', 4,
            `${sorted.length} leitura${sorted.length === 1 ? '' : 's'} — acumulando histórico`,
            'Aguardar mais dados para classificar', 'low');
    }

    // ── 5.10 ESTÁVEL
    // Volume razoável + variação mínima = mantendo posição sem escalar
    if (latestCount >= 30 && c7 !== null && Math.abs(c7) < 15) {
        return makeTag('STABLE', 'ESTÁVEL',
            'text-cyan-400', 'bg-cyan-950/50', 'border-cyan-500/40', 3,
            `Mantendo: ${latestCount} ads | variação ${c7 >= 0 ? '+' : ''}${c7.toFixed(0)}% (7d)`,
            'Manter monitoramento regular', 'medium');
    }

    // ── 5.11 BAIXO
    // Volume insuficiente para tirar conclusões
    if (latestCount > 0 && latestCount < 15) {
        return makeTag('LOW', 'BAIXO',
            'text-slate-400', 'bg-slate-900/40', 'border-slate-600/40', 1,
            `Volume baixo: ${latestCount} anúncios — insuficiente para análise`,
            'Aguardar crescimento', 'low');
    }

    // ── 5.12 OBSERVAR (fallback)
    return makeTag('OBSERVE', 'OBSERVAR',
        'text-slate-400', 'bg-slate-900/40', 'border-slate-600/40', 2,
        'Aguardando mais dados para classificar com confiança',
        'Coletar mais leituras', 'low');
};
