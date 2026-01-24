import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Eye, Trash2, Archive, ArchiveRestore, CheckSquare, XSquare, TrendingDown, Zap, Activity, ArrowLeft, RefreshCw } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';
import { getSafeTimestamp, formatDateForAxis, analyzeOfferPerformance } from '../../utils/helpers';

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
                showToast("Erro ao carregar comentários.", "error"); 
                setComments([]);
            } else {
                setComments(commentsData || []);
            }
        } catch(e) {
            console.error("Exception in fetchOfferData", e);
            showToast("Exceção ao carregar dados da oferta.", "error");
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
            showToast("Não autenticado.", "error"); 
            return; 
        }
        
        const count = parseInt(newAdCount);
        
        if (isNaN(count) || count < 0) { 
            showToast("Número inválido.", "error"); 
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
            showToast("Não autenticado.", "error"); 
            return; 
        }
        
        openConfirmationModal("EXCLUIR CONTAGEM", "CONFIRMA EXCLUSÃO DESTA CONTAGEM?", async () => {
            try {
                const { error } = await supabaseClient
                    .from('ad_counts')
                    .delete()
                    .eq('id', adCountId);
                    
                if (error) throw error;
                
                showToast("CONTAGEM EXCLUÍDA.", "success");
                
                const { data: remainingCounts, error: fetchError } = await supabaseClient
                    .from('ad_counts')
                    .select('count, timestamp')
                    .eq('offer_id', offerId)
                    .order('timestamp', { ascending: false })
                    .limit(1);
                    
                if (fetchError) { 
                    console.warn("Erro ao buscar contagens restantes após delete:", fetchError); 
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
            showToast("Não autenticado.", "error"); 
            return; 
        }
        
        if (!newComment.trim()) { 
            showToast("Comentário vazio.", "error"); 
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
            showToast("COMENTÁRIO ADICIONADO!", "success");
            fetchOfferData(); 
        } catch (error) { 
            console.error(error); 
            showToast(`ERRO AO ADICIONAR COMENTÁRIO: ${error.message}`, "error"); 
        }
    };
    
    const handleDeleteComment = async (commentId) => { 
        if (!userId || !supabaseClient || !supabaseClient.from) { 
            showToast("Não autenticado.", "error"); 
            return; 
        }
        
        openConfirmationModal("EXCLUIR COMENTÁRIO", "CONFIRMA EXCLUSÃO DESTE COMENTÁRIO?", async () => {
            try {
                const { error } = await supabaseClient
                    .from('comments')
                    .delete()
                    .eq('id', commentId);
                    
                if (error) throw error;
                
                showToast("COMENTÁRIO EXCLUÍDO.", "success");
                fetchOfferData(); 
            } catch (e) { 
                console.error(e); 
                showToast(`ERRO AO EXCLUIR COMENTÁRIO: ${e.message}`, "error"); 
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
        
        // URL do serviço local
        const scraperUrl = 'http://localhost:3001/api/scrape/test';
        
        try {
            console.log(`[SCRAPING] Conectando com serviço local: ${scraperUrl}`);
            
            // Cria um AbortController para timeout (2 minutos para scraping)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 segundos (2 minutos)
            
            const response = await fetch(scraperUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
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
                // Se falhou mas recebeu resposta, mostra o erro específico
                throw new Error(data.error || 'Não foi possível extrair dados');
            }
        } catch (error) {
            console.error(`[SCRAPING] Erro ao conectar com ${scraperUrl}:`, error);
            
            let errorMessage = 'Não foi possível conectar ao scraper local.';
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage = 'Serviço local não está rodando. Inicie o scraper: cd scraper-service && npm start';
            } else if (error.name === 'AbortError') {
                errorMessage = 'Timeout: O scraper demorou muito para responder. Tente novamente.';
            } else {
                errorMessage = `Erro: ${error.message}`;
            }
            
            showToast(`❌ ${errorMessage}`, "error");
            setIsScrapingRunning(false);
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
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
                    <p className="text-xl text-blue-400">ANALISANDO DADOS DO TARGET...</p>
                </div>
            </div>
        );
    }
    
    if (!offer) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <p className="text-xl text-red-400 mb-4">TARGET NÃO ENCONTRADO</p>
                    <button 
                        onClick={() => window.history.back()}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        VOLTAR
                    </button>
                </div>
            </div>
        );
    }
    
    const chartData = adCounts
        .map(ac => ({ 
            timestamp: formatDateForAxis(ac.timestamp), 
            count: ac.count 
        }))
        .reverse(); 

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
            {/* Header */}
            <div className={`${HACKER_COLORS.cardBg} backdrop-blur-md ${HACKER_COLORS.cardBorder} rounded-2xl p-6 ${HACKER_COLORS.cardShadow}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => window.history.back()}
                            className={`p-2.5 ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.textBase} ${HACKER_COLORS.transitionFast} rounded-xl hover:${HACKER_COLORS.surfaceHover} border border-transparent hover:border-blue-500/30`}
                            title="Voltar"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className={`text-2xl sm:text-3xl font-black ${HACKER_COLORS.textBase} mb-1`}>
                                {offer.name}
                            </h1>
                            <p className={`text-sm ${HACKER_COLORS.textDim}`}>
                                Criado em {getSafeTimestamp(offer.created_at)}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => onToggleArchive(offer.id, offer.is_archived)} 
                            className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 ${HACKER_COLORS.transition} ${
                                offer.is_archived 
                                    ? "bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/30" 
                                    : `${HACKER_COLORS.inputBg} ${HACKER_COLORS.textBase} ${HACKER_COLORS.borderDim} border hover:border-amber-500/50`
                            }`}
                        >
                            {offer.is_archived ? <ArchiveRestore size={16}/> : <Archive size={16}/>} 
                            {offer.is_archived ? "RESTAURAR" : "ARQUIVAR"}
                        </button>
                        
                        <button 
                            onClick={() => onDeleteOffer(offer.id)} 
                            className={`${HACKER_COLORS.buttonDestructiveBg} ${HACKER_COLORS.buttonDestructiveText} ${HACKER_COLORS.buttonDestructiveShadow} px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 ${HACKER_COLORS.transition}`}
                        >
                            <Trash2 size={16} />
                            EXCLUIR
                        </button>
                    </div>
                </div>
            </div>

            {/* Performance Analysis */}
            <div className={`${HACKER_COLORS.cardBg} backdrop-blur-md border rounded-2xl p-6 ${HACKER_COLORS.cardShadow} ${
                performanceAnalysis.status === "TEST" 
                    ? 'border-emerald-500/60 bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-emerald-950/40 ring-2 ring-emerald-500/20' 
                    : performanceAnalysis.status === "EXCLUDE_RISK" 
                        ? 'border-red-500/60 bg-gradient-to-r from-red-950/40 via-slate-900/90 to-red-950/40 ring-2 ring-red-500/20' 
                        : HACKER_COLORS.cardBorder
            }`}>
                <div className="flex items-center">
                    {renderPerformanceIcon()}
                    <div className="flex-1">
                        <h2 className={`text-xl font-bold ${performanceAnalysis.color} mb-1`}>
                            {performanceAnalysis.label}
                        </h2>
                        <p className="text-gray-400 text-sm mb-2">
                            {performanceAnalysis.details}
                        </p>
                        {performanceAnalysis.weeklyChange !== "N/A" && (
                            <div className="flex items-center gap-4 text-sm">
                                <span className="text-gray-400">Variação Semanal:</span>
                                <span className={`font-semibold ${
                                    parseFloat(performanceAnalysis.weeklyChange) > 0 
                                        ? 'text-green-400' 
                                        : parseFloat(performanceAnalysis.weeklyChange) < 0 
                                            ? 'text-red-400' 
                                            : 'text-gray-400'
                                }`}>
                                    {performanceAnalysis.weeklyChange}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column - Info and Chart */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Target Information */}
                    <div className={`${HACKER_COLORS.cardBg} backdrop-blur-md ${HACKER_COLORS.cardBorder} rounded-2xl p-6 ${HACKER_COLORS.cardShadow}`}>
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Eye size={20} className="text-blue-400" />
                            INFORMAÇÕES DO TARGET
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-gray-400 block mb-1">LINK:</span>
                                {offer.link ? (
                                    <a 
                                        href={offer.link} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="text-blue-400 hover:text-blue-300 hover:underline break-all"
                                    >
                                        {offer.link}
                                    </a>
                                ) : (
                                    <span className="text-gray-500">N/A</span>
                                )}
                            </div>
                            <div>
                                <span className="text-gray-400 block mb-1">TAGS:</span>
                                <span className="text-white">
                                    {offer.tags?.join(', ') || <span className="text-gray-500">N/A</span>}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-400 block mb-1">CRIADO EM:</span>
                                <span className="text-white">{getSafeTimestamp(offer.created_at)}</span>
                            </div>
                            {offer.updated_at && (
                                <div>
                                    <span className="text-gray-400 block mb-1">ATUALIZADO EM:</span>
                                    <span className="text-white">{getSafeTimestamp(offer.updated_at)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Performance Chart */}
                    <div className={`${HACKER_COLORS.cardBg} backdrop-blur-md ${HACKER_COLORS.cardBorder} rounded-2xl p-6 ${HACKER_COLORS.cardShadow}`}>
                        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                            <Activity size={20} className="text-blue-400" />
                            LINHA DO TEMPO DE PERFORMANCE
                        </h3>
                        {chartData.length > 0 ? (
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis 
                                            dataKey="timestamp" 
                                            stroke="#9CA3AF" 
                                            fontSize={12}
                                            tick={{ fill: '#9CA3AF' }}
                                        />
                                        <YAxis 
                                            stroke="#9CA3AF" 
                                            fontSize={12} 
                                            allowDecimals={false}
                                            tick={{ fill: '#9CA3AF' }}
                                        />
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: '#0F172A', 
                                                border: '2px solid #3B82F6', 
                                                borderRadius: '12px',
                                                color: '#F3F4F6',
                                                padding: '10px 14px',
                                                boxShadow: '0 8px 16px rgba(59, 130, 246, 0.4)'
                                            }} 
                                            labelStyle={{ color: '#60A5FA', fontWeight: 'bold', fontSize: '13px' }} 
                                            cursor={{ stroke: '#3B82F6', strokeWidth: 2, strokeDasharray: '4 4' }}
                                        />
                                        <defs>
                                            <linearGradient id="gradientDetail" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.8}/>
                                                <stop offset="50%" stopColor="#3B82F6" stopOpacity={0.3}/>
                                                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.05}/>
                                            </linearGradient>
                                        </defs>
                                        <Legend wrapperStyle={{ fontSize: "12px", color: '#CBD5E1', fontWeight: 'bold' }} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="count" 
                                            name="Anúncios" 
                                            strokeWidth={4} 
                                            stroke="#3B82F6" 
                                            dot={{ r: 5, fill: '#3B82F6', strokeWidth: 2, stroke: '#0F172A' }} 
                                            activeDot={{ r: 8, stroke: '#0F172A', fill: '#3B82F6', strokeWidth: 3 }} 
                                            animationDuration={1000}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="h-80 flex items-center justify-center">
                                <p className="text-gray-400 text-center">
                                    SEM DADOS PARA GRÁFICO<br/>
                                    <span className="text-sm">Registre algumas contagens para ver o gráfico</span>
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column - Actions and Data */}
                <div className="space-y-8">
                    {/* Add Ad Count */}
                    <div className={`${HACKER_COLORS.cardBg} backdrop-blur-md ${HACKER_COLORS.cardBorder} rounded-2xl p-6 ${HACKER_COLORS.cardShadow}`}>
                        <h3 className="text-lg font-semibold text-white mb-4">
                            REGISTRAR ANÚNCIOS
                        </h3>
                        
                        {/* Botão de scraping automático */}
                        {offer?.link && offer.link.includes('facebook.com/ads/library') && (
                            <div className={`mb-4 p-4 bg-purple-950/40 border border-purple-500/40 rounded-xl ${HACKER_COLORS.transition}`}>
                                <p className={`text-sm text-purple-300 mb-3 font-medium`}>
                                    🤖 Este target tem link da Biblioteca do Facebook. Você pode extrair o número de anúncios automaticamente!
                                </p>
                                <button 
                                    onClick={handleAutoScraping}
                                    disabled={isScrapingRunning}
                                    className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl font-bold ${HACKER_COLORS.transition} ${
                                        isScrapingRunning 
                                            ? 'bg-purple-800/60 cursor-not-allowed opacity-60 text-white' 
                                            : `${HACKER_COLORS.buttonSecondaryBg} ${HACKER_COLORS.buttonSecondaryText} ${HACKER_COLORS.buttonSecondaryShadow}`
                                    }`}
                                >
                                    <RefreshCw size={18} className={isScrapingRunning ? 'animate-spin' : ''} />
                                    {isScrapingRunning ? 'EXTRAINDO DADOS...' : 'SCRAPING AUTOMÁTICO'}
                                </button>
                            </div>
                        )}
                        
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className={`w-full border-t ${HACKER_COLORS.borderDim}`}></div>
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className={`${HACKER_COLORS.cardBg} px-2 ${HACKER_COLORS.textDim}`}>OU MANUAL</span>
                            </div>
                        </div>
                        
                        <form onSubmit={handleAddAdCount} className="space-y-4 mt-4">
                            <input 
                                type="number" 
                                value={newAdCount} 
                                onChange={(e) => setNewAdCountState(e.target.value)} 
                                placeholder="Nº DE ANÚNCIOS ATIVOS" 
                                required 
                                min="0" 
                                className={`w-full ${HACKER_COLORS.inputBg} ${HACKER_COLORS.inputText} p-3 rounded-xl ${HACKER_COLORS.transition} font-medium`}
                            />
                            <button 
                                type="submit" 
                                className={`w-full ${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.buttonPrimaryShadow} p-3 rounded-xl font-bold ${HACKER_COLORS.transition}`}
                            >
                                REGISTRAR MANUALMENTE
                            </button>
                        </form>
                    </div>

                    {/* Ad Count History */}
                    <div className={`${HACKER_COLORS.cardBg} backdrop-blur-md ${HACKER_COLORS.cardBorder} rounded-2xl p-6 ${HACKER_COLORS.cardShadow}`}>
                        <h3 className="text-lg font-semibold text-white mb-4">
                            HISTÓRICO DE REGISTROS
                        </h3>
                        {adCounts.length > 0 ? (
                            <div className="space-y-3 max-h-80 overflow-y-auto">
                                {adCounts.map((ac, i) => { 
                                    const previousCount = adCounts[i+1]?.count; 
                                    let variationText = '';
                                    let variationColor = 'text-gray-400'; 
                                    
                                    if(previousCount !== undefined) {
                                        const difference = ac.count - previousCount;
                                        
                                        if(difference > 0) {
                                            variationText = `(+${difference})`;
                                            variationColor = 'text-green-400';
                                        } else if(difference < 0) {
                                            variationText = `(${difference})`;
                                            variationColor = 'text-red-400';
                                        } else {
                                            variationText = `(0)`;
                                        }
                                    } 
                                    
                                    return (
                                        <div key={ac.id} className={`${HACKER_COLORS.surfaceLighter} p-4 rounded-xl flex justify-between items-center border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.transitionFast} hover:border-blue-500/30`}>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-white font-semibold">
                                                        {ac.count} anúncios
                                                    </span>
                                                    <span className={`text-sm ${variationColor}`}>
                                                        {variationText}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {getSafeTimestamp(ac.timestamp)}
                                                </p>
                                            </div>
                                            <button 
                                                onClick={() => handleDeleteAdCount(ac.id)} 
                                                className="text-gray-400 hover:text-red-400 p-1 rounded transition-colors"
                                                title="Excluir registro"
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-gray-400 text-center py-8">
                                NENHUMA CONTAGEM REGISTRADA
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Comments Section */}
            <div className={`${HACKER_COLORS.cardBg} backdrop-blur-md ${HACKER_COLORS.cardBorder} rounded-2xl p-6 ${HACKER_COLORS.cardShadow}`}>
                <h3 className="text-lg font-semibold text-white mb-6">
                    NOTAS TÁTICAS
                </h3>
                
                <form onSubmit={handleAddComment} className="mb-6">
                    <div className="flex gap-3">
                        <textarea 
                            value={newComment} 
                            onChange={(e) => setNewCommentState(e.target.value)} 
                            placeholder="ADICIONAR NOTA..." 
                            rows="3" 
                            className={`flex-1 ${HACKER_COLORS.inputBg} ${HACKER_COLORS.inputText} p-3 rounded-xl ${HACKER_COLORS.transition} resize-none font-medium`}
                        />
                        <button 
                            type="submit" 
                            className={`${HACKER_COLORS.buttonSecondaryBg} ${HACKER_COLORS.buttonSecondaryText} ${HACKER_COLORS.buttonSecondaryShadow} px-6 py-3 rounded-xl font-bold ${HACKER_COLORS.transition} self-start`}
                        >
                            ADICIONAR
                        </button>
                    </div>
                </form>
                
                {comments.length > 0 ? (
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                        {comments.map(c => (
                            <div key={c.id} className={`${HACKER_COLORS.surfaceLighter} p-4 rounded-xl border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.transitionFast} hover:border-blue-500/30`}>
                                <p className="text-white mb-3">{c.text}</p>
                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-gray-400">
                                        {getSafeTimestamp(c.timestamp)}
                                    </p>
                                    <button 
                                        onClick={() => handleDeleteComment(c.id)} 
                                        className="text-gray-400 hover:text-red-400 p-1 rounded transition-colors"
                                        title="Excluir comentário"
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-400 text-center py-8">
                        NENHUMA NOTA ADICIONADA
                    </p>
                )}
            </div>
        </div>
    );
};

export default OfferDetailScreen;