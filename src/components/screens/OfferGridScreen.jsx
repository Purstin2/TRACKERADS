import React from 'react';
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
    supabaseClient 
}) => {
    return (
        <div>
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className={`text-2xl font-semibold ${HACKER_COLORS.primaryNeon}`}>GRID DE TARGETS</h2>
                <div className="flex items-center space-x-2 flex-wrap gap-2">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="BUSCAR TARGET..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.primaryNeon} placeholder-green-700 rounded-md py-2 px-3 pl-10 focus:ring-1 focus:${HACKER_COLORS.borderNeon} outline-none text-sm`} 
                        />
                        <Search 
                            size={16} 
                            className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${HACKER_COLORS.primaryNeon}`} 
                        />
                    </div>
                    
                    <button 
                        onClick={() => setShowArchived(!showArchived)} 
                        title={showArchived ? "Ver Ativas" : "Ver Arquivadas"}
                        className={`p-2 border ${HACKER_COLORS.borderDim} rounded-md group ${
                            showArchived 
                                ? `bg-yellow-800/50 ${HACKER_COLORS.borderNeon}` 
                                : `hover:${HACKER_COLORS.surfaceLighter}`
                        }`}
                    >
                        {showArchived 
                            ? <ArchiveRestore size={18} className="text-yellow-400" /> 
                            : <Archive size={18} className={`${HACKER_COLORS.textDim} group-hover:${HACKER_COLORS.primaryNeon}`} />
                        }
                    </button>
                    
                    <button 
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} 
                        title="Alternar Visualização"
                        className={`p-2 border ${HACKER_COLORS.borderDim} rounded-md group hover:${HACKER_COLORS.surfaceLighter}`}
                    >
                        {viewMode === 'grid' 
                            ? <List size={18} className={`${HACKER_COLORS.textDim} group-hover:${HACKER_COLORS.primaryNeon}`} /> 
                            : <LayoutGrid size={18} className={`${HACKER_COLORS.textDim} group-hover:${HACKER_COLORS.primaryNeon}`} />
                        }
                    </button>
                    
                    <button 
                        onClick={onAddOffer} 
                        className={`${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} px-4 py-2 rounded-md hover:${HACKER_COLORS.buttonPrimaryBg} transition-colors flex items-center space-x-2 text-sm font-medium border border-black/50`}
                    >
                        <PlusCircle size={18} />
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
                    {offers.map(offer => (
                        <OfferCard 
                            key={offer.id} 
                            offer={offer} 
                            onViewDetails={onViewDetails} 
                            onEditOffer={onEditOffer} 
                            onToggleArchive={onToggleArchive} 
                            onDeleteOffer={onDeleteOffer} 
                            userId={userId} 
                            supabaseClient={supabaseClient} 
                        />
                    ))}
                </div>
            ) : userId && (
                <OfferList 
                    offers={offers} 
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