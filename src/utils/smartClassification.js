/**
 * Sistema Inteligente de Classificação de Ofertas
 * Analisa performance e classifica automaticamente em categorias estratégicas
 */

import { getSafeDate } from './helpers';

/**
 * Classifica uma oferta baseado em múltiplos fatores de performance
 * @param {Array} adCountsHistory - Histórico de contagens de anúncios
 * @param {Object} options - Opções de configuração
 * @returns {Object} Classificação com status, label, cores e detalhes
 */
export const smartClassifyOffer = (adCountsHistory = [], options = {}) => {
    const {
        minAdsForTesting = 10,        // Mínimo de ads para considerar "testando"
        minAdsForScaling = 50,         // Mínimo de ads para considerar "escalando"
        growthThreshold = 20,          // % de crescimento para considerar crescimento significativo
        declineThreshold = -30,         // % de queda para considerar "morrendo"
        minDaysForValidation = 3,      // Dias mínimos para validar
        stabilityThreshold = 10,       // % de variação para considerar estável
        rapidGrowthThreshold = 50,     // % de crescimento rápido
        rapidDeclineThreshold = -50    // % de queda rápida
    } = options;

    // Caso 1: Sem dados
    if (!adCountsHistory || adCountsHistory.length === 0) {
        return {
            status: 'NO_DATA',
            label: 'SEM DADOS',
            color: 'text-gray-400',
            bgColor: 'bg-gray-900/30',
            borderColor: 'border-gray-500/50',
            priority: 0,
            description: 'Aguardando primeiro scraping'
        };
    }

    const sortedHistory = [...adCountsHistory].sort((a, b) => {
        const dateA = getSafeDate(a.timestamp);
        const dateB = getSafeDate(b.timestamp);
        return (dateB || 0) - (dateA || 0);
    });

    const latest = sortedHistory[0];
    if (!latest || typeof latest.count !== 'number') {
        return {
            status: 'NO_DATA',
            label: 'SEM DADOS',
            color: 'text-gray-400',
            bgColor: 'bg-gray-900/30',
            borderColor: 'border-gray-500/50',
            priority: 0,
            description: 'Dados inválidos'
        };
    }

    const latestCount = latest.count;
    const latestDate = getSafeDate(latest.timestamp);
    if (!latestDate) {
        return {
            status: 'NO_DATA',
            label: 'SEM DADOS',
            color: 'text-gray-400',
            bgColor: 'bg-gray-900/30',
            borderColor: 'border-gray-500/50',
            priority: 0,
            description: 'Data inválida'
        };
    }

    // Análise de períodos
    const now = new Date();
    const daysSinceFirst = Math.floor((now - getSafeDate(sortedHistory[sortedHistory.length - 1]?.timestamp || latestDate)) / (1000 * 60 * 60 * 24));
    const daysSinceLatest = Math.floor((now - latestDate) / (1000 * 60 * 60 * 24));

    // Análise de 7 dias
    const sevenDaysAgo = new Date(latestDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const entries7d = sortedHistory.filter(e => {
        const ed = getSafeDate(e.timestamp);
        return ed && ed >= sevenDaysAgo && ed <= latestDate;
    }).reverse();

    // Análise de 3 dias (curto prazo)
    const threeDaysAgo = new Date(latestDate);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const entries3d = sortedHistory.filter(e => {
        const ed = getSafeDate(e.timestamp);
        return ed && ed >= threeDaysAgo && ed <= latestDate;
    }).reverse();

    // Análise de 14 dias (médio prazo)
    const fourteenDaysAgo = new Date(latestDate);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const entries14d = sortedHistory.filter(e => {
        const ed = getSafeDate(e.timestamp);
        return ed && ed >= fourteenDaysAgo && ed <= latestDate;
    }).reverse();

    // Calcular mudanças percentuais
    const change7d = entries7d.length >= 2 
        ? calculateChange(entries7d[0]?.count, latestCount)
        : null;
    
    const change3d = entries3d.length >= 2
        ? calculateChange(entries3d[0]?.count, latestCount)
        : null;

    const change14d = entries14d.length >= 2
        ? calculateChange(entries14d[0]?.count, latestCount)
        : null;

    // Calcular tendência (últimas 3 medições)
    const recent3 = sortedHistory.slice(0, 3).reverse();
    const trend = calculateTrend(recent3);

    // Calcular estabilidade (desvio padrão relativo)
    const stability = calculateStability(entries7d);

    // REGRAS DE CLASSIFICAÇÃO (em ordem de prioridade)

    // 1. MORRENDO - Queda rápida e significativa
    if (change7d !== null && change7d <= rapidDeclineThreshold) {
        return {
            status: 'DYING',
            label: 'MORRENDO',
            color: 'text-red-500',
            bgColor: 'bg-red-900/40',
            borderColor: 'border-red-600/60',
            priority: 1,
            description: `Queda rápida: ${change7d.toFixed(1)}% em 7 dias`,
            action: 'Revisar urgente ou pausar'
        };
    }

    if (change7d !== null && change7d <= declineThreshold && latestCount < minAdsForTesting) {
        return {
            status: 'DYING',
            label: 'MORRENDO',
            color: 'text-red-500',
            bgColor: 'bg-red-900/40',
            borderColor: 'border-red-600/60',
            priority: 1,
            description: `Queda significativa: ${change7d.toFixed(1)}%`,
            action: 'Considerar pausar'
        };
    }

    // 2. ESCALANDO - Crescimento forte e consistente
    if (latestCount >= minAdsForScaling && change7d !== null && change7d >= rapidGrowthThreshold) {
        return {
            status: 'SCALING',
            label: 'ESCALANDO',
            color: 'text-green-500',
            bgColor: 'bg-green-900/40',
            borderColor: 'border-green-600/60',
            priority: 5,
            description: `Crescimento explosivo: +${change7d.toFixed(1)}%`,
            action: 'Aumentar investimento'
        };
    }

    if (latestCount >= minAdsForScaling && change7d !== null && change7d >= growthThreshold && trend === 'up') {
        return {
            status: 'SCALING',
            label: 'ESCALANDO',
            color: 'text-green-500',
            bgColor: 'bg-green-900/40',
            borderColor: 'border-green-600/60',
            priority: 5,
            description: `Crescimento consistente: +${change7d.toFixed(1)}%`,
            action: 'Manter ou aumentar investimento'
        };
    }

    // 3. VALIDANDO - Crescimento inicial promissor
    if (latestCount >= minAdsForTesting && latestCount < minAdsForScaling) {
        if (change7d !== null && change7d >= growthThreshold) {
            return {
                status: 'VALIDATING',
                label: 'VALIDANDO',
                color: 'text-blue-500',
                bgColor: 'bg-blue-900/40',
                borderColor: 'border-blue-600/60',
                priority: 4,
                description: `Crescimento promissor: +${change7d.toFixed(1)}%`,
                action: 'Monitorar de perto'
            };
        }

        if (change7d !== null && change7d >= 0 && change7d < growthThreshold && stability < stabilityThreshold) {
            return {
                status: 'VALIDATING',
                label: 'VALIDANDO',
                color: 'text-blue-500',
                bgColor: 'bg-blue-900/40',
                borderColor: 'border-blue-600/60',
                priority: 4,
                description: `Estável com potencial: ${change7d >= 0 ? '+' : ''}${change7d.toFixed(1)}%`,
                action: 'Aguardar mais dados'
            };
        }
    }

    // 4. TESTANDO - Em fase inicial de testes
    if (latestCount >= minAdsForTesting && latestCount < minAdsForScaling) {
        if (daysSinceFirst <= 7 || entries7d.length < minDaysForValidation) {
            return {
                status: 'TESTING',
                label: 'TESTANDO',
                color: 'text-yellow-500',
                bgColor: 'bg-yellow-900/40',
                borderColor: 'border-yellow-600/60',
                priority: 3,
                description: 'Fase inicial de testes',
                action: 'Coletar mais dados'
            };
        }

        if (change7d !== null && change7d < 0 && change7d > declineThreshold) {
            return {
                status: 'TESTING',
                label: 'TESTANDO',
                color: 'text-yellow-500',
                bgColor: 'bg-yellow-900/40',
                borderColor: 'border-yellow-600/60',
                priority: 3,
                description: `Queda leve: ${change7d.toFixed(1)}%`,
                action: 'Ajustar estratégia'
            };
        }
    }

    // 5. ESTÁVEL - Performance consistente
    if (latestCount >= minAdsForScaling && stability < stabilityThreshold && 
        change7d !== null && change7d >= -stabilityThreshold && change7d <= stabilityThreshold) {
        return {
            status: 'STABLE',
            label: 'ESTÁVEL',
            color: 'text-cyan-500',
            bgColor: 'bg-cyan-900/40',
            borderColor: 'border-cyan-600/60',
            priority: 3,
            description: 'Performance estável',
            action: 'Manter estratégia atual'
        };
    }

    // 6. OBSERVAR - Situação ambígua
    if (latestCount >= minAdsForTesting) {
        return {
            status: 'OBSERVE',
            label: 'OBSERVAR',
            color: 'text-purple-500',
            bgColor: 'bg-purple-900/40',
            borderColor: 'border-purple-600/60',
            priority: 2,
            description: 'Necessita análise mais profunda',
            action: 'Revisar métricas'
        };
    }

    // 7. BAIXO - Volume insuficiente
    if (latestCount > 0 && latestCount < minAdsForTesting) {
        return {
            status: 'LOW',
            label: 'BAIXO',
            color: 'text-orange-500',
            bgColor: 'bg-orange-900/40',
            borderColor: 'border-orange-600/60',
            priority: 2,
            description: `Volume baixo: ${latestCount} anúncios`,
            action: 'Aguardar crescimento ou revisar'
        };
    }

    // 8. SEM DADOS (fallback)
    return {
        status: 'NO_DATA',
        label: 'SEM DADOS',
        color: 'text-gray-400',
        bgColor: 'bg-gray-900/30',
        borderColor: 'border-gray-500/50',
        priority: 0,
        description: 'Aguardando dados'
    };
};

/**
 * Calcula mudança percentual entre dois valores
 */
function calculateChange(oldValue, newValue) {
    if (!oldValue || oldValue === 0) {
        if (newValue > 0) return Infinity;
        return 0;
    }
    return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Calcula tendência (up, down, stable) baseado nas últimas medições
 */
function calculateTrend(entries) {
    if (entries.length < 2) return 'stable';
    
    const counts = entries.map(e => e.count || 0);
    let upCount = 0;
    let downCount = 0;
    
    for (let i = 1; i < counts.length; i++) {
        if (counts[i] > counts[i - 1]) upCount++;
        else if (counts[i] < counts[i - 1]) downCount++;
    }
    
    if (upCount > downCount) return 'up';
    if (downCount > upCount) return 'down';
    return 'stable';
}

/**
 * Calcula estabilidade (desvio padrão relativo)
 */
function calculateStability(entries) {
    if (entries.length < 2) return 100;
    
    const counts = entries.map(e => e.count || 0);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (mean === 0) return 100;
    
    const variance = counts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = (stdDev / mean) * 100;
    
    return coefficientOfVariation;
}
