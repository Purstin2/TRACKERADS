import React, { useState, useEffect, useMemo } from 'react';
import { Eye, Trash2, Edit3, ExternalLink, Archive, ArchiveRestore } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';
import { getSafeTimestamp } from '../../utils/helpers';
import { analyzeOfferPerformance } from '../../utils/helpers';

const OfferCard = ({ offer, onViewDetails, onEditOffer, onToggleArchive, onDeleteOffer, userId, supabaseClient }) => {
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
        <div className={`${HACKER_COLORS.surfaceLighter} border ${offer.is_archived ? HACKER_COLORS.borderDim + ' opacity-60' : HACKER_COLORS.borderNeon} rounded-md p-4 shadow-md hover:${HACKER_COLORS.primaryNeonGlow} transition-all duration-300 flex flex-col justify-between`}>
            <div>
                <div className="flex justify-between items-start mb-3">
                    <h3 className={`text-md font-semibold break-all ${HACKER_COLORS.primaryNeon}`}>
                        {offer.name}
                    </h3>
                    <div className="flex space-x-1.5">
                        {offer.link && (
                            <a 
                                href={offer.link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className={`${HACKER_COLORS.textDim} hover:${HACKER_COLORS.secondaryNeon}`} 
                                title="Link"
                            >
                                <ExternalLink size={16} />
                            </a>
                        )}
                        
                        <button 
                            onClick={() => onEditOffer(offer)} 
                            className={`${HACKER_COLORS.textDim} hover:${HACKER_COLORS.warningNeon}`} 
                            title="Editar"
                        >
                            <Edit3 size={16} />
                        </button>
                        
                        <button 
                            onClick={() => onToggleArchive(offer.id, offer.is_archived)} 
                            className={`${HACKER_COLORS.textDim} hover:${offer.is_archived ? HACKER_COLORS.primaryNeon : 'text-slate-600'}`} 
                            title={offer.is_archived ? "Restaurar" : "Arquivar"}
                        >
                            {offer.is_archived ? <ArchiveRestore size={16}/> : <Archive size={16}/>}
                        </button>
                    </div>
                </div>
                
                <div className="mb-3">
                    <p className={`${HACKER_COLORS.textDim} text-xs`}>ANÚNCIOS ATIVOS:</p>
                    <div className="flex items-baseline space-x-2">
                        <span className={`text-4xl font-bold ${HACKER_COLORS.textBase}`}>
                            {latestAdCount}
                        </span>
                        {dailyPercentageChangeDisplay !== "N/A" && (
                            <span className={`text-lg font-medium ${dailyChangeColor}`}>
                                {dailyPercentageChangeDisplay}
                            </span>
                        )}
                    </div>
                </div>

                <div className={`flex items-start text-xs p-2 rounded-md mb-2 border ${HACKER_COLORS.borderDim} bg-black/30`}>
                    {renderPerformanceIcon()}
                    <div>
                        <span className={`font-semibold ${performanceAnalysis.color}`}>
                            {performanceAnalysis.label}
                        </span>
                        <p className={`${HACKER_COLORS.textDim} text-[10px] leading-tight mt-0.5`}>
                            {performanceAnalysis.details}
                        </p>
                        {performanceAnalysis.weeklyChange !== "N/A" && (
                            <p className={`${HACKER_COLORS.textDim} text-[10px] leading-tight`}>
                                SEMANAL: <span className={parseFloat(performanceAnalysis.weeklyChange) > 0 
                                    ? HACKER_COLORS.primaryNeon 
                                    : parseFloat(performanceAnalysis.weeklyChange) < 0 
                                        ? HACKER_COLORS.destructiveNeon 
                                        : ''}>{performanceAnalysis.weeklyChange}</span>
                            </p>
                        )}
                    </div>
                </div>
                
                <p className={`text-xs ${HACKER_COLORS.textDim}`}>
                    ÚLTIMA ATUALIZAÇÃO: {getSafeTimestamp(offer.last_ad_count_timestamp)}
                </p>
            </div>
            
            <div className="mt-4 flex space-x-2">
                <button 
                    onClick={() => onViewDetails(offer.id)} 
                    className={`flex-1 ${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} px-3 py-2 rounded-md hover:${HACKER_COLORS.buttonPrimaryBg} text-xs font-medium flex items-center justify-center space-x-1.5 border border-black/50`}
                >
                    <Eye size={14} /><span>ANALISAR</span>
                </button>
                
                <button 
                    onClick={() => onDeleteOffer(offer.id)} 
                    className={`flex-1 bg-gray-700 hover:${HACKER_COLORS.buttonDestructiveBg} ${HACKER_COLORS.textDim} hover:text-white px-3 py-2 rounded-md text-xs font-medium flex items-center justify-center space-x-1.5 border border-black/50`}
                >
                    <Trash2 size={14} /><span>EXCLUIR</span>
                </button>
            </div>
        </div>
    );
};

// Add these imports at the top of the file
import { CheckSquare, XSquare, TrendingDown, Zap, Activity } from 'lucide-react';

export default OfferCard;