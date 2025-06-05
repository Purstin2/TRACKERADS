export const getSafeTimestamp = (
    timestampField, 
    locale = 'pt-BR', 
    options = { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    }
) => {
    if (!timestampField) return 'N/A';
    const date = new Date(timestampField);
    if (!isNaN(date.getTime())) return date.toLocaleString(locale, options);
    return 'Data inválida';
};

export const getSafeDate = (timestampField) => {
    if (!timestampField) return null;
    const date = new Date(timestampField);
    if (!isNaN(date.getTime())) return date;
    return null;
};

export const formatDateForAxis = (timestampField) => {
    const date = getSafeDate(timestampField);
    if (date) return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return 'N/A';
};

export const analyzeOfferPerformance = (
    adCountsHistory = [], 
    daysToAnalyze = 7, 
    minAdsThreshold = 10, 
    maxDropPercentage = 20
) => { 
    if (!adCountsHistory || adCountsHistory.length === 0) {
        return { 
            status: "NO_DATA", 
            label: "Dados Insuficientes", 
            Icon: null, // Will be imported where used
            color: "text-slate-500", 
            details: "Sem histórico de anúncios.", 
            weeklyChange: "N/A", 
            periodPercentageChange: "N/A" 
        };
    }
    
    const sortedHistory = [...adCountsHistory].sort((a, b) => getSafeDate(b.timestamp) - getSafeDate(a.timestamp));
    const latestEntry = sortedHistory[0];
    
    if (!latestEntry || typeof latestEntry.count !== 'number') {
        return { 
            status: "NO_DATA", 
            label: "Dados Inválidos", 
            Icon: null, // Will be imported where used
            color: "text-slate-500", 
            details: "Último registro inválido.", 
            weeklyChange: "N/A", 
            periodPercentageChange: "N/A" 
        };
    }
    
    const latestCount = latestEntry.count;
    const analysisPeriodEndDate = getSafeDate(latestEntry.timestamp);
    
    if (!analysisPeriodEndDate) {
        return { 
            status: "NO_DATA", 
            label: "Data Inválida", 
            Icon: null, // Will be imported where used
            color: "text-slate-500", 
            details: "Data do último registro inválida.", 
            weeklyChange: "N/A", 
            periodPercentageChange: "N/A" 
        };
    }
    
    const analysisPeriodStartDate = new Date(analysisPeriodEndDate);
    analysisPeriodStartDate.setDate(analysisPeriodStartDate.getDate() - (daysToAnalyze -1)); 
    
    const entriesInPeriod = sortedHistory.filter(entry => {
        const entryDate = getSafeDate(entry.timestamp);
        return entryDate && entryDate >= analysisPeriodStartDate && entryDate <= analysisPeriodEndDate;
    }).reverse(); 
    
    let periodInitialCount = entriesInPeriod[0]?.count;
    let periodPercentageChange = "N/A";
    
    if (entriesInPeriod.length >= 2) {
        if (typeof periodInitialCount === 'number' && periodInitialCount > 0) {
            const change = ((latestCount - periodInitialCount) / periodInitialCount) * 100;
            periodPercentageChange = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
        } else if (typeof periodInitialCount === 'number' && periodInitialCount === 0 && latestCount > 0) {
            periodPercentageChange = "+∞%";
        }
    } else if (entriesInPeriod.length === 1 && latestCount > 0) {
        periodPercentageChange = "Novo";
    }
    
    const weeklyEndDate = getSafeDate(latestEntry.timestamp);
    const weeklyStartDate = new Date(weeklyEndDate);
    weeklyStartDate.setDate(weeklyStartDate.getDate() - 6); 
    
    const entriesInWeek = sortedHistory.filter(entry => { 
        const entryDate = getSafeDate(entry.timestamp); 
        return entryDate && entryDate >= weeklyStartDate && entryDate <= weeklyEndDate; 
    }).reverse(); 
    
    let weeklyInitialCount = entriesInWeek[0]?.count;
    let weeklyChange = "N/A";
    
    if (entriesInWeek.length >= 2) { 
        if (typeof weeklyInitialCount === 'number' && weeklyInitialCount > 0) {
            const change = ((latestCount - weeklyInitialCount) / weeklyInitialCount) * 100;
            weeklyChange = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
        } else if (typeof weeklyInitialCount === 'number' && weeklyInitialCount === 0 && latestCount > 0) {
            weeklyChange = "+∞%";
        }
    } else if (entriesInWeek.length === 1 && latestCount > 0) {
        weeklyChange = "Novo";
    }
    
    const aboveMinAds = latestCount >= minAdsThreshold;
    const numericPeriodPercentageChange = parseFloat(periodPercentageChange); 
    const hasDroppedSignificantly = !isNaN(numericPeriodPercentageChange) && numericPeriodPercentageChange < -maxDropPercentage;
    const isStableOrGrowing = isNaN(numericPeriodPercentageChange) || numericPeriodPercentageChange >= -maxDropPercentage;
    
    let suggestion = { 
        status: "OBSERVE", 
        label: "Observar", 
        Icon: null, // Will be imported where used
        color: "text-cyan-400", 
        details: `Variação (${daysToAnalyze}d): ${periodPercentageChange}.` 
    };
    
    if (entriesInPeriod.length < 2 && entriesInPeriod.length > 0) {
        suggestion = { 
            status: "RECENT_START", 
            label: "Início Recente", 
            Icon: null, // Will be imported where used
            color: "text-fuchsia-400", 
            details: `Primeiros registros nos últimos ${daysToAnalyze} dias.` 
        };
    } else if (entriesInPeriod.length >= 2) {
        if (aboveMinAds && isStableOrGrowing) {
            suggestion = { 
                status: "TEST", 
                label: "Potencial de Teste", 
                Icon: null, // Will be imported where used
                color: "text-green-400", 
                details: `Ads > ${minAdsThreshold}. Variação (${daysToAnalyze}d): ${periodPercentageChange}.` 
            };
        } else if (hasDroppedSignificantly || (latestCount < (minAdsThreshold / 2) && entriesInPeriod.length >= daysToAnalyze)) {
            suggestion = { 
                status: "EXCLUDE_RISK", 
                label: "Risco de Exclusão", 
                Icon: null, // Will be imported where used
                color: "text-red-500", 
                details: `Queda ou performance baixa. Variação (${daysToAnalyze}d): ${periodPercentageChange}.` 
            };
        } else if (!aboveMinAds && entriesInPeriod.length >= daysToAnalyze) {
            suggestion = { 
                status: "LOW_PERFORMANCE", 
                label: "Baixa Performance", 
                Icon: null, // Will be imported where used
                color: "text-yellow-400", 
                details: `Ads < ${minAdsThreshold}. Variação (${daysToAnalyze}d): ${periodPercentageChange}.` 
            };
        }
    }
    
    return { 
        ...suggestion, 
        weeklyChange, 
        periodPercentageChange, 
        daysAnalyzed: entriesInPeriod.length > 0 ? daysToAnalyze : 0 
    };
};