import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Eye, Trash2, Archive, ArchiveRestore, CheckSquare, XSquare, TrendingDown, Zap, Activity } from 'lucide-react';
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
                    return <CheckSquare size={24} className={`mr-3 mt-1 sm:mt-0 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'EXCLUDE_RISK':
                    return <XSquare size={24} className={`mr-3 mt-1 sm:mt-0 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'OBSERVE':
                    return <Eye size={24} className={`mr-3 mt-1 sm:mt-0 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'RECENT_START':
                    return <Zap size={24} className={`mr-3 mt-1 sm:mt-0 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'LOW_PERFORMANCE':
                    return <TrendingDown size={24} className={`mr-3 mt-1 sm:mt-0 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'NO_DATA':
                    return <Activity size={24} className={`mr-3 mt-1 sm:mt-0 flex-shrink-0 ${performanceAnalysis.color}`} />;
                default:
                    return <Activity size={24} className={`mr-3 mt-1 sm:mt-0 flex-shrink-0 ${performanceAnalysis.color}`} />;
            }
        }
        
        const IconComponent = performanceAnalysis.Icon;
        return <IconComponent size={24} className={`mr-3 mt-1 sm:mt-0 flex-shrink-0 ${performanceAnalysis.color}`} />;
    };

    if (isLoading) {
        return (
            <div className="text-center py-10 text-xl text-green-400 animate-pulse">
                ANALISANDO DADOS DO TARGET (SUPABASE)...
            </div>
        );
    }
    
    if (!offer) {
        return (
            <div className="text-center py-10 text-xl text-red-400">
                TARGET NÃO ENCONTRADO (SUPABASE).
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
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h2 className={`text-2xl sm:text-3xl font-semibold ${HACKER_COLORS.primaryNeon}`}>
                    ANÁLISE DETALHADA: <span className={`${HACKER_COLORS.secondaryNeon}`}>{offer.name}</span>
                </h2>
                <div className="flex space-x-2">
                    <button 
                        onClick={() => onToggleArchive(offer.id, offer.is_archived)} 
                        className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 border ${
                            offer.is_archived 
                                ? "bg-yellow-500 hover:bg-yellow-400 text-black border-yellow-600" 
                                : `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.borderDim} hover:bg-gray-700 ${HACKER_COLORS.textDim}`
                        }`}
                    >
                        {offer.is_archived ? <ArchiveRestore size={14}/> : <Archive size={14}/>} 
                        <span>{offer.is_archived ? "RESTAURAR" : "ARQUIVAR"}</span>
                    </button>
                    
                    <button 
                        onClick={() => onDeleteOffer(offer.id)} 
                        className={`${HACKER_COLORS.buttonDestructiveBg} ${HACKER_COLORS.buttonDestructiveText} px-3 py-1.5 rounded-md hover:${HACKER_COLORS.buttonDestructiveBg} text-xs font-medium flex items-center space-x-1.5 border border-black/50`}
                    >
                        <Trash2 size={14} /><span>EXCLUIR</span>
                    </button>
                </div>
            </div>

            <div className={`p-4 rounded-md border ${
                performanceAnalysis.status === "TEST" 
                    ? `${HACKER_COLORS.borderNeon} bg-green-900/30` 
                    : performanceAnalysis.status === "EXCLUDE_RISK" 
                        ? `border-red-500 bg-red-900/30` 
                        : `${HACKER_COLORS.borderDim} ${HACKER_COLORS.surfaceLighter}`
            }`}>
                <div className="flex items-start sm:items-center">
                    {renderPerformanceIcon()}
                    <div>
                        <h3 className={`text-lg font-semibold ${performanceAnalysis.color}`}>
                            {performanceAnalysis.label}
                        </h3>
                        <p className={`text-xs ${HACKER_COLORS.textDim}`}>
                            {performanceAnalysis.details}
                        </p>
                        {performanceAnalysis.weeklyChange !== "N/A" && (
                            <p className={`text-xs ${HACKER_COLORS.textDim} mt-0.5`}>
                                VARIAÇÃO SEMANAL: 
                                <span className={
                                    parseFloat(performanceAnalysis.weeklyChange) > 0 
                                        ? HACKER_COLORS.primaryNeon 
                                        : parseFloat(performanceAnalysis.weeklyChange) < 0 
                                            ? HACKER_COLORS.destructiveNeon 
                                            : HACKER_COLORS.textDim
                                }>
                                    {performanceAnalysis.weeklyChange}
                                </span>
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className={`lg:col-span-2 ${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim} p-5 rounded-md shadow-md`}>
                    <h3 className={`text-lg font-semibold ${HACKER_COLORS.primaryNeon} mb-3`}>
                        INFORMAÇÕES DO TARGET
                    </h3>
                    <div className="space-y-1 text-sm">
                        <p>
                            <span className={`${HACKER_COLORS.textDim}`}>LINK:</span> 
                            {offer.link 
                                ? <a 
                                    href={offer.link} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className={`${HACKER_COLORS.secondaryNeon} hover:underline`}
                                  >
                                    {offer.link}
                                  </a> 
                                : <span className={HACKER_COLORS.textDim}>N/A</span>
                            }
                        </p>
                        <p>
                            <span className={`${HACKER_COLORS.textDim}`}>TAGS:</span> 
                            <span className={HACKER_COLORS.textBase}>
                                {offer.tags?.join(', ') || <span className={HACKER_COLORS.textDim}>N/A</span>}
                            </span>
                        </p>
                        <p>
                            <span className={`${HACKER_COLORS.textDim}`}>CRIADO EM:</span> 
                            <span className={HACKER_COLORS.textBase}>
                                {getSafeTimestamp(offer.created_at)}
                            </span>
                        </p>
                        {offer.updated_at && (
                            <p>
                                <span className={`${HACKER_COLORS.textDim}`}>ATUALIZADO EM:</span> 
                                <span className={HACKER_COLORS.textBase}>
                                    {getSafeTimestamp(offer.updated_at)}
                                </span>
                            </p>
                        )}
                    </div>
                </div>

                <div className={`${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim} p-5 rounded-md shadow-md space-y-5`}>
                    <div>
                        <h3 className={`text-lg font-semibold ${HACKER_COLORS.primaryNeon} mb-2`}>
                            REGISTRAR ANÚNCIOS
                        </h3>
                        <form onSubmit={handleAddAdCount} className="space-y-2">
                            <input 
                                type="number" 
                                value={newAdCount} 
                                onChange={(e) => setNewAdCountState(e.target.value)} 
                                placeholder="Nº DE ANÚNCIOS ATIVOS" 
                                required 
                                min="0" 
                                className={`w-full ${HACKER_COLORS.surface} border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.primaryNeon} p-2.5 rounded-md focus:ring-1 focus:${HACKER_COLORS.borderNeon} outline-none text-sm`} 
                            />
                            <button 
                                type="submit" 
                                className={`${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} w-full p-2.5 rounded-md hover:${HACKER_COLORS.buttonPrimaryBg} text-sm font-medium border border-black/50`}
                            >
                                REGISTRAR CONTAGEM
                            </button>
                        </form>
                    </div>
                </div>
            </div>
            
            <div className={`${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim} p-5 rounded-md shadow-md`}>
                <h3 className={`text-lg font-semibold ${HACKER_COLORS.primaryNeon} mb-4`}>
                    LINHA DO TEMPO DE PERFORMANCE
                </h3>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart 
                            data={chartData} 
                            margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke={HACKER_COLORS.borderDim} />
                            <XAxis dataKey="timestamp" stroke={HACKER_COLORS.textDim} fontSize={10} />
                            <YAxis stroke={HACKER_COLORS.textDim} fontSize={10} allowDecimals={false} />
                            <Tooltip 
                                contentStyle={{ 
                                    backgroundColor: HACKER_COLORS.surface, 
                                    border: `1px solid ${HACKER_COLORS.borderNeon}`, 
                                    color: HACKER_COLORS.textBase 
                                }} 
                                labelStyle={{ 
                                    color: HACKER_COLORS.primaryNeon, 
                                    fontWeight: 'bold' 
                                }} 
                                itemStyle={{
                                    color: HACKER_COLORS.textBase
                                }} 
                                cursor={{
                                    fill: 'rgba(57,255,20,0.05)'
                                }} 
                            />
                            <Legend 
                                wrapperStyle={{
                                    fontSize: "12px", 
                                    color: HACKER_COLORS.textDim
                                }} 
                            />
                            <Line 
                                type="monotone" 
                                dataKey="count" 
                                name="Anúncios" 
                                strokeWidth={2} 
                                stroke={HACKER_COLORS.primaryNeonHex} 
                                dot={{ 
                                    r: 4, 
                                    fill: HACKER_COLORS.primaryNeonHex, 
                                    stroke: HACKER_COLORS.background, 
                                    strokeWidth: 2
                                }} 
                                activeDot={{
                                    r: 6, 
                                    stroke: HACKER_COLORS.background, 
                                    fill: HACKER_COLORS.primaryNeonHex, 
                                    strokeWidth: 2, 
                                    shadow: HACKER_COLORS.primaryNeonGlow
                                }} 
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <p className={`${HACKER_COLORS.textDim} text-center py-8`}>
                        SEM DADOS PARA GRÁFICO.
                    </p>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={`${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim} p-5 rounded-md shadow-md`}>
                    <h3 className={`text-lg font-semibold ${HACKER_COLORS.primaryNeon} mb-4`}>
                        HISTÓRICO DE REGISTROS
                    </h3>
                    {adCounts.length > 0 ? (
                        <ul className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                            {adCounts.map((ac, i) => { 
                                const previousCount = adCounts[i+1]?.count; 
                                let variationText = '';
                                let variationColor = HACKER_COLORS.textDim; 
                                
                                if(previousCount !== undefined) {
                                    const difference = ac.count - previousCount;
                                    
                                    if(difference > 0) {
                                        variationText = `(+${difference})`;
                                        variationColor = HACKER_COLORS.primaryNeon;
                                    } else if(difference < 0) {
                                        variationText = `(${difference})`;
                                        variationColor = HACKER_COLORS.destructiveNeon;
                                    } else {
                                        variationText = `(0)`;
                                    }
                                } 
                                
                                return (
                                    <li key={ac.id} className={`bg-gray-800/70 p-3 rounded-md flex justify-between items-center text-sm border ${HACKER_COLORS.borderDim}`}>
                                        <div>
                                            <span className={`${HACKER_COLORS.textBase}`}>
                                                {ac.count} anúncios
                                            </span>
                                            <span className={`ml-2 text-xs ${variationColor}`}>
                                                {variationText}
                                            </span>
                                            <p className={`text-xs ${HACKER_COLORS.textDim} mt-0.5`}>
                                                {getSafeTimestamp(ac.timestamp)}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => handleDeleteAdCount(ac.id)} 
                                            className={`${HACKER_COLORS.textDim} hover:${HACKER_COLORS.destructiveNeon}`}
                                        >
                                            <Trash2 size={15}/>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className={`${HACKER_COLORS.textDim}`}>
                            NENHUMA CONTAGEM REGISTRADA.
                        </p>
                    )}
                </div>
                
                <div className={`${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim} p-5 rounded-md shadow-md`}>
                    <h3 className={`text-lg font-semibold ${HACKER_COLORS.primaryNeon} mb-4`}>
                        NOTAS TÁTICAS
                    </h3>
                    <form onSubmit={handleAddComment} className="mb-4 space-y-2">
                        <textarea 
                            value={newComment} 
                            onChange={(e) => setNewCommentState(e.target.value)} 
                            placeholder="ADICIONAR NOTA..." 
                            rows="3" 
                            className={`w-full ${HACKER_COLORS.surface} border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.primaryNeon} p-2.5 rounded-md focus:ring-1 focus:${HACKER_COLORS.borderNeon} outline-none text-sm`}
                        />
                        <button 
                            type="submit" 
                            className={`${HACKER_COLORS.buttonSecondaryBg} ${HACKER_COLORS.buttonSecondaryText} w-full p-2.5 rounded-md hover:${HACKER_COLORS.buttonSecondaryBg} text-sm font-medium border border-black/50`}
                        >
                            ADICIONAR NOTA
                        </button>
                    </form>
                    
                    {comments.length > 0 ? (
                        <ul className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                            {comments.map(c => (
                                <li key={c.id} className={`bg-gray-800/70 p-3 rounded-md border ${HACKER_COLORS.borderDim}`}>
                                    <p className={`${HACKER_COLORS.textBase} text-sm mb-1`}>
                                        {c.text}
                                    </p>
                                    <div className="flex justify-between items-center">
                                        <p className={`text-xs ${HACKER_COLORS.textDim}`}>
                                            {getSafeTimestamp(c.timestamp)}
                                        </p>
                                        <button 
                                            onClick={() => handleDeleteComment(c.id)} 
                                            className={`${HACKER_COLORS.textDim} hover:${HACKER_COLORS.destructiveNeon}`}
                                        >
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className={`${HACKER_COLORS.textDim}`}>
                            NENHUMA NOTA.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OfferDetailScreen;