import React, { useState, useEffect, useMemo } from 'react';
import { Eye, Trash2, CreditCard as Edit3, ExternalLink, Archive, ArchiveRestore, Pin, PinOff } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';
import { getSafeTimestamp, getSafeDate } from '../../utils/helpers';
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

    // Get status color and icon
    const getStatusInfo = () => {
        switch (performanceAnalysis.status) {
            case 'TEST':
                return { color: 'text-green-400', bgColor: 'bg-green-900/30', borderColor: 'border-green-500/50', label: 'TESTE' };
            case 'EXCLUDE_RISK':
                return { color: 'text-red-400', bgColor: 'bg-red-900/30', borderColor: 'border-red-500/50', label: 'RISCO' };
            case 'OBSERVE':
                return { color: 'text-cyan-400', bgColor: 'bg-cyan-900/30', borderColor: 'border-cyan-500/50', label: 'OBSERVAR' };
            case 'RECENT_START':
                return { color: 'text-purple-400', bgColor: 'bg-purple-900/30', borderColor: 'border-purple-500/50', label: 'NOVO' };
            case 'LOW_PERFORMANCE':
                return { color: 'text-yellow-400', bgColor: 'bg-yellow-900/30', borderColor: 'border-yellow-500/50', label: 'BAIXO' };
            default:
                return { color: 'text-gray-400', bgColor: 'bg-gray-900/30', borderColor: 'border-gray-500/50', label: 'SEM DADOS' };
        }
    };

    const statusInfo = getStatusInfo();

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
                    <div className="text-xs">
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
            </div>

            {/* Last update */}
            <div className="px-4 pb-3 text-xs text-gray-500 flex-shrink-0">
                Atualizado: {getSafeTimestamp(offer.last_ad_count_timestamp) || 'Nunca'}
            </div>

            {/* Action buttons - always at bottom */}
            <div className="mt-auto p-4 pt-2">
                <div className="grid grid-cols-2 gap-2 mb-2">
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