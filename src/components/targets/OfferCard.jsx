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
            relative bg-gray-900/80 backdrop-blur-sm border rounded-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-xl
            ${isPinned 
                ? 'border-blue-400 shadow-blue-400/20 shadow-lg bg-gradient-to-br from-blue-900/20 to-gray-900/80' 
                : offer.is_archived 
                    ? 'border-gray-600 opacity-60' 
                    : 'border-gray-700 hover:border-blue-400/50'
            }
            w-full h-full flex flex-col
        `}>
            {/* Header with title and creation date */}
            <div className="p-4 pb-3 flex-shrink-0">
                <div className="flex items-start justify-between mb-2">
                    <h3 className={`text-base font-semibold truncate pr-2 ${isPinned ? 'text-blue-300' : 'text-white'}`} title={offer.name}>
                        {offer.name}
                    </h3>
                    <span className="text-xs text-gray-400 bg-gray-800/60 px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0">
                        {formatCreationDate(offer.created_at)}
                    </span>
                </div>
                
                {/* Status and Active badges */}
                <div className="flex items-center gap-2 mb-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md border text-xs font-medium ${statusInfo.bgColor} ${statusInfo.borderColor} ${statusInfo.color}`}>
                        {statusInfo.label}
                    </span>
                    {isActive && (
                        <span className="text-xs text-blue-300 bg-blue-900/40 px-2 py-1 rounded-md font-medium">
                            ATIVA
                        </span>
                    )}
                </div>
            </div>

            {/* Main metrics */}
            <div className="px-4 pb-3 flex-shrink-0">
                <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-2xl font-bold text-white">{latestAdCount}</span>
                    {dailyPercentageChangeDisplay && (
                        <span className={`text-sm font-semibold ${dailyChangeColor}`}>
                            {dailyPercentageChangeDisplay}
                        </span>
                    )}
                </div>
                <p className="text-xs text-gray-400 mb-2">ANÚNCIOS ATIVOS</p>
                
                {/* Performance details */}
                {performanceAnalysis.weeklyChange !== "N/A" && (
                    <div className="text-xs mb-3">
                        <span className="text-gray-400">Variação 7d: </span>
                        <span className={
                            parseFloat(performanceAnalysis.weeklyChange) > 0 
                                ? 'text-green-400' 
                                : parseFloat(performanceAnalysis.weeklyChange) < 0 
                                    ? 'text-red-400' 
                                    : 'text-gray-400'
                        }>
                            {performanceAnalysis.weeklyChange}
                        </span>
                    </div>
                )}
                
                {/* Mini Performance Chart */}
                {adCountsHistory.length > 0 && (
                    <div className="mt-3 mb-2">
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
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 3 }}
                                    />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: '#1F2937', 
                                            border: '1px solid #3B82F6', 
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            fontSize: '11px'
                                        }} 
                                        labelStyle={{ color: '#60A5FA', fontSize: '10px' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>

            {/* Last update */}
            <div className="px-4 pb-3 text-xs text-gray-500 flex-shrink-0">
                Atualizado: {getSafeTimestamp(offer.last_ad_count_timestamp) || 'Nunca'}
            </div>

            {/* Action buttons - always at bottom */}
            <div className="mt-auto p-4 pt-2">
                <div className="grid grid-cols-2 gap-2 mb-2">
                    {offer?.link && offer.link.includes('facebook.com/ads/library') ? (
                        <button 
                            onClick={handleLocalScraping}
                            disabled={isScrapingRunning}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                                isScrapingRunning 
                                    ? 'bg-purple-800 cursor-not-allowed opacity-50 text-white' 
                                    : 'bg-purple-600 text-white hover:bg-purple-700'
                            }`}
                            title="Executar scraping local"
                        >
                            <RefreshCw size={14} className={isScrapingRunning ? 'animate-spin' : ''} />
                            {isScrapingRunning ? 'SCRAP...' : 'SCRAP LOCAL'}
                        </button>
                    ) : (
                        <button 
                            onClick={() => onToggleActive(offer.id)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                isActive 
                                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                    : 'bg-gray-800 text-blue-300 border border-gray-600 hover:bg-blue-900/30 hover:border-blue-500'
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
                        className="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                    >
                        <Eye size={14} />
                        ANALISAR
                    </button>
                </div>
                
                {/* Secondary actions */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        {offer.link && (
                            <a 
                                href={offer.link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="p-1.5 text-gray-400 hover:text-blue-400 transition-colors rounded-md hover:bg-gray-800/50" 
                                title="Abrir link"
                            >
                                <ExternalLink size={14} />
                            </a>
                        )}
                        <button 
                            onClick={isPinned ? onUnpin : onPin} 
                            className={`p-1.5 transition-colors rounded-md hover:bg-gray-800/50 ${isPinned ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'}`}
                            title={isPinned ? 'Desafixar' : 'Fixar no topo'}
                        >
                            {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                        <button 
                            onClick={() => onEditOffer(offer)} 
                            className="p-1.5 text-gray-400 hover:text-yellow-400 transition-colors rounded-md hover:bg-gray-800/50" 
                            title="Editar"
                        >
                            <Edit3 size={14} />
                        </button>
                        <button 
                            onClick={() => onToggleArchive(offer.id, offer.is_archived)} 
                            className="p-1.5 text-gray-400 hover:text-orange-400 transition-colors rounded-md hover:bg-gray-800/50" 
                            title={offer.is_archived ? "Restaurar" : "Arquivar"}
                        >
                            {offer.is_archived ? <ArchiveRestore size={14}/> : <Archive size={14}/>} 
                        </button>
                    </div>
                    <button 
                        onClick={() => onDeleteOffer(offer.id)} 
                        className="p-1.5 text-gray-400 hover:text-red-400 transition-colors rounded-md hover:bg-gray-800/50"
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