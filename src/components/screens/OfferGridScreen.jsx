import React, { useState, useEffect } from 'react';
import { PlusCircle, List, LayoutGrid, Search, Zap, AlertTriangle, Archive, ArchiveRestore, Filter, ChevronDown, Download, FileJson, FileText, RefreshCw } from 'lucide-react';
import { exportToCSV, exportToJSON } from '../../utils/exportHelpers';
import OfferCard from '../targets/OfferCard';
import OfferList from '../targets/OfferList';
import AdvancedFilters from '../ui/AdvancedFilters';

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
    setActiveOfferIds,
    showToast,
    fetchOffers
}) => {
    const [sortBy, setSortBy] = useState('newest');
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [localFilteredOffers, setLocalFilteredOffers] = useState(offers);
    const [filtersActive, setFiltersActive] = useState(false);
    const [isScrapingAll, setIsScrapingAll] = useState(false);

    // Sync localFilteredOffers when offers prop changes (only if no active advanced filter)
    useEffect(() => {
        if (!filtersActive) {
            setLocalFilteredOffers(offers);
        }
    }, [offers, filtersActive]);

    // Sort options
    const sortOptions = [
        { value: 'newest', label: 'RecÃ©m Adicionados' },
        { value: 'oldest', label: 'Mais Antigos' },
        { value: 'alphabetical', label: 'Ordem AlfabÃ©tica' },
        { value: 'most_ads_7d', label: 'Mais AnÃºncios (7 dias)' },
        { value: 'most_ads_14d', label: 'Mais AnÃºncios (14 dias)' },
        { value: 'most_ads_30d', label: 'Mais AnÃºncios (30 dias)' },
        { value: 'consistency_7d', label: 'Maior ConsistÃªncia (7 dias)' },
        { value: 'consistency_14d', label: 'Maior ConsistÃªncia (14 dias)' },
        { value: 'consistency_30d', label: 'Maior ConsistÃªncia (30 dias)' },
        { value: 'trending_up', label: 'Em Alta (crescimento)' },
        { value: 'trending_down', label: 'Em Queda (decrescimento)' },
        { value: 'most_active', label: 'Mais Ativos Recentemente' }
    ];

    // Function to calculate 7-day metrics for sorting
    const calculateMetrics = (offer, adCounts, days = 7) => {
        const now = new Date();
        const daysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        
        const recentCounts = adCounts.filter(ac => 
            new Date(ac.timestamp) >= daysAgo
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

    // Cards fixados no topo — usa localFilteredOffers quando filtros avançados estão ativos
    const sortedOffers = [...localFilteredOffers].sort((a, b) => {
        const aPinnedIdx = pinnedOfferIds.indexOf(a.id);
        const bPinnedIdx = pinnedOfferIds.indexOf(b.id);
        
        // Pinned offers always come first
        if (aPinnedIdx !== -1 && bPinnedIdx !== -1) {
            return aPinnedIdx - bPinnedIdx; // mantÃ©m ordem de fixaÃ§Ã£o
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
                const aMaxAds7 = calculateMetrics(a, [], 7).maxAds;
                const bMaxAds7 = calculateMetrics(b, [], 7).maxAds;
                return bMaxAds7 - aMaxAds7;
            case 'most_ads_14d':
                const aMaxAds14 = calculateMetrics(a, [], 14).maxAds;
                const bMaxAds14 = calculateMetrics(b, [], 14).maxAds;
                return bMaxAds14 - aMaxAds14;
            case 'most_ads_30d':
                const aMaxAds30 = calculateMetrics(a, [], 30).maxAds;
                const bMaxAds30 = calculateMetrics(b, [], 30).maxAds;
                return bMaxAds30 - aMaxAds30;
            case 'consistency_7d':
                const aConsistency7 = calculateMetrics(a, [], 7).consistency;
                const bConsistency7 = calculateMetrics(b, [], 7).consistency;
                return bConsistency7 - aConsistency7;
            case 'consistency_14d':
                const aConsistency14 = calculateMetrics(a, [], 14).consistency;
                const bConsistency14 = calculateMetrics(b, [], 14).consistency;
                return bConsistency14 - aConsistency14;
            case 'consistency_30d':
                const aConsistency30 = calculateMetrics(a, [], 30).consistency;
                const bConsistency30 = calculateMetrics(b, [], 30).consistency;
                return bConsistency30 - aConsistency30;
            case 'trending_up':
                const aTrendUp = calculateMetrics(a, [], 7).trend;
                const bTrendUp = calculateMetrics(b, [], 7).trend;
                return bTrendUp - aTrendUp;
            case 'trending_down':
                const aTrendDown = calculateMetrics(a, [], 7).trend;
                const bTrendDown = calculateMetrics(b, [], 7).trend;
                return aTrendDown - bTrendDown;
            case 'most_active':
                const aActivity = calculateMetrics(a, [], 7).lastActivity;
                const bActivity = calculateMetrics(b, [], 7).lastActivity;
                return bActivity - aActivity;
            default:
                return 0;
        }
    });

    return (
        <div className="px-6 lg:px-8 max-w-7xl mx-auto py-7 animate-fade-in">

            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">
                            {showArchived ? 'Targets Arquivados' : 'Targets'}
                        </h2>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {offers.length} {offers.length === 1 ? 'target' : 'targets'}
                            {searchTerm ? ` para "${searchTerm}"` : ''}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Scrape All */}
                        {(() => {
                            const offersToScrape = offers.filter(o => o.link && o.link.includes('facebook.com/ads/library') && !o.is_archived);
                            if (offersToScrape.length === 0) return null;
                            return (
                                <button
                                    onClick={async () => {
                                        setIsScrapingAll(true);
                                        try {
                                            showToast && showToast(`Iniciando scraping para ${offersToScrape.length} targets...`, 'info');
                                            const response = await fetch(`${import.meta.env.VITE_SCRAPER_URL || 'http://localhost:3001'}/api/scrape/run`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' }
                                            });
                                            const data = await response.json();
                                            if (response.ok) {
                                                showToast && showToast(`Scraping em andamento para ${offersToScrape.length} targets.`, 'success');
                                                if (fetchOffers) fetchOffers();
                                                const estimatedTime = offersToScrape.length * 5 + 30;
                                                let attempts = 0;
                                                const maxAttempts = Math.ceil(estimatedTime / 10) + 5;
                                                const interval = setInterval(() => {
                                                    attempts++;
                                                    if (fetchOffers) fetchOffers();
                                                    if (attempts >= maxAttempts) {
                                                        clearInterval(interval);
                                                        showToast && showToast('AtualizaÃ§Ã£o automÃ¡tica finalizada.', 'info');
                                                    }
                                                }, 10000);
                                                setTimeout(() => { clearInterval(interval); if (fetchOffers) fetchOffers(); }, estimatedTime * 1000);
                                            } else {
                                                showToast && showToast(`Erro: ${data.error || 'Falha'}`, 'error');
                                            }
                                        } catch {
                                            showToast && showToast('ServiÃ§o local nÃ£o estÃ¡ rodando.', 'error');
                                        } finally {
                                            setTimeout(() => setIsScrapingAll(false), 30000);
                                        }
                                    }}
                                    disabled={isScrapingAll}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                                        isScrapingAll
                                            ? 'bg-violet-600/40 cursor-not-allowed opacity-60 text-white'
                                            : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-700/20'
                                    }`}
                                    title={`Scraping automÃ¡tico para ${offersToScrape.length} targets`}
                                >
                                    <RefreshCw size={15} className={isScrapingAll ? 'animate-spin' : ''} />
                                    {isScrapingAll ? 'Scraping...' : `Scraping (${offersToScrape.length})`}
                                </button>
                            );
                        })()}
                        <button
                            onClick={onAddOffer}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-700/20 transition-all"
                        >
                            <PlusCircle size={15} />
                            Novo Target
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Buscar target..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-[#131929] border border-white/[0.08] focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none text-slate-200 placeholder:text-slate-600 rounded-xl py-2 px-4 pl-9 text-sm transition-all"
                        />
                    </div>

                    {/* Sort */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSortDropdown(!showSortDropdown)}
                            className="flex items-center gap-2 px-3 py-2 bg-[#131929] border border-white/[0.08] hover:border-white/[0.14] rounded-xl text-sm text-slate-400 hover:text-slate-200 font-medium transition-all"
                        >
                            <Filter size={14} className="text-slate-500" />
                            <span className="max-w-[130px] truncate">{sortOptions.find(opt => opt.value === sortBy)?.label}</span>
                            <ChevronDown size={13} className={`text-slate-500 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {showSortDropdown && (
                            <div className="absolute top-full left-0 mt-2 w-60 bg-[#0D1220] border border-white/[0.09] rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden py-1">
                                {sortOptions.map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => { setSortBy(option.value); setShowSortDropdown(false); }}
                                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                            sortBy === option.value
                                                ? 'text-blue-400 bg-blue-500/10 font-semibold'
                                                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 ml-auto">
                        {/* Archive toggle */}
                        <button
                            onClick={() => setShowArchived(!showArchived)}
                            title={showArchived ? 'Ver Ativas' : 'Ver Arquivadas'}
                            className={`p-2 rounded-xl border transition-all ${
                                showArchived
                                    ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                                    : 'bg-[#131929] border-white/[0.07] text-slate-500 hover:text-amber-400 hover:border-amber-500/20'
                            }`}
                        >
                            {showArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                        </button>

                        {/* View mode */}
                        <button
                            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                            title="Alternar visualizaÃ§Ã£o"
                            className="p-2 bg-[#131929] border border-white/[0.07] hover:border-white/[0.14] rounded-xl text-slate-500 hover:text-slate-200 transition-all"
                        >
                            {viewMode === 'grid' ? <List size={16} /> : <LayoutGrid size={16} />}
                        </button>

                        {/* Advanced filters */}
                        <button
                            onClick={() => setShowAdvancedFilters(true)}
                            className="p-2 bg-violet-600/10 border border-violet-500/20 hover:bg-violet-600/20 rounded-xl text-violet-400 transition-all"
                            title="Filtros avanÃ§ados"
                        >
                            <Filter size={16} />
                        </button>

                        {/* Export */}
                        <div className="relative">
                            <button
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                className="p-2 bg-emerald-600/10 border border-emerald-500/20 hover:bg-emerald-600/20 rounded-xl text-emerald-400 transition-all"
                                title="Exportar dados"
                            >
                                <Download size={16} />
                            </button>
                            {showExportMenu && (
                                <div className="absolute right-0 top-full mt-2 w-44 bg-[#0D1220] border border-white/[0.09] rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden py-1">
                                    <button
                                        onClick={() => { exportToCSV(offers); setShowExportMenu(false); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors flex items-center gap-2"
                                    >
                                        <FileText size={14} /> Exportar CSV
                                    </button>
                                    <button
                                        onClick={() => { exportToJSON(offers); setShowExportMenu(false); }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors flex items-center gap-2"
                                    >
                                        <FileJson size={14} /> Exportar JSON
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Click outside overlays */}
            {showSortDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowSortDropdown(false)} />}
            {showExportMenu && <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />}

            {showAdvancedFilters && (
                <AdvancedFilters
                    offers={offers}
                    onFilterChange={(filtered) => {
                        setLocalFilteredOffers(filtered);
                        setFiltersActive(filtered.length !== offers.length || filtered.some((f, i) => f.id !== offers[i]?.id));
                    }}
                    onClose={() => setShowAdvancedFilters(false)}
                />
            )}

            {/* Empty states */}
            {!userId && isAuthReady && (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                    <AlertTriangle size={32} className="text-rose-500" />
                    <p className="text-slate-500 text-sm">AutenticaÃ§Ã£o necessÃ¡ria.</p>
                </div>
            )}

            {userId && offers.length === 0 && !searchTerm && (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center">
                        <Zap size={24} className="text-blue-500" />
                    </div>
                    <div className="text-center">
                        <p className="text-slate-300 font-medium">Nenhum target {showArchived ? 'arquivado' : 'ainda'}</p>
                        <p className="text-slate-600 text-sm mt-1">{showArchived ? 'Nenhum target foi arquivado.' : 'Clique em "Novo Target" para comeÃ§ar.'}</p>
                    </div>
                </div>
            )}

            {userId && offers.length === 0 && searchTerm && (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                    <Search size={32} className="text-slate-600" />
                    <p className="text-slate-500 text-sm">Nenhum resultado para <span className="text-slate-300">"{searchTerm}"</span></p>
                </div>
            )}

            {/* Grid / List */}
            {userId && viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
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
                            fetchOffers={fetchOffers}
                            showToast={showToast}
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
