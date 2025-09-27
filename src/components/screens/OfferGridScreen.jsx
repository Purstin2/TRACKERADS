import React, { useState } from 'react';
import { PlusCircle, List, LayoutGrid, Search, Zap, AlertTriangle, Archive, ArchiveRestore, Filter, ChevronDown } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';
import OfferCard from '../targets/OfferCard';
import OfferList from '../targets/OfferList';

const OfferGridScreen = ({ 
    offers, 
    onViewDetails, 
    onAddOffer, 
    onEditOffer, 
    onToggleArchive, 
    searchTerm, 
    setSearchTerm, 
    viewMode, 
    setViewMode, 
    showArchived, 
    setShowArchived, 
    onDeleteOffer, 
    userId, 
    isAuthReady, 
    supabaseClient, 
    pinnedOfferIds, 
    setPinnedOfferIds,
    activeOfferIds,
    setActiveOfferIds
}) => {
    const [sortBy, setSortBy] = useState('newest');
    const [showSortDropdown, setShowSortDropdown] = useState(false);

    // Sort options
    const sortOptions = [
        { value: 'newest', label: 'Recém Adicionados' },
        { value: 'oldest', label: 'Mais Antigos' },
        { value: 'alphabetical', label: 'Ordem Alfabética' },
        { value: 'most_ads_7d', label: 'Mais Anúncios (7 dias)' },
        { value: 'consistency_7d', label: 'Maior Consistência (7 dias)' },
        { value: 'trending_up', label: 'Em Alta (crescimento)' },
        { value: 'trending_down', label: 'Em Queda (decrescimento)' },
        { value: 'most_active', label: 'Mais Ativos Recentemente' }
    ];

    // Function to calculate 7-day metrics for sorting
    const calculateMetrics = (offer, adCounts) => {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const recentCounts = adCounts.filter(ac => 
            new Date(ac.timestamp) >= sevenDaysAgo
        ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        if (recentCounts.length === 0) {
            return {
                maxAds: offer.last_ad_count || 0,
                consistency: 0,
                trend: 0,
                lastActivity: offer.last_ad_count_timestamp ? new Date(offer.last_ad_count_timestamp) : new Date(0)
            };
        }
        
        const maxAds = Math.max(...recentCounts.map(ac => ac.count));
        
        // Consistency: how stable the ad count is (lower variance = higher consistency)
        const counts = recentCounts.map(ac => ac.count);
        const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
        const variance = counts.reduce((acc, count) => acc + Math.pow(count - avg, 2), 0) / counts.length;
        const consistency = avg > 0 ? Math.max(0, 100 - (variance / avg) * 10) : 0;
        
        // Trend: compare first and last values
        const firstCount = recentCounts[recentCounts.length - 1]?.count || 0;
        const lastCount = recentCounts[0]?.count || 0;
        const trend = firstCount > 0 ? ((lastCount - firstCount) / firstCount) * 100 : 0;
        
        const lastActivity = new Date(recentCounts[0].timestamp);
        
        return { maxAds, consistency, trend, lastActivity };
    };

    // Cards fixados no topo
    const sortedOffers = [...offers].sort((a, b) => {
        const aPinnedIdx = pinnedOfferIds.indexOf(a.id);
        const bPinnedIdx = pinnedOfferIds.indexOf(b.id);
        
        // Pinned offers always come first
        if (aPinnedIdx !== -1 && bPinnedIdx !== -1) {
            return aPinnedIdx - bPinnedIdx; // mantém ordem de fixação
        }
        if (aPinnedIdx !== -1) return -1;
        if (bPinnedIdx !== -1) return 1;
        
        // Apply sorting to non-pinned offers
        switch (sortBy) {
            case 'newest':
                return new Date(b.created_at) - new Date(a.created_at);
            case 'oldest':
                return new Date(a.created_at) - new Date(b.created_at);
            case 'alphabetical':
                return a.name.localeCompare(b.name);
            case 'most_ads_7d':
                const aMaxAds = calculateMetrics(a, []).maxAds;
                const bMaxAds = calculateMetrics(b, []).maxAds;
                return bMaxAds - aMaxAds;
            case 'consistency_7d':
                const aConsistency = calculateMetrics(a, []).consistency;
                const bConsistency = calculateMetrics(b, []).consistency;
                return bConsistency - aConsistency;
            case 'trending_up':
                const aTrendUp = calculateMetrics(a, []).trend;
                const bTrendUp = calculateMetrics(b, []).trend;
                return bTrendUp - aTrendUp;
            case 'trending_down':
                const aTrendDown = calculateMetrics(a, []).trend;
                const bTrendDown = calculateMetrics(b, []).trend;
                return aTrendDown - bTrendDown;
            case 'most_active':
                const aActivity = calculateMetrics(a, []).lastActivity;
                const bActivity = calculateMetrics(b, []).lastActivity;
                return bActivity - aActivity;
            default:
                return 0;
        }
    });

    return (
        <div className="px-2 sm:px-6 md:px-12 max-w-7xl mx-auto">
            <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
                <h2 className={`text-3xl font-extrabold tracking-tight ${HACKER_COLORS.primary} drop-shadow-lg`}>GRID DE TARGETS</h2>
                <div className="flex items-center space-x-3 flex-wrap gap-2">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="BUSCAR TARGET..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-56 sm:w-64 md:w-80 ${HACKER_COLORS.surfaceLighter} border-2 ${HACKER_COLORS.borderPrimary} ${HACKER_COLORS.primary} placeholder-blue-700 rounded-lg py-2 px-4 pl-12 focus:ring-2 focus:${HACKER_COLORS.borderPrimary} outline-none text-base shadow-md`} 
                        />
                        <Search 
                            size={20} 
                            className={`absolute left-4 top-1/2 transform -translate-y-1/2 ${HACKER_COLORS.primary}`} 
                        />
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => setShowSortDropdown(!showSortDropdown)}
                            className={`flex items-center space-x-2 px-4 py-2 border-2 ${HACKER_COLORS.borderPrimary} rounded-lg group hover:${HACKER_COLORS.surfaceLighter} transition-all duration-200 ${HACKER_COLORS.textBase}`}
                        >
                            <Filter size={20} className={`${HACKER_COLORS.textDim} group-hover:${HACKER_COLORS.primary}`} />
                            <span className="text-sm font-medium">{sortOptions.find(opt => opt.value === sortBy)?.label}</span>
                            <ChevronDown size={16} className={`${HACKER_COLORS.textDim} group-hover:${HACKER_COLORS.primary} transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {showSortDropdown && (
                            <div className={`absolute top-full left-0 mt-2 w-64 ${HACKER_COLORS.surface} border-2 ${HACKER_COLORS.borderPrimary} rounded-lg shadow-xl z-50 ${HACKER_COLORS.primaryGlow}`}>
                                {sortOptions.map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => {
                                            setSortBy(option.value);
                                            setShowSortDropdown(false);
                                        }}
                                        className={`w-full text-left px-4 py-3 text-sm transition-colors border-b ${HACKER_COLORS.borderDim} last:border-b-0 ${
                                            sortBy === option.value 
                                                ? `${HACKER_COLORS.primary} bg-blue-900/30` 
                                                : `${HACKER_COLORS.textBase} hover:${HACKER_COLORS.primary} hover:bg-gray-800/50`
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={() => setShowArchived(!showArchived)} 
                        title={showArchived ? "Ver Ativas" : "Ver Arquivadas"}
                        className={`p-2 border-2 ${HACKER_COLORS.borderPrimary} rounded-lg group transition-all duration-200 ${showArchived ? `bg-yellow-800/60 ${HACKER_COLORS.warning}` : `hover:${HACKER_COLORS.surfaceLighter}`}`}
                    >
                        {showArchived 
                            ? <ArchiveRestore size={22} className="text-yellow-300" /> 
                            : <Archive size={22} className={`${HACKER_COLORS.textDim} group-hover:${HACKER_COLORS.primary}`} />
                        }
                    </button>
                    <button 
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} 
                        title="Alternar Visualização"
                        className={`p-2 border-2 ${HACKER_COLORS.borderPrimary} rounded-lg group hover:${HACKER_COLORS.surfaceLighter} transition-all duration-200`}
                    >
                        {viewMode === 'grid' 
                            ? <List size={22} className={`${HACKER_COLORS.textDim} group-hover:${HACKER_COLORS.primary}`} /> 
                            : <LayoutGrid size={22} className={`${HACKER_COLORS.textDim} group-hover:${HACKER_COLORS.primary}`} />
                        }
                    </button>
                    <button 
                        onClick={onAddOffer} 
                        className={`ml-2 ${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} px-6 py-2 rounded-lg shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center space-x-2 text-base font-semibold border border-black/50`}
                    >
                        <PlusCircle size={20} />
                        <span>NOVO TARGET</span>
                    </button>
                </div>
            </div>

            {/* Click outside to close dropdown */}
            {showSortDropdown && (
                <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowSortDropdown(false)}
                />
            )}

            {!userId && isAuthReady && (
                <div className="text-center py-10">
                    <p className={`text-lg ${HACKER_COLORS.destructiveNeon} mb-4`}>
                        FALHA NA AUTENTICAÇÃO.
                    </p>
                    <AlertTriangle size={40} className={`mx-auto ${HACKER_COLORS.destructiveNeon}`} />
                </div>
            )}
            
            {userId && offers.length === 0 && !searchTerm && (
                <div className="text-center py-10">
                    <p className={`text-lg ${HACKER_COLORS.textDim} mb-4`}>
                        NENHUM TARGET {showArchived ? 'ARQUIVADO' : 'ATIVO'} ENCONTRADO.
                    </p>
                    <Zap size={40} className={`mx-auto ${HACKER_COLORS.textDim}`} />
                </div>
            )}
            
            {userId && offers.length === 0 && searchTerm && (
                <div className="text-center py-10">
                    <p className={`text-lg ${HACKER_COLORS.textDim} mb-4`}>
                        NENHUM TARGET PARA "{searchTerm}".
                    </p>
                    <Search size={40} className={`mx-auto ${HACKER_COLORS.textDim}`} />
                </div>
            )}

            {userId && viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {sortedOffers.map(offer => (
                        <OfferCard 
                            key={offer.id} 
                            offer={offer} 
                            onViewDetails={onViewDetails} 
                            onEditOffer={onEditOffer} 
                            onToggleArchive={onToggleArchive} 
                            onDeleteOffer={onDeleteOffer} 
                            userId={userId} 
                            supabaseClient={supabaseClient} 
                            isPinned={pinnedOfferIds.includes(offer.id)}
                            onPin={() => setPinnedOfferIds(prev => prev.includes(offer.id) ? prev : [...prev, offer.id])}
                            onUnpin={() => setPinnedOfferIds(prev => prev.filter(id => id !== offer.id))}
                            isActive={activeOfferIds?.includes(offer.id)}
                            onToggleActive={id => {
                                if (activeOfferIds?.includes(id)) {
                                    setActiveOfferIds(activeOfferIds.filter(oid => oid !== id));
                                } else {
                                    setActiveOfferIds([id, ...(activeOfferIds || [])]);
                                }
                            }}
                        />
                    ))}
                </div>
            ) : userId && (
                <OfferList
                    offers={sortedOffers}
                    onViewDetails={onViewDetails} 
                    onEditOffer={onEditOffer} 
                    onToggleArchive={onToggleArchive} 
                    onDeleteOffer={onDeleteOffer} 
                    supabaseClient={supabaseClient} 
                />
            )}
        </div>
    );
};

export default OfferGridScreen;