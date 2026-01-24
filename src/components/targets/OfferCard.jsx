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
            hover:scale-[1.01] hover:${HACKER_COLORS.cardShadowHover} hover:${HACKER_COLORS.cardGlowHover}
            ${isPinned 
                ? 'border-blue-400/70 shadow-blue-500/40 shadow-2xl bg-gradient-to-br from-blue-950/50 via-slate-900/95 to-blue-950/50 ring-2 ring-blue-400/40' 
                : offer.is_archived 
                    ? 'border-slate-700/20 opacity-50 grayscale-[0.3]' 
                    : 'hover:border-blue-500/50'
            }
            w-full flex flex-col overflow-hidden group
        `}>
            {/* Header - Título e Status */}
            <div className="p-5 pb-4 flex-shrink-0">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                        <h3 className={`text-base font-bold truncate ${isPinned ? HACKER_COLORS.primaryBright : HACKER_COLORS.textBase} group-hover:${HACKER_COLORS.primaryBright} ${HACKER_COLORS.transitionFast} mb-1`} title={offer.name}>
                            {offer.name}
                        </h3>
                        <span className={`text-xs ${HACKER_COLORS.textMuted} font-medium`}>
                            {formatCreationDate(offer.created_at)}
                        </span>
                    </div>
                    {isActive && (
                        <span className={`text-xs ${HACKER_COLORS.primaryBright} bg-blue-950/60 px-2 py-1 rounded-md font-bold border border-blue-400/40 ml-2 flex-shrink-0`}>
                            ATIVA
                        </span>
                    )}
                </div>
                
                {/* Status badge */}
                <div className="flex items-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-bold ${statusInfo.bgColor} ${statusInfo.borderColor} ${statusInfo.color} ${HACKER_COLORS.transitionFast}`}>
                        {statusInfo.label}
                    </span>
                </div>
            </div>

            {/* Main metrics - Destaque principal */}
            <div className="px-5 pb-4 flex-shrink-0 border-t border-slate-700/20 pt-4">
                <div className="mb-2">
                    <p className={`text-xs ${HACKER_COLORS.textMuted} font-semibold uppercase tracking-wide mb-2`}>ANÚNCIOS ATIVOS</p>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-3xl font-black ${HACKER_COLORS.textBase} ${HACKER_COLORS.transitionFast} group-hover:${HACKER_COLORS.primaryBright}`}>{latestAdCount}</span>
                        {dailyPercentageChangeDisplay && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${dailyChangeColor} ${dailyChangeColor.includes('green') ? 'bg-emerald-950/30' : dailyChangeColor.includes('red') ? 'bg-red-950/30' : 'bg-slate-800/30'}`}>
                                {dailyPercentageChangeDisplay}
                            </span>
                        )}
                    </div>
                </div>
                
                {/* Variação 7d - Compacto */}
                {performanceAnalysis.weeklyChange !== "N/A" && (
                    <div className={`text-xs mt-3 pt-3 border-t border-slate-700/20`}>
                        <span className={HACKER_COLORS.textMuted}>Variação 7d: </span>
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
            </div>

            {/* Mini Performance Chart - Seção dedicada */}
            {adCountsHistory.length > 0 && (
                <div className="px-5 pb-4 flex-shrink-0 border-t border-slate-700/20 pt-4">
                    <div className="h-20 w-full rounded-lg bg-gradient-to-br from-slate-900/60 to-blue-950/20 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart 
                                data={adCountsHistory.slice().reverse().map(ac => ({
                                    timestamp: formatDateForAxis(ac.timestamp),
                                    count: ac.count
                                }))}
                                margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
                            >
                                <defs>
                                    <linearGradient id={`gradientBlue-${offer.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.9}/>
                                        <stop offset="50%" stopColor="#3B82F6" stopOpacity={0.4}/>
                                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.1}/>
                                    </linearGradient>
                                </defs>
                                <Line 
                                    type="monotone" 
                                    dataKey="count" 
                                    stroke="#3B82F6" 
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 5, fill: '#3B82F6', stroke: '#0F172A', strokeWidth: 2 }}
                                    animationDuration={1000}
                                />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: '#0F172A', 
                                        border: '1px solid #3B82F6', 
                                        borderRadius: '8px',
                                        padding: '6px 10px',
                                        fontSize: '11px',
                                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                                    }} 
                                    labelStyle={{ color: '#60A5FA', fontSize: '10px', fontWeight: 'bold' }}
                                    cursor={{ stroke: '#3B82F6', strokeWidth: 1.5, strokeDasharray: '3 3' }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Footer - Info e ações */}
            <div className="mt-auto border-t border-slate-700/20">
                {/* Last update */}
                <div className={`px-5 py-3 text-xs ${HACKER_COLORS.textMuted} border-b border-slate-700/20`}>
                    <span className={HACKER_COLORS.textMuted}>Atualizado: </span>
                    <span className={`${HACKER_COLORS.textBase} font-medium`}>{getSafeTimestamp(offer.last_ad_count_timestamp) || 'Nunca'}</span>
                </div>

                {/* Action buttons */}
                <div className="p-4">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        {offer?.link && offer.link.includes('facebook.com/ads/library') ? (
                            <button 
                                onClick={handleLocalScraping}
                                disabled={isScrapingRunning}
                                className={`px-3 py-2 rounded-lg text-xs font-bold ${HACKER_COLORS.transition} flex items-center justify-center gap-1.5 ${
                                    isScrapingRunning 
                                        ? 'bg-purple-800/60 cursor-not-allowed opacity-60 text-white' 
                                        : `${HACKER_COLORS.buttonSecondaryBg} ${HACKER_COLORS.buttonSecondaryText} ${HACKER_COLORS.buttonSecondaryShadow}`
                                }`}
                                title="Executar scraping local"
                            >
                                <RefreshCw size={12} className={isScrapingRunning ? 'animate-spin' : ''} />
                                {isScrapingRunning ? 'SCRAP...' : 'SCRAP'}
                            </button>
                        ) : (
                            <button 
                                onClick={() => onToggleActive(offer.id)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold ${HACKER_COLORS.transition} ${
                                    isActive 
                                        ? `${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.buttonPrimaryShadow}` 
                                        : `${HACKER_COLORS.surfaceLighter} text-blue-300 border ${HACKER_COLORS.borderPrimary} hover:${HACKER_COLORS.sidebarItemHover} hover:border-blue-400/60`
                                }`}
                            >
                                {isActive ? 'ON' : 'OFF'}
                            </button>
                        )}
                        <button 
                            onClick={(e) => {
                                e.preventDefault();
                                const currentUrl = window.location.origin + window.location.pathname;
                                const newUrl = `${currentUrl}?view=detail&id=${offer.id}`;
                                window.open(newUrl, '_blank');
                            }}
                            className={`${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.buttonPrimaryShadow} px-3 py-2 rounded-lg text-xs font-bold ${HACKER_COLORS.transition} flex items-center justify-center gap-1.5`}
                        >
                            <Eye size={12} />
                            VER
                        </button>
                    </div>
                    
                    {/* Secondary actions - Compacto */}
                    <div className="flex items-center justify-center gap-1">
                        {offer.link && (
                            <a 
                                href={offer.link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className={`p-1.5 ${HACKER_COLORS.textDim} hover:text-cyan-400 ${HACKER_COLORS.transitionFast} rounded hover:${HACKER_COLORS.surfaceHover}`}
                                title="Abrir link"
                            >
                                <ExternalLink size={12} />
                            </a>
                        )}
                        <button 
                            onClick={isPinned ? onUnpin : onPin} 
                            className={`p-1.5 ${HACKER_COLORS.transitionFast} rounded hover:${HACKER_COLORS.surfaceHover} ${isPinned ? 'text-blue-400' : `${HACKER_COLORS.textDim} hover:text-blue-400`}`}
                            title={isPinned ? 'Desafixar' : 'Fixar'}
                        >
                            {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                        </button>
                        <button 
                            onClick={() => onEditOffer(offer)} 
                            className={`p-1.5 ${HACKER_COLORS.textDim} hover:text-amber-400 ${HACKER_COLORS.transitionFast} rounded hover:${HACKER_COLORS.surfaceHover}`}
                            title="Editar"
                        >
                            <Edit3 size={12} />
                        </button>
                        <button 
                            onClick={() => onToggleArchive(offer.id, offer.is_archived)} 
                            className={`p-1.5 ${HACKER_COLORS.textDim} hover:text-orange-400 ${HACKER_COLORS.transitionFast} rounded hover:${HACKER_COLORS.surfaceHover}`}
                            title={offer.is_archived ? "Restaurar" : "Arquivar"}
                        >
                            {offer.is_archived ? <ArchiveRestore size={12}/> : <Archive size={12}/>} 
                        </button>
                        <button 
                            onClick={() => onDeleteOffer(offer.id)} 
                            className={`p-1.5 ${HACKER_COLORS.textDim} hover:text-red-400 ${HACKER_COLORS.transitionFast} rounded hover:${HACKER_COLORS.surfaceHover}`}
                            title="Excluir"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OfferCard;