import React from 'react';
import { Eye, Trash2, Edit3, ExternalLink, Archive, ArchiveRestore } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';
import { getSafeTimestamp } from '../../utils/helpers';

const OfferList = ({ offers, onViewDetails, onEditOffer, onToggleArchive, onDeleteOffer }) => { 
    return (
        <div className={`overflow-x-auto ${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderNeon} rounded-md shadow-md ${HACKER_COLORS.primaryNeonGlow}`}>
            <table className="w-full">
                <thead className={`border-b-2 ${HACKER_COLORS.borderNeon}`}>
                    <tr>
                        <th className={`p-3 text-left text-xs font-medium ${HACKER_COLORS.primaryNeon} tracking-wider`}>
                            TARGET
                        </th>
                        <th className={`p-3 text-left text-xs font-medium ${HACKER_COLORS.primaryNeon} tracking-wider`}>
                            ANÚNCIOS
                        </th>
                        <th className={`p-3 text-left text-xs font-medium ${HACKER_COLORS.primaryNeon} tracking-wider`}>
                            ATUALIZADO EM
                        </th>
                        <th className={`p-3 text-left text-xs font-medium ${HACKER_COLORS.primaryNeon} tracking-wider`}>
                            AÇÕES
                        </th>
                    </tr>
                </thead>
                <tbody className={`${HACKER_COLORS.textBase}`}>
                    {offers.map(offer => (
                        <tr 
                            key={offer.id} 
                            className={`border-b ${HACKER_COLORS.borderDim} hover:bg-gray-800/50 transition-colors ${offer.is_archived ? 'opacity-50' : ''}`}
                        >
                            <td className="p-3 text-sm font-medium whitespace-nowrap max-w-xs truncate" title={offer.name}>
                                {offer.name}
                                {offer.link && (
                                    <a 
                                        href={offer.link} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="ml-1.5 text-cyan-400 hover:text-cyan-300"
                                    >
                                        <ExternalLink size={12} className="inline"/>
                                    </a>
                                )}
                            </td>
                            <td className="p-3 text-lg font-semibold">
                                {offer.last_ad_count ?? 0}
                            </td>
                            <td className={`p-3 text-xs ${HACKER_COLORS.textDim} whitespace-nowrap`}>
                                {getSafeTimestamp(offer.last_ad_count_timestamp)}
                            </td>
                            <td className="p-3">
                                <div className="flex space-x-2">
                                    <button 
                                        onClick={() => onViewDetails(offer.id)} 
                                        className={`${HACKER_COLORS.textDim} hover:${HACKER_COLORS.primaryNeon}`} 
                                        title="Analisar"
                                    >
                                        <Eye size={16} />
                                    </button>
                                    
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
                                    
                                    <button 
                                        onClick={() => onDeleteOffer(offer.id)} 
                                        className={`${HACKER_COLORS.textDim} hover:${HACKER_COLORS.destructiveNeon}`} 
                                        title="Excluir"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default OfferList;