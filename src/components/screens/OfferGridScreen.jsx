import React, { useState } from 'react';
import { PlusCircle, List, LayoutGrid, Search, Zap, AlertTriangle, Archive, ArchiveRestore } from 'lucide-react';
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
    pinnedOfferId, 
    setPinnedOfferId,
    activeOfferIds,
    setActiveOfferIds
}) => {
    // Estado para controlar a aba selecionada
    const [selectedCategory, setSelectedCategory] = useState('infoproduto');

    // Filtra as ofertas pela categoria selecionada
    const filteredOffers = offers.filter(offer => offer.category === selectedCategory);

    // Cards fixados no topo
    const sortedOffers = [...filteredOffers].sort((a, b) => {
        if (a.id === pinnedOfferId) return -1;
        if (b.id === pinnedOfferId) return 1;
        return 0;
    });

    return (
        <div className="px-2 sm:px-6 md:px-12 max-w-7xl mx-auto">
            {/* Abas de categoria */}
            <div className="flex mb-6 gap-4 border-b-2 border-blue-800/30 pb-2">
                <button
                    className={`px-6 py-2 rounded-t-lg font-bold text-lg tracking-wide border-b-4 transition-all duration-200 ${selectedCategory === 'infoproduto' ? `bg-gradient-to-r from-blue-900/60 to-blue-800/60 ${HACKER_COLORS.primary} border-blue-400 shadow-md` : `bg-[#23262F]/60 ${HACKER_COLORS.textDim} border-transparent`}`}
                    onClick={() => setSelectedCategory('infoproduto')}
                >
                    Infoprodutos
                </button>
                <button
                    className={`px-6 py-2 rounded-t-lg font-bold text-lg tracking-wide border-b-4 transition-all duration-200 ${selectedCategory === 'dropshipping' ? `bg-gradient-to-r from-purple-900/60 to-purple-800/60 ${HACKER_COLORS.secondary} border-purple-400 shadow-md` : `bg-[#23262F]/60 ${HACKER_COLORS.textDim} border-transparent`}`}
                    onClick={() => setSelectedCategory('dropshipping')}
                >
                    Dropshipping
                </button>
            </div>
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

            {!userId && isAuthReady && (
                <div className="text-center py-10">
                    <p className={`text-lg ${HACKER_COLORS.destructiveNeon} mb-4`}>
                        FALHA NA AUTENTICAÇÃO.
                    </p>
                    <AlertTriangle size={40} className={`mx-auto ${HACKER_COLORS.destructiveNeon}`} />
                </div>
            )}
            
            {userId && filteredOffers.length === 0 && !searchTerm && (
                <div className="text-center py-10">
                    <p className={`text-lg ${HACKER_COLORS.textDim} mb-4`}>
                        NENHUM TARGET {showArchived ? 'ARQUIVADO' : 'ATIVO'} ENCONTRADO.
                    </p>
                    <Zap size={40} className={`mx-auto ${HACKER_COLORS.textDim}`} />
                </div>
            )}
            
            {userId && filteredOffers.length === 0 && searchTerm && (
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
                            isPinned={offer.id === pinnedOfferId}
                            onPin={() => setPinnedOfferId(offer.id)}
                            onUnpin={() => setPinnedOfferId(null)}
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
                    offers={filteredOffers} 
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