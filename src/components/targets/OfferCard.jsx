import React, { useState, useEffect, useMemo } from 'react';
import { Eye, Trash2, Edit3, ExternalLink, Archive, ArchiveRestore } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';
import { getSafeTimestamp } from '../../utils/helpers';
import { analyzeOfferPerformance } from '../../utils/helpers';

const OfferCard = ({ offer, onViewDetails, onEditOffer, onToggleArchive, onDeleteOffer, userId, supabaseClient, isPinned, onPin, onUnpin, isActive, onToggleActive }) => {
    const [adCountsHistory, setAdCountsHistory] = useState([]);
    
    useEffect(() => {
        if (!userId || !supabaseClient || !supabaseClient.from) return;
        
        const fetchAdCounts = async () => {
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
        };
        
        fetchAdCounts();
    }, [offer.id, userId, supabaseClient]); 

    const performanceAnalysis = useMemo(
        () => analyzeOfferPerformance(adCountsHistory, 7), 
        [adCountsHistory]
    ); 
    
    const latestAdCount = adCountsHistory[0]?.count ?? offer.last_ad_count ?? 0; 
    
    const previousEntryCount = adCountsHistory[1]?.count;
    let dailyPercentageChangeDisplay = "N/A";
    let dailyChangeColor = HACKER_COLORS.textDim;

    if (typeof previousEntryCount === 'number' && previousEntryCount !== null) {
        if (previousEntryCount === 0 && latestAdCount > 0) {
            dailyPercentageChangeDisplay = "+INF"; 
            dailyChangeColor = HACKER_COLORS.primaryNeon;
        } else if (previousEntryCount > 0) {
            const change = ((latestAdCount - previousEntryCount) / previousEntryCount) * 100;
            dailyPercentageChangeDisplay = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
            if (change > 0) dailyChangeColor = HACKER_COLORS.primaryNeon;
            else if (change < 0) dailyChangeColor = HACKER_COLORS.destructiveNeon;
        } else if (previousEntryCount === 0 && latestAdCount === 0) {
            dailyPercentageChangeDisplay = "0.0%";
        }
    }

    // Import icons dynamically based on performance analysis status
    const renderPerformanceIcon = () => {
        if (!performanceAnalysis.Icon) {
            // You'll need to import and use the appropriate icon based on the status
            switch (performanceAnalysis.status) {
                case 'TEST':
                    return <CheckSquare size={20} className={`mr-2 mt-0.5 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'EXCLUDE_RISK':
                    return <XSquare size={20} className={`mr-2 mt-0.5 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'OBSERVE':
                    return <Eye size={20} className={`mr-2 mt-0.5 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'RECENT_START':
                    return <Zap size={20} className={`mr-2 mt-0.5 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'LOW_PERFORMANCE':
                    return <TrendingDown size={20} className={`mr-2 mt-0.5 flex-shrink-0 ${performanceAnalysis.color}`} />;
                case 'NO_DATA':
                    return <Activity size={20} className={`mr-2 mt-0.5 flex-shrink-0 ${performanceAnalysis.color}`} />;
                default:
                    return <Activity size={20} className={`mr-2 mt-0.5 flex-shrink-0 ${performanceAnalysis.color}`} />;
            }
        }
        
        // This isn't actually used since we handle icon rendering above
        const IconComponent = performanceAnalysis.Icon;
        return <IconComponent size={20} className={`mr-2 mt-0.5 flex-shrink-0 ${performanceAnalysis.color}`} />;
    };

    return (
        <div className={
            `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.cardShadow} border-2 ` +
            (isPinned
                ? 'border-blue-400 ring-2 ring-blue-300 bg-gradient-to-br from-blue-900/40 to-gray-900/80 '
                : offer.is_archived
                    ? HACKER_COLORS.borderDim + ' opacity-60 '
                    : HACKER_COLORS.borderPrimary + ' '
            ) +
            'rounded-2xl p-6 shadow-xl hover:scale-[1.025] hover:' + HACKER_COLORS.primaryGlow + ' transition-all duration-300 flex flex-col justify-between min-h-[320px]' 
        }>
            <div>
                <div className="flex justify-between items-start mb-4">
                    <h3 className={`text-xl font-bold tracking-wide break-all ${isPinned ? 'text-blue-300 drop-shadow' : HACKER_COLORS.primary}`}>{offer.name}</h3>
                    <div className="flex space-x-2">
                        {offer.link && (
                            <a 
                                href={offer.link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className={`${HACKER_COLORS.textDim} hover:${HACKER_COLORS.secondary} transition-colors`} 
                                title="Link"
                            >
                                <ExternalLink size={18} />
                            </a>
                        )}
                        <button 
                            onClick={isPinned ? onUnpin : onPin} 
                            className={
                                `${isPinned ? 'text-blue-300' : HACKER_COLORS.textDim} hover:text-blue-400 transition-colors` 
                            }
                            title={isPinned ? 'Desafixar do topo' : 'Fixar no topo'}
                        >
                            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pin"><path d="M12 2v7.5M12 2c-2.5 0-4.5 2-4.5 4.5V10l-2 2v1h13v-1l-2-2V6.5C16.5 4 14.5 2 12 2Z"/></svg>
                        </button>
                        <button 
                            onClick={() => onEditOffer(offer)} 
                            className={`${HACKER_COLORS.textDim} hover:${HACKER_COLORS.secondary} transition-colors`} 
                            title="Editar"
                        >
                            <Edit3 size={18} />
                        </button>
                        <button 
                            onClick={() => onToggleArchive(offer.id, offer.is_archived)} 
                            className={`${HACKER_COLORS.textDim} hover:${offer.is_archived ? HACKER_COLORS.primary : 'text-slate-600'} transition-colors`} 
                            title={offer.is_archived ? "Restaurar" : "Arquivar"}
                        >
                            {offer.is_archived ? <ArchiveRestore size={18}/> : <Archive size={18}/>} 
                        </button>
                    </div>
                </div>
                
                {/* Botão de rodar/ativar oferta - movido para dentro do card */}
                <div className="mb-4 flex justify-end">
                    <button
                        onClick={() => onToggleActive(offer.id)}
                        className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-all duration-200 ${isActive ? 'bg-blue-600 border-blue-400 text-white shadow' : 'bg-gray-800 border-gray-600 text-blue-300 hover:bg-blue-900 hover:border-blue-400'}`}
                    >
                        {isActive ? 'ATIVA (RODANDO)' : 'ATIVAR'}
                    </button>
                </div>
                
                {/* Badge de recomendação visual */}
                <div className={`flex items-center text-sm p-2 rounded-lg mb-3 border-2 ${HACKER_COLORS.borderPrimary} ${isPinned ? 'bg-blue-900/40' : 'bg-black/40'} shadow-inner gap-2`}> 
                    {renderPerformanceIcon()}
                    <div>
                        <span className={`font-bold text-base ${performanceAnalysis.status === 'TEST' ? 'text-blue-400' : performanceAnalysis.status === 'EXCLUDE_RISK' ? 'text-red-400' : performanceAnalysis.status === 'LOW_PERFORMANCE' ? 'text-yellow-300' : performanceAnalysis.status === 'OBSERVE' ? 'text-purple-400' : 'text-cyan-300'}`}>{performanceAnalysis.label}</span>
                        <p className={`${HACKER_COLORS.textDim} text-xs leading-tight mt-0.5`}>{performanceAnalysis.details}</p>
                        {performanceAnalysis.weeklyChange !== "N/A" && (
                            <p className={`${HACKER_COLORS.textDim} text-xs leading-tight`}>
                                SEMANAL: <span className={parseFloat(performanceAnalysis.weeklyChange) > 0 
                                    ? 'text-blue-400' 
                                    : parseFloat(performanceAnalysis.weeklyChange) < 0 
                                        ? 'text-red-400' 
                                        : ''}>{performanceAnalysis.weeklyChange}</span>
                            </p>
                        )}
                    </div>
                </div>
                <div className="mb-4">
                    <p className={`${HACKER_COLORS.textDim} text-xs`}>ANÚNCIOS ATIVOS:</p>
                    <div className="flex items-baseline space-x-2">
                        <span className={`text-5xl font-extrabold ${HACKER_COLORS.textBase}`}>{latestAdCount}</span>
                        {dailyPercentageChangeDisplay !== "N/A" && (
                            <span className={`text-xl font-semibold ${dailyChangeColor}`}>{dailyPercentageChangeDisplay}</span>
                        )}
                    </div>
                </div>
                <p className={`text-xs ${HACKER_COLORS.textDim}`}>ÚLTIMA ATUALIZAÇÃO: {getSafeTimestamp(offer.last_ad_count_timestamp)}</p>
            </div>
            <div className="mt-6 flex space-x-3">
                <button 
                    onClick={() => onViewDetails(offer.id)} 
                    className={`flex-1 ${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} px-4 py-2 rounded-lg shadow-md hover:scale-105 active:scale-95 transition-transform text-sm font-semibold flex items-center justify-center space-x-2 border border-black/50`}
                >
                    <Eye size={16} /><span>ANALISAR</span>
                </button>
                <button 
                    onClick={() => onDeleteOffer(offer.id)} 
                    className={`flex-1 ${HACKER_COLORS.buttonDestructiveBg} ${HACKER_COLORS.buttonDestructiveText} px-4 py-2 rounded-lg shadow-md hover:scale-105 active:scale-95 transition-transform text-sm font-semibold flex items-center justify-center space-x-2 border border-black/50`}
                >
                    <Trash2 size={16} /><span>EXCLUIR</span>
                </button>
            </div>
        </div>
    );
};

// Add these imports at the top of the file
import { CheckSquare, XSquare, TrendingDown, Zap, Activity } from 'lucide-react';

export default OfferCard;