import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Eye, Trash2, CreditCard as Edit3, ExternalLink, Archive, ArchiveRestore, Pin, PinOff, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { HACKER_COLORS } from '../../styles/theme';
import { getSafeTimestamp, getSafeDate, formatDateForAxis } from '../../utils/helpers';
import { analyzeOfferPerformance } from '../../utils/helpers';
import { smartClassifyOffer } from '../../utils/smartClassification';

const OfferCard = ({ offer, onViewDetails, onEditOffer, onToggleArchive, onDeleteOffer, userId, supabaseClient, isPinned, onPin, onUnpin, isActive, onToggleActive, fetchOffers, showToast }) => {
    const [adCountsHistory, setAdCountsHistory] = useState([]);
    const [isScrapingRunning, setIsScrapingRunning] = useState(false);
    
    // Função para buscar histórico de ad_counts
    const fetchAdCounts = useCallback(async () => {
        if (!userId || !supabaseClient || !supabaseClient.from) return;
        
        const { data, error } = await supabaseClient
            .from('ad_counts')
            .select('count, timestamp')
            .eq('offer_id', offer.id)
            .order('timestamp', { ascending: false })
            .limit(15);
            
        if (error) {
            console.error("Supabase Error fetching ad_counts for card:", error.message);
        } else {
            setAdCountsHistory(data || []);
        }
    }, [offer.id, userId, supabaseClient]);
    
    useEffect(() => {
        fetchAdCounts();
    }, [fetchAdCounts]);
    
    // Atualiza o histórico quando o offer.last_ad_count ou offer.last_ad_count_timestamp mudarem
    useEffect(() => {
        // Força atualização do histórico quando o offer for atualizado
        if (offer.last_ad_count !== null && offer.last_ad_count !== undefined && offer.last_ad_count_timestamp) {
            // Verifica se o último valor do offer está no histórico com timestamp similar
            const hasLatestInHistory = adCountsHistory.some(ac => {
                const countMatch = ac.count === offer.last_ad_count;
                if (!countMatch) return false;
                
                // Verifica se o timestamp está próximo (dentro de 2 minutos)
                const acTime = new Date(ac.timestamp).getTime();
                const offerTime = new Date(offer.last_ad_count_timestamp).getTime();
                return Math.abs(acTime - offerTime) < 120000; // 2 minutos
            });
            
            // Se o último valor do offer não está no histórico, força refetch
            if (!hasLatestInHistory) {
                // Aguarda um pouco para garantir que o banco foi atualizado
                const timeoutId = setTimeout(() => {
                    fetchAdCounts();
                }, 1000);
                return () => clearTimeout(timeoutId);
            }
        }
    }, [offer.last_ad_count, offer.last_ad_count_timestamp, adCountsHistory, fetchAdCounts]);
    
    // Polling para atualizar o histórico quando o timestamp for recente (últimos 5 minutos)
    // Isso garante que os cards sejam atualizados mesmo quando o scraping é feito em massa
    useEffect(() => {
        if (!offer.last_ad_count_timestamp) return;
        
        const timestamp = new Date(offer.last_ad_count_timestamp).getTime();
        const now = Date.now();
        const age = now - timestamp;
        
        // Se o timestamp é recente (últimos 5 minutos), faz polling a cada 5 segundos
        if (age < 300000) { // 5 minutos
            const interval = setInterval(() => {
                fetchAdCounts();
            }, 5000); // A cada 5 segundos
            
            return () => clearInterval(interval);
        }
    }, [offer.last_ad_count_timestamp, fetchAdCounts]); 

    // Análise inteligente de classificação
    const smartClassification = useMemo(
        () => smartClassifyOffer(adCountsHistory),
        [adCountsHistory]
    );

    // Mantém análise antiga para compatibilidade (variação 7d)
    const performanceAnalysis = useMemo(
        () => analyzeOfferPerformance(adCountsHistory, 7), 
        [adCountsHistory]
    ); 
    
    // Função para executar scraping local
    const handleLocalScraping = useCallback(async () => {
        if (!offer?.link || !offer.link.includes('facebook.com/ads/library')) {
            showToast && showToast("Este target não tem link da Biblioteca do Facebook", "error");
            return;
        }
        
        setIsScrapingRunning(true);
        showToast && showToast("🤖 Iniciando scraping automático... Isso pode levar até 2 minutos.", "info");
        
        const scraperUrl = 'http://localhost:3001/api/scrape/test';
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            
            const response = await fetch(scraperUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: offer.link }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.adCount !== null) {
                // Adiciona a contagem automaticamente
                const { error: adCountInsertError } = await supabaseClient
                    .from('ad_counts')
                    .insert([{ 
                        offer_id: offer.id, 
                        count: data.adCount, 
                        user_id: userId, 
                        timestamp: new Date().toISOString() 
                    }])
                    .select();
                    
                if (adCountInsertError) throw adCountInsertError;
                
                const { error: offerUpdateError } = await supabaseClient
                    .from('offers')
                    .update({ 
                        last_ad_count: data.adCount, 
                        last_ad_count_timestamp: new Date().toISOString() 
                    })
                    .eq('id', offer.id);
                
                if (offerUpdateError) throw offerUpdateError;
                
                showToast && showToast(`✅ Scraping concluído! ${data.adCount} anúncios encontrados`, "success");
                
                // Atualiza o histórico imediatamente
                await fetchAdCounts();
                
                // Atualiza a lista de offers
                if (fetchOffers) {
                    setTimeout(() => {
                        fetchOffers();
                    }, 500);
                }
                
                setIsScrapingRunning(false);
            } else {
                throw new Error(data.error || 'Não foi possível extrair dados');
            }
        } catch (error) {
            console.error('[SCRAPING] Erro:', error);
            
            let errorMessage = 'Não foi possível conectar ao scraper local.';
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage = 'Serviço local não está rodando. Inicie o scraper: cd scraper-service && npm start';
            } else if (error.name === 'AbortError') {
                errorMessage = 'Timeout: O scraper demorou muito para responder. Tente novamente.';
            } else {
                errorMessage = `Erro: ${error.message}`;
            }
            
            showToast && showToast(`❌ ${errorMessage}`, "error");
            setIsScrapingRunning(false);
        }
    }, [offer, userId, supabaseClient, fetchAdCounts, fetchOffers, showToast]);
    
    // Prioriza offer.last_ad_count porque é atualizado diretamente após scraping
    // Se não existir, usa o histórico
    const latestAdCount = offer.last_ad_count ?? adCountsHistory[0]?.count ?? 0; 
    
    const previousEntryCount = adCountsHistory[1]?.count;
    let dailyPercentageChangeDisplay = null;
    let dailyChangeColor = HACKER_COLORS.textDim;

    if (typeof previousEntryCount === 'number' && previousEntryCount !== null) {
        if (previousEntryCount === 0 && latestAdCount > 0) {
            dailyPercentageChangeDisplay = "+∞"; 
            dailyChangeColor = "text-green-400";
        } else if (previousEntryCount > 0) {
            const change = ((latestAdCount - previousEntryCount) / previousEntryCount) * 100;
            dailyPercentageChangeDisplay = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
            if (change > 0) dailyChangeColor = "text-green-400";
            else if (change < 0) dailyChangeColor = "text-red-400";
            else dailyChangeColor = "text-gray-400";
        } else if (previousEntryCount === 0 && latestAdCount === 0) {
            dailyPercentageChangeDisplay = "0%";
            dailyChangeColor = "text-gray-400";
        }
    }

    // Format creation date for display
    const formatCreationDate = (dateString) => {
        const date = getSafeDate(dateString);
        if (!date) return 'N/A';
        
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) return 'Hoje';
        if (diffDays === 2) return 'Ontem';
        if (diffDays <= 7) return `${diffDays - 1}d`;
        if (diffDays <= 30) return `${Math.floor(diffDays / 7)}sem`;
        if (diffDays <= 365) return `${Math.floor(diffDays / 30)}m`;
        return `${Math.floor(diffDays / 365)}a`;
    };

    // Usa classificação inteligente
    const statusInfo = {
        color: smartClassification.color,
        bgColor: smartClassification.bgColor,
        borderColor: smartClassification.borderColor,
        label: smartClassification.label
    };

    return (
        <div className={`
            relative ${HACKER_COLORS.cardBg} backdrop-blur-md ${HACKER_COLORS.cardBorder} rounded-2xl 
            ${HACKER_COLORS.transition} ${HACKER_COLORS.cardShadow}
            hover:scale-[1.02] hover:${HACKER_COLORS.cardShadowHover} hover:${HACKER_COLORS.cardGlowHover}
            ${isPinned 
                ? 'border-blue-400/60 shadow-blue-500/30 shadow-2xl bg-gradient-to-br from-blue-950/40 via-slate-900/90 to-blue-950/40 ring-2 ring-blue-400/30' 
                : offer.is_archived 
                    ? 'border-slate-700/30 opacity-50 grayscale-[0.3]' 
                    : 'hover:border-blue-500/40'
            }
            w-full h-full flex flex-col overflow-hidden group
        `}>
            {/* Header with title and creation date */}
            <div className="p-5 pb-4 flex-shrink-0 border-b border-slate-700/30">
                <div className="flex items-start justify-between mb-3">
                    <h3 className={`text-base font-bold truncate pr-2 ${isPinned ? 'text-blue-300' : HACKER_COLORS.textBase} group-hover:text-blue-400 ${HACKER_COLORS.transitionFast}`} title={offer.name}>
                        {offer.name}
                    </h3>
                    <span className={`text-xs ${HACKER_COLORS.textDim} ${HACKER_COLORS.surfaceLighter} px-2.5 py-1 rounded-lg whitespace-nowrap flex-shrink-0 border ${HACKER_COLORS.borderDim}`}>
                        {formatCreationDate(offer.created_at)}
                    </span>
                </div>
                
                {/* Status and Active badges */}
                <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-lg border text-xs font-semibold ${statusInfo.bgColor} ${statusInfo.borderColor} ${statusInfo.color} ${HACKER_COLORS.transitionFast}`}>
                        {statusInfo.label}
                    </span>
                    {isActive && (
                        <span className={`text-xs text-cyan-300 bg-cyan-950/50 px-3 py-1.5 rounded-lg font-semibold border border-cyan-500/30 ${HACKER_COLORS.successGlow}`}>
                            ATIVA
                        </span>
                    )}
                </div>
            </div>

            {/* Main metrics */}
            <div className="px-5 pb-4 flex-shrink-0">
                <div className="flex items-baseline gap-3 mb-2">
                    <span className={`text-3xl font-extrabold ${HACKER_COLORS.textBase} ${HACKER_COLORS.transitionFast} group-hover:text-blue-400`}>{latestAdCount}</span>
                    {dailyPercentageChangeDisplay && (
                        <span className={`text-sm font-bold px-2 py-0.5 rounded-md ${dailyChangeColor} ${dailyChangeColor.includes('green') ? 'bg-emerald-950/30' : dailyChangeColor.includes('red') ? 'bg-red-950/30' : 'bg-slate-800/30'}`}>
                            {dailyPercentageChangeDisplay}
                        </span>
                    )}
                </div>
                <p className={`text-xs ${HACKER_COLORS.textDim} mb-3 font-medium uppercase tracking-wider`}>ANÚNCIOS ATIVOS</p>
                
                {/* Performance details */}
                {performanceAnalysis.weeklyChange !== "N/A" && (
                    <div className={`text-xs mb-4 p-2 rounded-lg ${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim}`}>
                        <span className={HACKER_COLORS.textDim}>Variação 7d: </span>
                        <span className={`font-bold ${
                            parseFloat(performanceAnalysis.weeklyChange) > 0 
                                ? 'text-emerald-400' 
                                : parseFloat(performanceAnalysis.weeklyChange) < 0 
                                    ? 'text-red-400' 
                                    : HACKER_COLORS.textDim
                        }`}>
                            {performanceAnalysis.weeklyChange}
                        </span>
                    </div>
                )}
                
                {/* Mini Performance Chart */}
                {adCountsHistory.length > 0 && (
                    <div className="mt-4 mb-2 p-2 rounded-lg bg-slate-900/50 border border-slate-700/30">
                        <div className="h-20 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart 
                                    data={adCountsHistory.slice().reverse().map(ac => ({
                                        timestamp: formatDateForAxis(ac.timestamp),
                                        count: ac.count
                                    }))}
                                    margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
                                >
                                    <Line 
                                        type="monotone" 
                                        dataKey="count" 
                                        stroke="#60A5FA" 
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{ r: 4, fill: '#60A5FA', stroke: '#1F2937', strokeWidth: 2 }}
                                        animationDuration={800}
                                    />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: '#0F172A', 
                                            border: '1px solid #3B82F6', 
                                            borderRadius: '8px',
                                            padding: '6px 10px',
                                            fontSize: '11px',
                                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
                                        }} 
                                        labelStyle={{ color: '#60A5FA', fontSize: '10px', fontWeight: 'bold' }}
                                        cursor={{ stroke: '#60A5FA', strokeWidth: 1, strokeDasharray: '3 3' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>

            {/* Last update */}
            <div className={`px-5 pb-4 text-xs ${HACKER_COLORS.textMuted} flex-shrink-0 border-t border-slate-700/30 pt-3`}>
                <span className={HACKER_COLORS.textDim}>Atualizado: </span>
                <span className={HACKER_COLORS.textBase}>{getSafeTimestamp(offer.last_ad_count_timestamp) || 'Nunca'}</span>
            </div>

            {/* Action buttons - always at bottom */}
            <div className="mt-auto p-5 pt-3 border-t border-slate-700/30">
                <div className="grid grid-cols-2 gap-3 mb-3">
                    {offer?.link && offer.link.includes('facebook.com/ads/library') ? (
                        <button 
                            onClick={handleLocalScraping}
                            disabled={isScrapingRunning}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold ${HACKER_COLORS.transition} flex items-center justify-center gap-1.5 ${
                                isScrapingRunning 
                                    ? 'bg-purple-800/60 cursor-not-allowed opacity-60 text-white' 
                                    : `${HACKER_COLORS.buttonSecondaryBg} ${HACKER_COLORS.buttonSecondaryText} ${HACKER_COLORS.buttonSecondaryShadow}`
                            }`}
                            title="Executar scraping local"
                        >
                            <RefreshCw size={14} className={isScrapingRunning ? 'animate-spin' : ''} />
                            {isScrapingRunning ? 'SCRAP...' : 'SCRAP LOCAL'}
                        </button>
                    ) : (
                        <button 
                            onClick={() => onToggleActive(offer.id)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold ${HACKER_COLORS.transition} ${
                                isActive 
                                    ? `${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.buttonPrimaryShadow}` 
                                    : `${HACKER_COLORS.surfaceLighter} text-blue-300 border ${HACKER_COLORS.borderPrimary} hover:${HACKER_COLORS.sidebarItemHover} hover:border-blue-400/60`
                            }`}
                        >
                            {isActive ? 'RODANDO' : 'ATIVAR'}
                        </button>
                    )}
                    <button 
                        onClick={(e) => {
                            e.preventDefault();
                            const currentUrl = window.location.origin + window.location.pathname;
                            const newUrl = `${currentUrl}?view=detail&id=${offer.id}`;
                            window.open(newUrl, '_blank');
                        }}
                        className={`${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.buttonPrimaryShadow} px-4 py-2.5 rounded-xl text-xs font-bold ${HACKER_COLORS.transition} flex items-center justify-center gap-1.5`}
                    >
                        <Eye size={14} />
                        ANALISAR
                    </button>
                </div>
                
                {/* Secondary actions */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        {offer.link && (
                            <a 
                                href={offer.link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className={`p-2 ${HACKER_COLORS.textDim} hover:text-cyan-400 ${HACKER_COLORS.transitionFast} rounded-lg hover:${HACKER_COLORS.surfaceHover} border border-transparent hover:border-cyan-500/30`}
                                title="Abrir link"
                            >
                                <ExternalLink size={14} />
                            </a>
                        )}
                        <button 
                            onClick={isPinned ? onUnpin : onPin} 
                            className={`p-2 ${HACKER_COLORS.transitionFast} rounded-lg hover:${HACKER_COLORS.surfaceHover} border border-transparent hover:border-blue-500/30 ${isPinned ? 'text-blue-400' : `${HACKER_COLORS.textDim} hover:text-blue-400`}`}
                            title={isPinned ? 'Desafixar' : 'Fixar no topo'}
                        >
                            {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                        <button 
                            onClick={() => onEditOffer(offer)} 
                            className={`p-2 ${HACKER_COLORS.textDim} hover:text-amber-400 ${HACKER_COLORS.transitionFast} rounded-lg hover:${HACKER_COLORS.surfaceHover} border border-transparent hover:border-amber-500/30`}
                            title="Editar"
                        >
                            <Edit3 size={14} />
                        </button>
                        <button 
                            onClick={() => onToggleArchive(offer.id, offer.is_archived)} 
                            className={`p-2 ${HACKER_COLORS.textDim} hover:text-orange-400 ${HACKER_COLORS.transitionFast} rounded-lg hover:${HACKER_COLORS.surfaceHover} border border-transparent hover:border-orange-500/30`}
                            title={offer.is_archived ? "Restaurar" : "Arquivar"}
                        >
                            {offer.is_archived ? <ArchiveRestore size={14}/> : <Archive size={14}/>} 
                        </button>
                    </div>
                    <button 
                        onClick={() => onDeleteOffer(offer.id)} 
                        className={`p-2 ${HACKER_COLORS.textDim} hover:text-red-400 ${HACKER_COLORS.transitionFast} rounded-lg hover:${HACKER_COLORS.surfaceHover} border border-transparent hover:border-red-500/30`}
                        title="Excluir"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OfferCard;