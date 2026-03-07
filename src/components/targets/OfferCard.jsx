import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Eye, Trash2, Pencil, ExternalLink, Archive, ArchiveRestore, Pin, PinOff, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { getSafeTimestamp, getSafeDate, formatDateForAxis } from '../../utils/helpers';
import { analyzeOfferPerformance } from '../../utils/helpers';
import { smartClassifyOffer } from '../../utils/smartClassification';

const OfferCard = ({ offer, onViewDetails, onEditOffer, onToggleArchive, onDeleteOffer, userId, supabaseClient, isPinned, onPin, onUnpin, isActive, onToggleActive, fetchOffers, showToast }) => {
    const [adCountsHistory, setAdCountsHistory] = useState([]);
    const [isScrapingRunning, setIsScrapingRunning] = useState(false);
    
    // FunÃ§Ã£o para buscar histÃ³rico de ad_counts
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
    
    // Atualiza o histÃ³rico quando o offer.last_ad_count ou offer.last_ad_count_timestamp mudarem
    useEffect(() => {
        // ForÃ§a atualizaÃ§Ã£o do histÃ³rico quando o offer for atualizado
        if (offer.last_ad_count !== null && offer.last_ad_count !== undefined && offer.last_ad_count_timestamp) {
            // Verifica se o Ãºltimo valor do offer estÃ¡ no histÃ³rico com timestamp similar
            const hasLatestInHistory = adCountsHistory.some(ac => {
                const countMatch = ac.count === offer.last_ad_count;
                if (!countMatch) return false;
                
                // Verifica se o timestamp estÃ¡ prÃ³ximo (dentro de 2 minutos)
                const acTime = new Date(ac.timestamp).getTime();
                const offerTime = new Date(offer.last_ad_count_timestamp).getTime();
                return Math.abs(acTime - offerTime) < 120000; // 2 minutos
            });
            
            // Se o Ãºltimo valor do offer nÃ£o estÃ¡ no histÃ³rico, forÃ§a refetch
            if (!hasLatestInHistory) {
                // Aguarda um pouco para garantir que o banco foi atualizado
                const timeoutId = setTimeout(() => {
                    fetchAdCounts();
                }, 1000);
                return () => clearTimeout(timeoutId);
            }
        }
    }, [offer.last_ad_count, offer.last_ad_count_timestamp, adCountsHistory, fetchAdCounts]);
    
    // Polling para atualizar o histÃ³rico quando o timestamp for recente (Ãºltimos 5 minutos)
    // Isso garante que os cards sejam atualizados mesmo quando o scraping Ã© feito em massa
    useEffect(() => {
        if (!offer.last_ad_count_timestamp) return;
        
        const timestamp = new Date(offer.last_ad_count_timestamp).getTime();
        const now = Date.now();
        const age = now - timestamp;
        
        // Se o timestamp Ã© recente (Ãºltimos 5 minutos), faz polling a cada 5 segundos
        if (age < 300000) { // 5 minutos
            const interval = setInterval(() => {
                fetchAdCounts();
            }, 5000); // A cada 5 segundos
            
            return () => clearInterval(interval);
        }
    }, [offer.last_ad_count_timestamp, fetchAdCounts]); 

    // AnÃ¡lise inteligente de classificaÃ§Ã£o
    const smartClassification = useMemo(
        () => smartClassifyOffer(adCountsHistory),
        [adCountsHistory]
    );

    // MantÃ©m anÃ¡lise antiga para compatibilidade (variaÃ§Ã£o 7d)
    const performanceAnalysis = useMemo(
        () => analyzeOfferPerformance(adCountsHistory, 7), 
        [adCountsHistory]
    ); 
    
    // FunÃ§Ã£o para executar scraping local
    const handleLocalScraping = useCallback(async () => {
        if (!offer?.link || !offer.link.includes('facebook.com/ads/library')) {
            showToast && showToast("Este target nÃ£o tem link da Biblioteca do Facebook", "error");
            return;
        }
        
        setIsScrapingRunning(true);
        showToast && showToast("ðŸ¤– Iniciando scraping automÃ¡tico... Isso pode levar atÃ© 2 minutos.", "info");
        
        const scraperUrl = `${import.meta.env.VITE_SCRAPER_URL || 'http://localhost:3001'}/api/scrape/test`;
        
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
                
                showToast && showToast(`âœ… Scraping concluÃ­do! ${data.adCount} anÃºncios encontrados`, "success");
                
                // Atualiza o histÃ³rico imediatamente
                await fetchAdCounts();
                
                // Atualiza a lista de offers
                if (fetchOffers) {
                    setTimeout(() => {
                        fetchOffers();
                    }, 500);
                }
                
                setIsScrapingRunning(false);
            } else {
                throw new Error(data.error || 'NÃ£o foi possÃ­vel extrair dados');
            }
        } catch (error) {
            console.error('[SCRAPING] Erro:', error);
            
            let errorMessage = 'Não foi possível conectar ao scraper.';
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage = 'Serviço de scraping indisponível. O scraping automático roda via GitHub Actions 2x/dia.';
            } else if (error.name === 'AbortError') {
                errorMessage = 'Timeout: O scraper demorou muito para responder. Tente novamente.';
            } else {
                errorMessage = `Erro: ${error.message}`;
            }
            
            showToast && showToast(`❌ ${errorMessage}`, "error");
            setIsScrapingRunning(false);
        }
    }, [offer, userId, supabaseClient, fetchAdCounts, fetchOffers, showToast]);
    
    // Prioriza offer.last_ad_count porque Ã© atualizado diretamente apÃ³s scraping
    // Se nÃ£o existir, usa o histÃ³rico
    const latestAdCount = offer.last_ad_count ?? adCountsHistory[0]?.count ?? 0; 
    
    const previousEntryCount = adCountsHistory[1]?.count;
    let dailyPercentageChangeDisplay = null;
    let dailyChangeColor = 'text-slate-500';

    if (typeof previousEntryCount === 'number' && previousEntryCount !== null) {
        if (previousEntryCount === 0 && latestAdCount > 0) {
            dailyPercentageChangeDisplay = "+âˆž"; 
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

    // Usa classificaÃ§Ã£o inteligente
    const statusInfo = {
        color: smartClassification.color,
        bgColor: smartClassification.bgColor,
        borderColor: smartClassification.borderColor,
        label: smartClassification.label
    };

    const isGrowing = dailyPercentageChangeDisplay && dailyPercentageChangeDisplay.startsWith('+');
    const isFalling = dailyPercentageChangeDisplay && dailyPercentageChangeDisplay.startsWith('-') && dailyPercentageChangeDisplay !== '-âˆž';

    return (
        <div className={`
            relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-300 group
            bg-[#0D1220]/80 backdrop-blur-xl
            ${isPinned
                ? 'border-blue-500/35 shadow-xl shadow-blue-900/25 ring-1 ring-blue-500/15'
                : offer.is_archived
                    ? 'border-white/[0.04] opacity-50 grayscale-[0.4]'
                    : 'border-white/[0.07] hover:border-white/[0.14] hover:shadow-xl hover:shadow-black/40'
            }
        `}>
            {/* Top accent line when pinned */}
            {isPinned && <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 to-violet-500 rounded-t-2xl" />}

            {/* Header */}
            <div className="p-4 pb-3">
                <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-100 truncate group-hover:text-white transition-colors" title={offer.name}>
                            {offer.name}
                        </h3>
                        <span className="text-xs text-slate-600 font-medium">{formatCreationDate(offer.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isActive && (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                ATIVA
                            </span>
                        )}
                        {isPinned && (
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                                FIXADO
                            </span>
                        )}
                    </div>
                </div>

                {/* Status badge */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusInfo.bgColor} ${statusInfo.borderColor} ${statusInfo.color}`}>
                    {statusInfo.label}
                </span>
            </div>

            {/* Metric */}
            <div className="px-4 pb-3 border-t border-white/[0.05] pt-3">
                <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-widest mb-1">AnÃºncios Ativos</p>
                <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-white tabular-nums leading-none">{latestAdCount}</span>
                    {dailyPercentageChangeDisplay && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full mb-0.5 ${
                            isGrowing
                                ? 'text-emerald-400 bg-emerald-500/10'
                                : isFalling
                                    ? 'text-rose-400 bg-rose-500/10'
                                    : 'text-slate-500 bg-white/[0.04]'
                        }`}>
                            {dailyPercentageChangeDisplay}
                        </span>
                    )}
                </div>
                {performanceAnalysis.weeklyChange !== "N/A" && (
                    <p className="text-[11px] text-slate-600 mt-1.5">
                        7d: <span className={`font-semibold ${
                            parseFloat(performanceAnalysis.weeklyChange) > 0
                                ? 'text-emerald-400'
                                : parseFloat(performanceAnalysis.weeklyChange) < 0
                                    ? 'text-rose-400'
                                    : 'text-slate-500'
                        }`}>{performanceAnalysis.weeklyChange}</span>
                    </p>
                )}
            </div>

            {/* Mini chart */}
            {adCountsHistory.length > 1 && (
                <div className="px-3 pb-3 border-t border-white/[0.05] pt-3">
                    <div className="h-[56px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={adCountsHistory.slice().reverse().map(ac => ({
                                    t: formatDateForAxis(ac.timestamp),
                                    v: ac.count
                                }))}
                                margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
                            >
                                <defs>
                                    <linearGradient id={`cg-${offer.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#4F8EF7" stopOpacity={0.8}/>
                                        <stop offset="100%" stopColor="#4F8EF7" stopOpacity={0.1}/>
                                    </linearGradient>
                                </defs>
                                <Line
                                    type="monotone"
                                    dataKey="v"
                                    stroke="#4F8EF7"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 3, fill: '#4F8EF7', strokeWidth: 0 }}
                                    animationDuration={800}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#0D1220',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: '8px',
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                    }}
                                    labelStyle={{ color: '#64748b', fontSize: '10px' }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                    cursor={{ stroke: 'rgba(255,255,255,0.08)' }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="mt-auto border-t border-white/[0.05]">
                {/* Last update */}
                <div className="px-4 py-2 text-[11px] text-slate-600 flex items-center justify-between border-b border-white/[0.04]">
                    <span>Atualizado</span>
                    <span className="text-slate-400 font-medium">{getSafeTimestamp(offer.last_ad_count_timestamp) || 'Nunca'}</span>
                </div>

                {/* Actions */}
                <div className="p-3 space-y-2">
                    <div className="flex gap-2">
                        {offer?.link && offer.link.includes('facebook.com/ads/library') ? (
                            <button
                                onClick={handleLocalScraping}
                                disabled={isScrapingRunning}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                                    isScrapingRunning
                                        ? 'bg-violet-600/40 cursor-not-allowed opacity-60 text-white'
                                        : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-700/20'
                                }`}
                                title="Scraping automÃ¡tico"
                            >
                                <RefreshCw size={12} className={isScrapingRunning ? 'animate-spin' : ''} />
                                {isScrapingRunning ? 'Buscando...' : 'Scraping'}
                            </button>
                        ) : (
                            <button
                                onClick={() => onToggleActive(offer.id)}
                                className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                                    isActive
                                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-700/20'
                                        : 'bg-white/[0.05] hover:bg-white/[0.09] text-slate-400 hover:text-slate-200 border border-white/[0.07]'
                                }`}
                            >
                                {isActive ? 'Ativa' : 'Ativar'}
                            </button>
                        )}
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                const currentUrl = window.location.origin + window.location.pathname;
                                window.open(`${currentUrl}?view=detail&id=${offer.id}`, '_blank');
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-700/20 transition-all"
                        >
                            <Eye size={12} />
                            Detalhes
                        </button>
                    </div>

                    {/* Icon actions */}
                    <div className="flex items-center justify-center gap-1">
                        {offer.link && (
                            <a
                                href={offer.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-slate-600 hover:text-sky-400 transition-colors rounded-lg hover:bg-white/[0.05]"
                                title="Abrir link"
                            >
                                <ExternalLink size={13} />
                            </a>
                        )}
                        <button
                            onClick={isPinned ? onUnpin : onPin}
                            className={`p-1.5 transition-colors rounded-lg hover:bg-white/[0.05] ${isPinned ? 'text-blue-400' : 'text-slate-600 hover:text-blue-400'}`}
                            title={isPinned ? 'Desafixar' : 'Fixar'}
                        >
                            {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                        </button>
                        <button
                            onClick={() => onEditOffer(offer)}
                            className="p-1.5 text-slate-600 hover:text-amber-400 transition-colors rounded-lg hover:bg-white/[0.05]"
                            title="Editar"
                        >
                            <Pencil size={13} />
                        </button>
                        <button
                            onClick={() => onToggleArchive(offer.id, offer.is_archived)}
                            className="p-1.5 text-slate-600 hover:text-orange-400 transition-colors rounded-lg hover:bg-white/[0.05]"
                            title={offer.is_archived ? 'Restaurar' : 'Arquivar'}
                        >
                            {offer.is_archived ? <ArchiveRestore size={13}/> : <Archive size={13}/>}
                        </button>
                        <button
                            onClick={() => onDeleteOffer(offer.id)}
                            className="p-1.5 text-slate-600 hover:text-rose-400 transition-colors rounded-lg hover:bg-white/[0.05]"
                            title="Excluir"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OfferCard;
