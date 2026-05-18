import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Eye, Trash2, Pencil, ExternalLink, Archive, ArchiveRestore, Pin, PinOff, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { getSafeTimestamp, getSafeDate, formatDateForAxis } from '../../utils/helpers';
import { analyzeOfferPerformance } from '../../utils/helpers';
import { smartClassifyOffer } from '../../utils/smartClassification';

const OfferCard = ({ offer, onViewDetails, onEditOffer, onToggleArchive, onDeleteOffer, userId, supabaseClient, isPinned, onPin, onUnpin, isActive, onToggleActive, fetchOffers, showToast }) => {
    const [adCountsHistory, setAdCountsHistory] = useState([]);
    const [isScrapingRunning, setIsScrapingRunning] = useState(false);
    const [isManualScrapingRunning, setIsManualScrapingRunning] = useState(false);
    
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
    
    // Atualiza o histÃ³rico quando o offer.last_ad_count ou offer.last_ad_count_timestamp mudarem
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
    
    // Polling para atualizar o histÃ³rico quando o timestamp for recente (Ãºltimos 5 minutos)
    // Isso garante que os cards sejam atualizados mesmo quando o scraping é feito em massa
    useEffect(() => {
        if (!offer.last_ad_count_timestamp) return;
        
        const timestamp = new Date(offer.last_ad_count_timestamp).getTime();
        const now = Date.now();
        const age = now - timestamp;
        
        // Se o timestamp é recente (Ãºltimos 5 minutos), faz polling a cada 5 segundos
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

    // Mantém anÃ¡lise antiga para compatibilidade (variaÃ§Ã£o 7d)
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

    // Scraping manual — sempre usa a máquina local (localhost:3001)
    const handleManualScraping = useCallback(async () => {
        if (!offer?.link || !offer.link.includes('facebook.com/ads/library')) {
            showToast && showToast("Este target não tem link da Biblioteca do Facebook", "error");
            return;
        }
        setIsManualScrapingRunning(true);
        showToast && showToast("💻 Iniciando scraping na sua máquina... até 2 min.", "info");
        const scraperUrl = 'http://localhost:3001/api/scrape/test';
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            const response = await fetch(scraperUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: offer.link }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.success && data.adCount !== null) {
                await supabaseClient.from('ad_counts').insert([{
                    offer_id: offer.id, count: data.adCount,
                    user_id: userId, timestamp: new Date().toISOString()
                }]);
                await supabaseClient.from('offers').update({
                    last_ad_count: data.adCount,
                    last_ad_count_timestamp: new Date().toISOString()
                }).eq('id', offer.id);
                showToast && showToast(`✅ Manual: ${data.adCount} anúncios encontrados`, "success");
                await fetchAdCounts();
                if (fetchOffers) setTimeout(fetchOffers, 500);
            } else {
                throw new Error(data.error || 'Não foi possível extrair dados');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                showToast && showToast("❌ Timeout: scraper demorou muito.", "error");
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                showToast && showToast("❌ Serviço local não está rodando. Inicie o scraper-service.", "error");
            } else {
                showToast && showToast(`❌ Erro: ${error.message}`, "error");
            }
        } finally {
            setIsManualScrapingRunning(false);
        }
    }, [offer, userId, supabaseClient, fetchAdCounts, fetchOffers, showToast]);

    // Prioriza offer.last_ad_count porque é atualizado diretamente após scraping
    // Se não existir, usa o histórico
    const latestAdCount = offer.last_ad_count ?? adCountsHistory[0]?.count ?? 0; 
    
    const previousEntryCount = adCountsHistory[1]?.count;
    let dailyPercentageChangeDisplay = null;
    let dailyChangeColor = 'text-slate-500';

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
            relative flex flex-col overflow-hidden rounded-2xl transition-all duration-300 group
            bg-[#0B1120]/85 backdrop-blur-xl
            ${isPinned
                ? 'border border-blue-500/30 shadow-xl shadow-blue-950/40 ring-1 ring-blue-500/10'
                : offer.is_archived
                    ? 'border border-white/[0.04] opacity-45 grayscale-[0.5]'
                    : 'border border-white/[0.055] hover:border-white/[0.12] hover:shadow-2xl hover:shadow-black/50'
            }
        `} style={{boxShadow: isPinned ? '0 0 0 1px rgba(79,142,247,0.12), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)' : undefined}}>

            {/* Top accent gradient */}
            <div className={`absolute top-0 left-0 right-0 h-[1px] ${
                isPinned
                    ? 'bg-gradient-to-r from-transparent via-blue-400/60 to-transparent'
                    : 'bg-gradient-to-r from-transparent via-white/[0.06] to-transparent'
            }`} />

            {/* Header */}
            <div className="p-4 pb-3">
                <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-[13px] font-semibold text-slate-200 truncate group-hover:text-white transition-colors leading-snug" title={offer.name} style={{fontFamily: 'Outfit, sans-serif'}}>
                            {offer.name}
                        </h3>
                        <span className="text-[11px] text-slate-700 font-medium mt-0.5 block">{formatCreationDate(offer.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                        {isActive && (
                            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/8 border border-emerald-500/18 px-1.5 py-0.5 rounded-full tracking-wider">
                                ATIVA
                            </span>
                        )}
                        {isPinned && (
                            <span className="text-[9px] font-bold text-blue-400 bg-blue-500/8 border border-blue-500/18 px-1.5 py-0.5 rounded-full tracking-wider">
                                PIN
                            </span>
                        )}
                    </div>
                </div>

                {/* Status badge */}
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[10px] font-bold tracking-wide uppercase ${statusInfo.bgColor} ${statusInfo.borderColor} ${statusInfo.color}`}>
                    {statusInfo.label}
                </span>
            </div>

            {/* Metric */}
            <div className="px-4 pb-3 border-t border-white/[0.04] pt-3">
                <p className="text-[9px] text-slate-700 font-bold uppercase tracking-[0.12em] mb-1.5">Anúncios Ativos</p>
                <div className="flex items-end gap-2.5">
                    <span className="text-[32px] font-bold text-white leading-none num-display">{latestAdCount}</span>
                    {dailyPercentageChangeDisplay && (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg mb-1 ${
                            isGrowing
                                ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/15'
                                : isFalling
                                    ? 'text-rose-400 bg-rose-500/10 border border-rose-500/15'
                                    : 'text-slate-600 bg-white/[0.03] border border-white/[0.05]'
                        }`}>
                            {dailyPercentageChangeDisplay}
                        </span>
                    )}
                </div>
                {performanceAnalysis.weeklyChange !== "N/A" && (
                    <p className="text-[11px] text-slate-700 mt-1.5 flex items-center gap-1">
                        <span className="text-slate-600">7d:</span>
                        <span className={`font-semibold ${
                            parseFloat(performanceAnalysis.weeklyChange) > 0
                                ? 'text-emerald-400'
                                : parseFloat(performanceAnalysis.weeklyChange) < 0
                                    ? 'text-rose-400'
                                    : 'text-slate-600'
                        }`}>{performanceAnalysis.weeklyChange}</span>
                    </p>
                )}
            </div>

            {/* Mini chart */}
            {adCountsHistory.length > 1 && (
                <div className="px-3 pb-3 border-t border-white/[0.04] pt-3">
                    <div className="h-[52px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={adCountsHistory.slice().reverse().map(ac => ({
                                    t: formatDateForAxis(ac.timestamp),
                                    v: ac.count
                                }))}
                                margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
                            >
                                <defs>
                                    <linearGradient id={`cg-${offer.id}`} x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9}/>
                                        <stop offset="100%" stopColor="#4F8EF7" stopOpacity={1}/>
                                    </linearGradient>
                                </defs>
                                <Line
                                    type="monotone"
                                    dataKey="v"
                                    stroke={`url(#cg-${offer.id})`}
                                    strokeWidth={1.5}
                                    dot={false}
                                    activeDot={{ r: 3, fill: '#4F8EF7', strokeWidth: 0 }}
                                    animationDuration={600}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(11,17,32,0.97)',
                                        border: '1px solid rgba(255,255,255,0.07)',
                                        borderRadius: '10px',
                                        padding: '5px 10px',
                                        fontSize: '11px',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                    }}
                                    labelStyle={{ color: '#475569', fontSize: '10px' }}
                                    itemStyle={{ color: '#e2e8f0', fontFamily: 'JetBrains Mono, monospace' }}
                                    cursor={{ stroke: 'rgba(255,255,255,0.06)' }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="mt-auto border-t border-white/[0.04]">
                {/* Last update */}
                <div className="px-4 py-2 text-[10px] flex items-center justify-between">
                    <span className="text-slate-700 font-medium">Atualizado</span>
                    <span className="text-slate-500 font-medium font-mono">{getSafeTimestamp(offer.last_ad_count_timestamp) || 'N/A'}</span>
                </div>

                {/* Actions */}
                <div className="px-3 pb-3 space-y-2">
                    {offer?.link && offer.link.includes('facebook.com/ads/library') ? (
                        <div className="space-y-1.5">
                            <div className="flex gap-1.5">
                                {/* Auto scraping — usa cloud/Railway se configurado */}
                                <button
                                    onClick={handleLocalScraping}
                                    disabled={isScrapingRunning || isManualScrapingRunning}
                                    title="Scraping automático via serviço cloud"
                                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                                        isScrapingRunning
                                            ? 'bg-violet-600/30 cursor-not-allowed opacity-60 text-violet-300 border border-violet-500/20'
                                            : 'bg-violet-600/90 hover:bg-violet-500 text-white border border-violet-500/20'
                                    }`}
                                >
                                    <RefreshCw size={10} className={isScrapingRunning ? 'animate-spin' : ''} />
                                    {isScrapingRunning ? 'Auto...' : '⚡ Auto'}
                                </button>
                                {/* Manual scraping — sempre usa localhost:3001 */}
                                <button
                                    onClick={handleManualScraping}
                                    disabled={isScrapingRunning || isManualScrapingRunning}
                                    title="Scraping manual via sua máquina local (localhost:3001)"
                                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                                        isManualScrapingRunning
                                            ? 'bg-teal-600/30 cursor-not-allowed opacity-60 text-teal-300 border border-teal-500/20'
                                            : 'bg-teal-600/80 hover:bg-teal-500 text-white border border-teal-500/20'
                                    }`}
                                >
                                    <RefreshCw size={10} className={isManualScrapingRunning ? 'animate-spin' : ''} />
                                    {isManualScrapingRunning ? 'Local...' : '💻 Local'}
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        const currentUrl = window.location.origin + window.location.pathname;
                                        window.open(`${currentUrl}?view=detail&id=${offer.id}`, '_blank');
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600/90 hover:bg-blue-500 text-white border border-blue-500/20 transition-all"
                                >
                                    <Eye size={10} />
                                    Ver
                                </button>
                            </div>
                        </div>
                    ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => onToggleActive(offer.id)}
                            className={`flex-1 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                                isActive
                                    ? 'bg-blue-600/90 hover:bg-blue-500 text-white shadow-md shadow-blue-900/30 border border-blue-500/20'
                                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-500 hover:text-slate-200 border border-white/[0.06]'
                            }`}
                        >
                            {isActive ? 'Ativa' : 'Ativar'}
                        </button>
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                const currentUrl = window.location.origin + window.location.pathname;
                                window.open(`${currentUrl}?view=detail&id=${offer.id}`, '_blank');
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold bg-blue-600/90 hover:bg-blue-500 text-white shadow-md shadow-blue-900/30 border border-blue-500/20 transition-all"
                        >
                            <Eye size={11} />
                            Detalhes
                        </button>
                    </div>
                    )}
                    {/* Icon actions */}
                    <div className="flex items-center justify-center gap-0.5">
                        {offer.link && (
                            <a
                                href={offer.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-slate-700 hover:text-sky-400 transition-colors rounded-lg hover:bg-white/[0.04]"
                                title="Abrir link"
                            >
                                <ExternalLink size={12} />
                            </a>
                        )}
                        <button
                            onClick={isPinned ? onUnpin : onPin}
                            className={`p-2 transition-colors rounded-lg hover:bg-white/[0.04] ${isPinned ? 'text-blue-400' : 'text-slate-700 hover:text-blue-400'}`}
                            title={isPinned ? 'Desafixar' : 'Fixar'}
                        >
                            {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                        </button>
                        <button
                            onClick={() => onEditOffer(offer)}
                            className="p-2 text-slate-700 hover:text-amber-400 transition-colors rounded-lg hover:bg-white/[0.04]"
                            title="Editar"
                        >
                            <Pencil size={12} />
                        </button>
                        <button
                            onClick={() => onToggleArchive(offer.id, offer.is_archived)}
                            className="p-2 text-slate-700 hover:text-orange-400 transition-colors rounded-lg hover:bg-white/[0.04]"
                            title={offer.is_archived ? 'Restaurar' : 'Arquivar'}
                        >
                            {offer.is_archived ? <ArchiveRestore size={12}/> : <Archive size={12}/>}
                        </button>
                        <button
                            onClick={() => onDeleteOffer(offer.id)}
                            className="p-2 text-slate-700 hover:text-rose-400 transition-colors rounded-lg hover:bg-white/[0.04]"
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
