import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Eye, Trash2, Archive, ArchiveRestore, CheckSquare, XSquare, TrendingDown, Zap, Activity, ArrowLeft, RefreshCw } from 'lucide-react';
import { getSafeTimestamp, formatDateForAxis, analyzeOfferPerformance } from '../../utils/helpers';
import { authHeaders } from '@/lib/supabase';

const OfferDetailScreen = ({ 
    offerId, 
    userId, 
    showToast, 
    onDeleteOffer, 
    openConfirmationModal, 
    onToggleArchive, 
    fetchOffers: globalFetchOffers, 
    supabaseClient 
}) => {
    const [offer, setOffer] = useState(null);
    const [adCounts, setAdCounts] = useState([]);
    const [comments, setComments] = useState([]);
    const [newAdCount, setNewAdCountState] = useState(''); 
    const [newComment, setNewCommentState] = useState(''); 
    const [isLoading, setIsLoading] = useState(true);
    const [isScrapingRunning, setIsScrapingRunning] = useState(false);
    const [isManualScrapingRunning, setIsManualScrapingRunning] = useState(false);
    
    const performanceAnalysis = useMemo(
        () => analyzeOfferPerformance(adCounts, 7), 
        [adCounts]
    ); 
    
    const fetchOfferData = useCallback(async () => {
        if (!userId || !supabaseClient || !supabaseClient.from) { 
            setIsLoading(false); 
            return; 
        }
        
        setIsLoading(true);
        
        try {
            const { data: offerData, error: offerError } = await supabaseClient
                .from('offers')
                .select('*')
                .eq('id', offerId)
                .single();
                
            if (offerError) {
                console.error("OfferDetail Error:", offerError); 
                showToast("Erro ao carregar detalhes da oferta.", "error"); 
                setOffer(null);
            } else {
                setOffer(offerData);
            }

            const { data: adCountsData, error: adCountsError } = await supabaseClient
                .from('ad_counts')
                .select('*')
                .eq('offer_id', offerId)
                .order('timestamp', { ascending: false });
                
            if (adCountsError) { 
                console.error("AdCounts Error:", adCountsError); 
                showToast("Erro ao carregar contagens.", "error"); 
                setAdCounts([]);
            } else {
                setAdCounts(adCountsData || []);
            }
            
            const { data: commentsData, error: commentsError } = await supabaseClient
                .from('comments')
                .select('*')
                .eq('offer_id', offerId)
                .order('timestamp', { ascending: false });
                
            if (commentsError) { 
                console.error("Comments Error:", commentsError); 
                showToast("Erro ao carregar comentÃ¡rios.", "error"); 
                setComments([]);
            } else {
                setComments(commentsData || []);
            }
        } catch(e) {
            console.error("Exception in fetchOfferData", e);
            showToast("ExceÃ§Ã£o ao carregar dados da oferta.", "error");
        } finally {
            setIsLoading(false);
        }
    }, [offerId, userId, showToast, supabaseClient]);

    useEffect(() => {
        fetchOfferData();
    }, [fetchOfferData]);

    const handleAddAdCount = async (e) => { 
        e.preventDefault();
        
        if (!userId || !supabaseClient || !supabaseClient.from) { 
            showToast("NÃ£o autenticado.", "error"); 
            return; 
        }
        
        const count = parseInt(newAdCount);
        
        if (isNaN(count) || count < 0) { 
            showToast("NÃºmero invÃ¡lido.", "error"); 
            return; 
        }
        
        try {
            const { error: adCountInsertError } = await supabaseClient
                .from('ad_counts')
                .insert([{ 
                    offer_id: offerId, 
                    count, 
                    user_id: userId, 
                    timestamp: new Date().toISOString() 
                }])
                .select();
                
            if (adCountInsertError) throw adCountInsertError;
            
            const { error: offerUpdateError } = await supabaseClient
                .from('offers')
                .update({ 
                    last_ad_count: count, 
                    last_ad_count_timestamp: new Date().toISOString() 
                })
                .eq('id', offerId);
                
            if (offerUpdateError) throw offerUpdateError;
            
            setNewAdCountState(''); 
            showToast("CONTAGEM ADICIONADA!", "success");
            fetchOfferData(); 
            
            if (globalFetchOffers) globalFetchOffers(); 
        } catch (error) { 
            console.error(error); 
            showToast(`ERRO: ${error.message}`, "error"); 
        }
    };
    
    const handleDeleteAdCount = async (adCountId) => { 
        if (!userId || !supabaseClient || !supabaseClient.from) { 
            showToast("NÃ£o autenticado.", "error"); 
            return; 
        }
        
        openConfirmationModal("EXCLUIR CONTAGEM", "CONFIRMA EXCLUSÃƒO DESTA CONTAGEM?", async () => {
            try {
                const { error } = await supabaseClient
                    .from('ad_counts')
                    .delete()
                    .eq('id', adCountId);
                    
                if (error) throw error;
                
                showToast("CONTAGEM EXCLUÃDA.", "success");
                
                const { data: remainingCounts, error: fetchError } = await supabaseClient
                    .from('ad_counts')
                    .select('count, timestamp')
                    .eq('offer_id', offerId)
                    .order('timestamp', { ascending: false })
                    .limit(1);
                    
                if (fetchError) { 
                    console.warn("Erro ao buscar contagens restantes apÃ³s delete:", fetchError); 
                }
                
                const lastCountData = (remainingCounts && remainingCounts.length > 0) 
                    ? { 
                        last_ad_count: remainingCounts[0].count, 
                        last_ad_count_timestamp: remainingCounts[0].timestamp 
                    }
                    : { 
                        last_ad_count: 0, 
                        last_ad_count_timestamp: null 
                    };
                
                await supabaseClient
                    .from('offers')
                    .update(lastCountData)
                    .eq('id', offerId);
                    
                fetchOfferData();
                
                if (globalFetchOffers) globalFetchOffers();
            } catch (e) { 
                console.error(e); 
                showToast(`ERRO AO EXCLUIR CONTAGEM: ${e.message}`, "error"); 
            }
        });
    };
    
    const handleAddComment = async (e) => { 
        e.preventDefault();
        
        if (!userId || !supabaseClient || !supabaseClient.from) { 
            showToast("NÃ£o autenticado.", "error"); 
            return; 
        }
        
        if (!newComment.trim()) { 
            showToast("ComentÃ¡rio vazio.", "error"); 
            return; 
        }
        
        try {
            const { error } = await supabaseClient
                .from('comments')
                .insert([{ 
                    offer_id: offerId, 
                    text: newComment.trim(), 
                    user_id: userId, 
                    timestamp: new Date().toISOString() 
                }])
                .select();
                
            if (error) throw error;
            
            setNewCommentState(''); 
            showToast("COMENTÃRIO ADICIONADO!", "success");
            fetchOfferData(); 
        } catch (error) { 
            console.error(error); 
            showToast(`ERRO AO ADICIONAR COMENTÃRIO: ${error.message}`, "error"); 
        }
    };
    
    const handleDeleteComment = async (commentId) => { 
        if (!userId || !supabaseClient || !supabaseClient.from) { 
            showToast("NÃ£o autenticado.", "error"); 
            return; 
        }
        
        openConfirmationModal("EXCLUIR COMENTÃRIO", "CONFIRMA EXCLUSÃƒO DESTE COMENTÃRIO?", async () => {
            try {
                const { error } = await supabaseClient
                    .from('comments')
                    .delete()
                    .eq('id', commentId);
                    
                if (error) throw error;
                
                showToast("COMENTÃRIO EXCLUÃDO.", "success");
                fetchOfferData(); 
            } catch (e) { 
                console.error(e); 
                showToast(`ERRO AO EXCLUIR COMENTÃRIO: ${e.message}`, "error"); 
            }
        });
    };
    
    const handleAutoScraping = async () => {
        if (!offer?.link || !offer.link.includes('facebook.com/ads/library')) {
            showToast("Este target não tem link da Biblioteca do Facebook", "error");
            return;
        }
        
        setIsScrapingRunning(true);
        showToast("🤖 Iniciando scraping automático... Isso pode levar até 2 minutos.", "info");
        
        // URL do serviço (local ou Railway via VITE_SCRAPER_URL)
        const scraperUrl = `${import.meta.env.VITE_SCRAPER_URL || 'http://localhost:3001'}/api/scrape/test`;
        
        try {
            console.log(`[SCRAPING] Conectando com serviço local: ${scraperUrl}`);
            
            // Cria um AbortController para timeout (2 minutos para scraping)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 segundos (2 minutos)
            
            const response = await fetch(scraperUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(await authHeaders())
                },
                body: JSON.stringify({ url: offer.link }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // Verifica se a resposta é válida
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
                        offer_id: offerId, 
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
                    .eq('id', offerId);
                
                if (offerUpdateError) throw offerUpdateError;
                
                showToast(`✅ Scraping concluído! ${data.adCount} anúncios encontrados`, "success");
                
                // Aguarda um pouco para garantir que o banco foi atualizado
                setTimeout(() => {
                    fetchOfferData();
                    if (globalFetchOffers) globalFetchOffers();
                }, 500);
                
                setIsScrapingRunning(false);
                return; // Sucesso, sai da função
            } else {
                // Se falhou mas recebeu resposta, mostra o erro especÃ­fico
                throw new Error(data.error || 'Não foi possível extrair dados');
            }
        } catch (error) {
            console.error(`[SCRAPING] Erro ao conectar com ${scraperUrl}:`, error);
            
            let errorMessage = 'Não foi possível conectar ao scraper.';
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage = 'Serviço de scraping indisponível. O scraping automático roda via GitHub Actions 2x/dia.';
            } else if (error.name === 'AbortError') {
                errorMessage = 'Timeout: O scraper demorou muito para responder. Tente novamente.';
            } else {
                errorMessage = `Erro: ${error.message}`;
            }
            
            showToast(`❌ ${errorMessage}`, "error");
            setIsScrapingRunning(false);
        }
    };

    // Scraping manual — sempre usa a máquina local (localhost:3001)
    const handleManualScraping = async () => {
        if (!offer?.link || !offer.link.includes('facebook.com/ads/library')) {
            showToast("Este target não tem link da Biblioteca do Facebook", "error");
            return;
        }
        setIsManualScrapingRunning(true);
        showToast("💻 Iniciando scraping na sua máquina... até 2 min.", "info");
        const scraperUrl = 'http://localhost:3001/api/scrape/test';
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            const response = await fetch(scraperUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
                body: JSON.stringify({ url: offer.link }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.success && data.adCount !== null) {
                await supabaseClient.from('ad_counts').insert([{
                    offer_id: offerId, count: data.adCount,
                    user_id: userId, timestamp: new Date().toISOString()
                }]);
                await supabaseClient.from('offers').update({
                    last_ad_count: data.adCount,
                    last_ad_count_timestamp: new Date().toISOString()
                }).eq('id', offerId);
                showToast(`✅ Manual: ${data.adCount} anúncios encontrados`, "success");
                setTimeout(() => { fetchOfferData(); if (globalFetchOffers) globalFetchOffers(); }, 500);
            } else {
                throw new Error(data.error || 'Não foi possível extrair dados');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                showToast("❌ Timeout: scraper demorou muito.", "error");
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                showToast("❌ Serviço local não está rodando. Inicie o scraper-service na sua máquina.", "error");
            } else {
                showToast(`❌ Erro: ${error.message}`, "error");
            }
        } finally {
            setIsManualScrapingRunning(false);
        }
    };

    // Helper function to render the appropriate performance icon
    const renderPerformanceIcon = () => {
        if (!performanceAnalysis.Icon) {
            switch (performanceAnalysis.status) {
                case 'TEST':
                    return <CheckSquare size={24} className={`mr-3 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'EXCLUDE_RISK':
                    return <XSquare size={24} className={`mr-3 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'OBSERVE':
                    return <Eye size={24} className={`mr-3 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'RECENT_START':
                    return <Zap size={24} className={`mr-3 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'LOW_PERFORMANCE':
                    return <TrendingDown size={24} className={`mr-3 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'NO_DATA':
                    return <Activity size={24} className={`mr-3 flex-shrink-0 ${performanceAnalysis.color}`} />;
                default:
                    return <Activity size={24} className={`mr-3 flex-shrink-0 ${performanceAnalysis.color}`} />;
            }
        }
        
        const IconComponent = performanceAnalysis.Icon;
        return <IconComponent size={24} className={`mr-3 flex-shrink-0 ${performanceAnalysis.color}`} />;
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                    <Activity size={20} className="text-blue-400 animate-pulse" />
                </div>
                <p className="text-slate-500 text-sm font-medium">Carregando dados do target...</p>
            </div>
        );
    }

    if (!offer) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-rose-400 font-medium">Target nÃ£o encontrado</p>
                <button
                    onClick={() => window.history.back()}
                    className="text-sm text-slate-400 hover:text-slate-200 border border-white/[0.08] px-4 py-2 rounded-xl hover:bg-white/[0.04] transition-all"
                >
                    Voltar
                </button>
            </div>
        );
    }

    const chartData = adCounts.map(ac => ({ timestamp: formatDateForAxis(ac.timestamp), count: ac.count })).reverse();
    const chartTooltipStyle = {
        backgroundColor: '#0D1220',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        fontSize: '12px',
    };

    return (
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-7 space-y-5 animate-fade-in">

            {/* Header */}
            <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => window.history.back()}
                            className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] flex items-center justify-center text-slate-400 hover:text-slate-200 transition-all"
                            title="Voltar"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">{offer.name}</h1>
                            <p className="text-xs text-slate-500 mt-0.5">Criado em {getSafeTimestamp(offer.created_at)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onToggleArchive(offer.id, offer.is_archived)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                                offer.is_archived
                                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                    : 'bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-amber-400 hover:border-amber-500/25'
                            }`}
                        >
                            {offer.is_archived ? <ArchiveRestore size={15}/> : <Archive size={15}/>}
                            {offer.is_archived ? 'Restaurar' : 'Arquivar'}
                        </button>
                        <button
                            onClick={() => onDeleteOffer(offer.id)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-700/20 transition-all"
                        >
                            <Trash2 size={15} />
                            Excluir
                        </button>
                    </div>
                </div>
            </div>

            {/* Performance banner */}
            <div className={`bg-[#0D1220]/80 backdrop-blur-xl rounded-2xl p-5 border transition-all ${
                performanceAnalysis.status === 'TEST'
                    ? 'border-emerald-500/25 bg-emerald-950/20'
                    : performanceAnalysis.status === 'EXCLUDE_RISK'
                        ? 'border-rose-500/25 bg-rose-950/20'
                        : 'border-white/[0.07]'
            }`}>
                <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        performanceAnalysis.status === 'TEST' ? 'bg-emerald-500/15' :
                        performanceAnalysis.status === 'EXCLUDE_RISK' ? 'bg-rose-500/15' : 'bg-blue-500/10'
                    }`}>
                        <Activity size={17} className={performanceAnalysis.color} />
                    </div>
                    <div>
                        <h2 className={`font-semibold text-sm ${performanceAnalysis.color}`}>{performanceAnalysis.label}</h2>
                        <p className="text-slate-500 text-sm mt-0.5">{performanceAnalysis.details}</p>
                        {performanceAnalysis.weeklyChange !== 'N/A' && (
                            <p className="text-xs text-slate-600 mt-1.5">
                                Variação 7d: <span className={`font-semibold ${parseFloat(performanceAnalysis.weeklyChange) > 0 ? 'text-emerald-400' : parseFloat(performanceAnalysis.weeklyChange) < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{performanceAnalysis.weeklyChange}</span>
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Left â€” info + chart */}
                <div className="lg:col-span-2 space-y-5">

                    {/* Info card */}
                    <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-5">
                        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                            <Eye size={15} className="text-blue-400" />
                            InformaÃ§Ãµes do Target
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-xs text-slate-600 font-medium uppercase tracking-wider block mb-1">Link</span>
                                {offer.link ? (
                                    <a href={offer.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline break-all text-xs leading-relaxed">
                                        {offer.link}
                                    </a>
                                ) : <span className="text-slate-600 text-xs">â€”</span>}
                            </div>
                            <div>
                                <span className="text-xs text-slate-600 font-medium uppercase tracking-wider block mb-1">Tags</span>
                                <div className="flex flex-wrap gap-1">
                                    {offer.tags?.length ? offer.tags.map(tag => (
                                        <span key={tag} className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">{tag}</span>
                                    )) : <span className="text-slate-600 text-xs">â€”</span>}
                                </div>
                            </div>
                            <div>
                                <span className="text-xs text-slate-600 font-medium uppercase tracking-wider block mb-1">Criado</span>
                                <span className="text-slate-300 text-xs">{getSafeTimestamp(offer.created_at)}</span>
                            </div>
                            {offer.updated_at && (
                                <div>
                                    <span className="text-xs text-slate-600 font-medium uppercase tracking-wider block mb-1">Atualizado</span>
                                    <span className="text-slate-300 text-xs">{getSafeTimestamp(offer.updated_at)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h3 className="text-sm font-semibold text-white">Histórico de Performance</h3>
                                <p className="text-xs text-slate-500 mt-0.5">{adCounts.length} registros</p>
                            </div>
                            <Activity size={15} className="text-blue-400" />
                        </div>
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="detailGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#4F8EF7" stopOpacity={0.3}/>
                                            <stop offset="100%" stopColor="#4F8EF7" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                    <XAxis dataKey="timestamp" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: '#94a3b8', marginBottom: 4 }} itemStyle={{ color: '#e2e8f0' }} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
                                    <Legend wrapperStyle={{ fontSize: 12, color: '#64748b' }} />
                                    <Line type="monotone" dataKey="count" name="AnÃºncios" stroke="#4F8EF7" strokeWidth={2.5} dot={{ r: 3, fill: '#4F8EF7', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#4F8EF7' }} animationDuration={800} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[260px] flex flex-col items-center justify-center gap-2">
                                <Activity size={24} className="text-slate-700" />
                                <p className="text-sm text-slate-600">Sem dados para exibir</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right â€” actions + history */}
                <div className="space-y-5">
                    {/* Register count */}
                    <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-5">
                        <h3 className="text-sm font-semibold text-white mb-4">Registrar Anúncios</h3>

                        {offer?.link && offer.link.includes('facebook.com/ads/library') && (
                            <div className="mb-4 space-y-2">
                                {/* Auto: usa VITE_SCRAPER_URL (cloud/Railway) */}
                                <div className="p-3 bg-violet-500/8 border border-violet-500/15 rounded-xl">
                                    <p className="text-[11px] text-slate-500 mb-2">⚡ Automático — via serviço cloud (Railway)</p>
                                    <button
                                        onClick={handleAutoScraping}
                                        disabled={isScrapingRunning || isManualScrapingRunning}
                                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                            isScrapingRunning
                                                ? 'bg-violet-600/40 cursor-not-allowed opacity-60 text-white'
                                                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-700/20'
                                        }`}
                                    >
                                        <RefreshCw size={14} className={isScrapingRunning ? 'animate-spin' : ''} />
                                        {isScrapingRunning ? 'Buscando...' : 'Scraping Automático'}
                                    </button>
                                </div>
                                {/* Manual: sempre usa localhost:3001 (máquina local) */}
                                <div className="p-3 bg-teal-500/8 border border-teal-500/15 rounded-xl">
                                    <p className="text-[11px] text-slate-500 mb-2">💻 Manual — usa sua máquina (localhost:3001)</p>
                                    <button
                                        onClick={handleManualScraping}
                                        disabled={isScrapingRunning || isManualScrapingRunning}
                                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                            isManualScrapingRunning
                                                ? 'bg-teal-600/40 cursor-not-allowed opacity-60 text-white'
                                                : 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-700/20'
                                        }`}
                                    >
                                        <RefreshCw size={14} className={isManualScrapingRunning ? 'animate-spin' : ''} />
                                        {isManualScrapingRunning ? 'Buscando...' : 'Scraping Manual (Local)'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex-1 h-px bg-white/[0.06]" />
                            <span className="text-xs text-slate-600">ou manual</span>
                            <div className="flex-1 h-px bg-white/[0.06]" />
                        </div>

                        <form onSubmit={handleAddAdCount} className="space-y-3">
                            <input
                                type="number"
                                value={newAdCount}
                                onChange={(e) => setNewAdCountState(e.target.value)}
                                placeholder="Número de anúncios"
                                required
                                min="0"
                                className="w-full bg-[#131929] border border-white/[0.08] focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none text-slate-200 placeholder:text-slate-600 rounded-xl py-2.5 px-4 text-sm transition-all"
                            />
                            <button
                                type="submit"
                                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-700/20 transition-all"
                            >
                                Registrar
                            </button>
                        </form>
                    </div>

                    {/* Ad count history */}
                    <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-5">
                        <h3 className="text-sm font-semibold text-white mb-4">Histórico</h3>
                        {adCounts.length > 0 ? (
                            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                {adCounts.map((ac, i) => {
                                    const prev = adCounts[i + 1]?.count;
                                    let varText = '';
                                    let varColor = 'text-slate-600';
                                    if (prev !== undefined) {
                                        const diff = ac.count - prev;
                                        if (diff > 0) { varText = `+${diff}`; varColor = 'text-emerald-400'; }
                                        else if (diff < 0) { varText = `${diff}`; varColor = 'text-rose-400'; }
                                        else { varText = 'Â±0'; }
                                    }
                                    return (
                                        <div key={ac.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-white/[0.09] transition-all group">
                                            <div>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-sm font-semibold text-white tabular-nums">{ac.count}</span>
                                                    {varText && <span className={`text-xs font-medium ${varColor}`}>{varText}</span>}
                                                </div>
                                                <p className="text-[11px] text-slate-600 mt-0.5">{getSafeTimestamp(ac.timestamp)}</p>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteAdCount(ac.id)}
                                                className="text-slate-700 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100"
                                                title="Excluir"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="py-8 flex flex-col items-center gap-2">
                                <Activity size={22} className="text-slate-700" />
                                <p className="text-sm text-slate-600">Nenhum registro ainda</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Comments */}
            <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Notas</h3>
                <form onSubmit={handleAddComment} className="flex gap-3 mb-4">
                    <textarea
                        value={newComment}
                        onChange={(e) => setNewCommentState(e.target.value)}
                        placeholder="Adicionar nota..."
                        rows={3}
                        className="flex-1 bg-[#131929] border border-white/[0.08] focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none text-slate-200 placeholder:text-slate-600 rounded-xl py-2.5 px-4 text-sm transition-all resize-none"
                    />
                    <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-700/20 transition-all self-start"
                    >
                        Salvar
                    </button>
                </form>
                {comments.length > 0 ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {comments.map(c => (
                            <div key={c.id} className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:border-white/[0.09] group transition-all">
                                <p className="text-sm text-slate-300 leading-relaxed">{c.text}</p>
                                <div className="flex items-center justify-between mt-2">
                                    <p className="text-[11px] text-slate-600">{getSafeTimestamp(c.timestamp)}</p>
                                    <button
                                        onClick={() => handleDeleteComment(c.id)}
                                        className="text-slate-700 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100"
                                        title="Excluir"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-8 flex flex-col items-center gap-2">
                        <p className="text-sm text-slate-600">Nenhuma nota adicionada</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OfferDetailScreen;
