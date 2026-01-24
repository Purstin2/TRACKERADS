import React, { useState } from 'react';
import { PlusCircle, List, LayoutGrid, Search, Zap, AlertTriangle, Archive, ArchiveRestore, Filter, ChevronDown, Download, FileJson, FileText, RefreshCw } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';
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
    const [isScrapingAll, setIsScrapingAll] = useState(false);

    // Sort options
    const sortOptions = [
        { value: 'newest', label: 'Recém Adicionados' },
        { value: 'oldest', label: 'Mais Antigos' },
        { value: 'alphabetical', label: 'Ordem Alfabética' },
        { value: 'most_ads_7d', label: 'Mais Anúncios (7 dias)' },
        { value: 'most_ads_14d', label: 'Mais Anúncios (14 dias)' },
        { value: 'most_ads_30d', label: 'Mais Anúncios (30 dias)' },
        { value: 'consistency_7d', label: 'Maior Consistência (7 dias)' },
        { value: 'consistency_14d', label: 'Maior Consistência (14 dias)' },
        { value: 'consistency_30d', label: 'Maior Consistência (30 dias)' },
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
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
            <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
                <h2 className="text-3xl font-bold text-white">GRID DE TARGETS</h2>
                <div className="flex items-center space-x-3 flex-wrap gap-2">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="BUSCAR TARGET..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-56 sm:w-64 md:w-80 bg-gray-800 border border-gray-600 text-white placeholder-gray-400 rounded-lg py-2 px-4 pl-12 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                        />
                        <Search 
                            size={20} 
                            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
                        />
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => setShowSortDropdown(!showSortDropdown)}
                            className="flex items-center space-x-2 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg hover:bg-gray-700 transition-all duration-200 text-white"
                        >
                            <Filter size={20} className="text-gray-400" />
                            <span className="text-sm font-medium">{sortOptions.find(opt => opt.value === sortBy)?.label}</span>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {showSortDropdown && (
                            <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50">
                                {sortOptions.map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => {
                                            setSortBy(option.value);
                                            setShowSortDropdown(false);
                                        }}
                                        className={`w-full text-left px-4 py-3 text-sm transition-colors border-b border-gray-700 last:border-b-0 ${
                                            sortBy === option.value 
                                                ? 'text-blue-400 bg-blue-900/30' 
                                                : 'text-white hover:text-blue-400 hover:bg-gray-700'
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
                        className={`p-2 border border-gray-600 rounded-lg transition-all duration-200 ${showArchived ? 'bg-yellow-800/60 text-yellow-300' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    >
                        {showArchived 
                            ? <ArchiveRestore size={22} className="text-yellow-300" /> 
                            : <Archive size={22} />
                        }
                    </button>
                    <button 
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} 
                        title="Alternar Visualização"
                        className="p-2 bg-gray-800 border border-gray-600 rounded-lg hover:bg-gray-700 transition-all duration-200 text-gray-400"
                    >
                        {viewMode === 'grid' 
                            ? <List size={22} /> 
                            : <LayoutGrid size={22} />
                        }
                    </button>
                    <button
                        onClick={() => setShowAdvancedFilters(true)}
                        className="p-2 bg-purple-600 border border-purple-500 rounded-lg hover:bg-purple-700 transition-all duration-200 text-white"
                        title="Filtros Avançados"
                    >
                        <Filter size={22} />
                    </button>
                    <div className="relative">
                        <button
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            className="p-2 bg-green-600 border border-green-500 rounded-lg hover:bg-green-700 transition-all duration-200 text-white"
                            title="Exportar Dados"
                        >
                            <Download size={22} />
                        </button>
                        {showExportMenu && (
                            <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50">
                                <button
                                    onClick={() => {
                                        exportToCSV(offers);
                                        setShowExportMenu(false);
                                    }}
                                    className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 transition-colors flex items-center gap-2 border-b border-gray-700"
                                >
                                    <FileText size={16} />
                                    Exportar CSV
                                </button>
                                <button
                                    onClick={() => {
                                        exportToJSON(offers);
                                        setShowExportMenu(false);
                                    }}
                                    className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 transition-colors flex items-center gap-2"
                                >
                                    <FileJson size={16} />
                                    Exportar JSON
                                </button>
                            </div>
                        )}
                    </div>
                    {/* Botão de Scraping Automático de Todas as Ofertas */}
                    {(() => {
                        const offersToScrape = offers.filter(o => o.link && o.link.includes('facebook.com/ads/library') && !o.is_archived);
                        return offersToScrape.length > 0 && (
                            <button
                                onClick={async () => {
                                    setIsScrapingAll(true);
                                    try {
                                        showToast && showToast(`🤖 Iniciando scraping para ${offersToScrape.length} ofertas... Isso pode levar alguns minutos.`, 'info');
                                        
                                        const response = await fetch('http://localhost:3001/api/scrape/run', {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json'
                                            }
                                        });
                                        
                                        const data = await response.json();
                                        
                                        if (response.ok) {
                                            showToast && showToast(`✅ Scraping iniciado! Processando ${offersToScrape.length} ofertas em background. Atualizando automaticamente...`, 'success');
                                            
                                            // Atualiza imediatamente
                                            if (fetchOffers) fetchOffers();
                                            
                                            // Aguarda e atualiza a lista várias vezes
                                            // O scraping pode levar ~3-5 segundos por oferta, então para N ofertas, 
                                            // estimamos N * 5 segundos + margem de segurança
                                            const estimatedTime = offersToScrape.length * 5 + 30; // segundos
                                            const updateInterval = 10000; // A cada 10 segundos
                                            const maxAttempts = Math.ceil(estimatedTime / (updateInterval / 1000)) + 5; // +5 tentativas extras
                                            
                                            let attempts = 0;
                                            const interval = setInterval(() => {
                                                attempts++;
                                                if (fetchOffers) {
                                                    fetchOffers();
                                                    console.log(`[SCRAPING] Atualizando lista (tentativa ${attempts}/${maxAttempts})...`);
                                                }
                                                
                                                if (attempts >= maxAttempts) {
                                                    clearInterval(interval);
                                                    showToast && showToast('🔄 Atualização automática finalizada. Verifique os resultados!', 'info');
                                                } else if (attempts % 3 === 0) {
                                                    // A cada 3 tentativas, mostra progresso
                                                    showToast && showToast(`🔄 Atualizando... (${attempts}/${maxAttempts})`, 'info');
                                                }
                                            }, updateInterval);
                                            
                                            // Limpa o intervalo após o tempo estimado + margem
                                            setTimeout(() => {
                                                clearInterval(interval);
                                                if (fetchOffers) fetchOffers(); // Última atualização
                                                showToast && showToast('✅ Scraping concluído! Lista atualizada.', 'success');
                                            }, estimatedTime * 1000);
                                        } else {
                                            showToast && showToast(`❌ Erro: ${data.error || 'Falha ao iniciar scraping'}`, 'error');
                                        }
                                    } catch (error) {
                                        console.error('Erro ao executar scraping:', error);
                                        showToast && showToast('❌ Erro: Serviço local não está rodando. Inicie o scraper: cd scraper-service && npm start', 'error');
                                    } finally {
                                        // Mantém o botão desabilitado por mais tempo para evitar cliques múltiplos
                                        setTimeout(() => setIsScrapingAll(false), 30000);
                                    }
                                }}
                                disabled={isScrapingAll}
                                className={`ml-2 px-6 py-2 rounded-lg shadow-lg transition-all flex items-center space-x-2 text-base font-semibold ${
                                    isScrapingAll 
                                        ? 'bg-purple-800 cursor-not-allowed opacity-50' 
                                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                                }`}
                                title={`Executar scraping automático para ${offersToScrape.length} ofertas com link do Facebook`}
                            >
                                <RefreshCw size={20} className={isScrapingAll ? 'animate-spin' : ''} />
                                <span>{isScrapingAll ? 'SCRAPING...' : `SCRAPING TODOS (${offersToScrape.length})`}</span>
                            </button>
                        );
                    })()}
                    <button
                        onClick={onAddOffer}
                        className="ml-2 bg-blue-600 text-white px-6 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 text-base font-semibold"
                    >
                        <PlusCircle size={20} />
                        <span>NOVO TARGET</span>
                    </button>
                </div>
            </div>

            {/* Click outside to close dropdowns */}
            {showSortDropdown && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowSortDropdown(false)}
                />
            )}
            {showExportMenu && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowExportMenu(false)}
                />
            )}

            {showAdvancedFilters && (
                <AdvancedFilters
                    offers={offers}
                    onFilterChange={(filtered) => {
                        setLocalFilteredOffers(filtered);
                    }}
                    onClose={() => setShowAdvancedFilters(false)}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
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