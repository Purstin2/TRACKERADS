import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Eye, Trash2, Archive, ArchiveRestore, CheckSquare, XSquare, TrendingDown, Zap, Activity, ArrowLeft } from 'lucide-react';
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
            <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => window.history.back()}
                            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
                            title="Voltar"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
                                {offer.name}
                            </h1>
                            <p className="text-sm text-gray-400">
                                Criado em {getSafeTimestamp(offer.created_at)}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => onToggleArchive(offer.id, offer.is_archived)} 
                            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                                offer.is_archived 
                                    ? "bg-yellow-600 hover:bg-yellow-700 text-white" 
                                    : "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600"
                            }`}
                        >
                            {offer.is_archived ? <ArchiveRestore size={16}/> : <Archive size={16}/>} 
                            {offer.is_archived ? "RESTAURAR" : "ARQUIVAR"}
                        </button>
                        
                        <button 
                            onClick={() => onDeleteOffer(offer.id)} 
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                        >
                            <Trash2 size={16} />
                            EXCLUIR
                        </button>
                    </div>
                </div>
            </div>

            {/* Performance Analysis */}
            <div className={`bg-gray-900/80 backdrop-blur-sm border rounded-xl p-6 ${
                performanceAnalysis.status === "TEST" 
                    ? 'border-green-500 bg-gradient-to-r from-green-900/20 to-gray-900/80' 
                    : performanceAnalysis.status === "EXCLUDE_RISK" 
                        ? 'border-red-500 bg-gradient-to-r from-red-900/20 to-gray-900/80' 
                        : 'border-gray-700'
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
                    <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
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
                    <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
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
                                                backgroundColor: '#1F2937', 
                                                border: '1px solid #3B82F6', 
                                                borderRadius: '8px',
                                                color: '#F3F4F6'
                                            }} 
                                            labelStyle={{ color: '#60A5FA', fontWeight: 'bold' }} 
                                        />
                                        <Legend wrapperStyle={{ fontSize: "12px", color: '#9CA3AF' }} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="count" 
                                            name="Anúncios" 
                                            strokeWidth={3} 
                                            stroke="#60A5FA" 
                                            dot={{ r: 4, fill: '#60A5FA', strokeWidth: 2 }} 
                                            activeDot={{ r: 6, stroke: '#1F2937', fill: '#60A5FA', strokeWidth: 2 }} 
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
                    <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">
                            REGISTRAR ANÚNCIOS
                        </h3>
                        <form onSubmit={handleAddAdCount} className="space-y-4">
                            <input 
                                type="number" 
                                value={newAdCount} 
                                onChange={(e) => setNewAdCountState(e.target.value)} 
                                placeholder="Nº DE ANÚNCIOS ATIVOS" 
                                required 
                                min="0" 
                                className="w-full bg-gray-800 border border-gray-600 text-white p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                            <button 
                                type="submit" 
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg font-medium transition-colors"
                            >
                                REGISTRAR CONTAGEM
                            </button>
                        </form>
                    </div>

                    {/* Ad Count History */}
                    <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
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
                                        <div key={ac.id} className="bg-gray-800/70 p-4 rounded-lg flex justify-between items-center">
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
            <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
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
                            className="flex-1 bg-gray-800 border border-gray-600 text-white p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                        />
                        <button 
                            type="submit" 
                            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors self-start"
                        >
                            ADICIONAR
                        </button>
                    </div>
                </form>
                
                {comments.length > 0 ? (
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                        {comments.map(c => (
                            <div key={c.id} className="bg-gray-800/70 p-4 rounded-lg">
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