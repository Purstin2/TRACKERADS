import React from 'react';
import { Eye, Trash2, Pencil, ExternalLink, Archive, ArchiveRestore } from 'lucide-react';
import { getSafeTimestamp } from '../../utils/helpers';

const OfferList = ({ offers, onViewDetails, onEditOffer, onToggleArchive, onDeleteOffer }) => { 
    return (
        <div className="overflow-x-auto bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl">
            <table className="w-full">
                <thead className="border-b border-white/[0.07]">
                    <tr>
                        <th className="p-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Target
                        </th>
                        <th className="p-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Anúncios
                        </th>
                        <th className="p-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Atualizado em
                        </th>
                        <th className="p-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Ações
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {offers.map(offer => (
                        <tr 
                            key={offer.id} 
                            className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${offer.is_archived ? 'opacity-40' : ''}`}
                        >
                            <td className="p-4 text-sm font-medium text-slate-200 whitespace-nowrap max-w-xs truncate" title={offer.name}>
                                {offer.name}
                                {offer.link && (
                                    <a 
                                        href={offer.link} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="ml-1.5 text-blue-400 hover:text-blue-300"
                                    >
                                        <ExternalLink size={12} className="inline"/>
                                    </a>
                                )}
                            </td>
                            <td className="p-4 text-lg font-semibold text-white tabular-nums">
                                {offer.last_ad_count ?? 0}
                            </td>
                            <td className="p-4 text-xs text-slate-500 whitespace-nowrap tabular-nums">
                                {getSafeTimestamp(offer.last_ad_count_timestamp)}
                            </td>
                            <td className="p-4">
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={(e) => {
                                            e.preventDefault();
                                            const currentUrl = window.location.origin + window.location.pathname;
                                            const newUrl = `${currentUrl}?view=detail&id=${offer.id}`;
                                            window.open(newUrl, '_blank');
                                        }}
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors" 
                                        title="Analisar"
                                    >
                                        <Eye size={15} />
                                    </button>
                                    
                                    <button 
                                        onClick={() => onEditOffer(offer)} 
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors" 
                                        title="Editar"
                                    >
                                        <Pencil size={15} />
                                    </button>
                                    
                                    <button 
                                        onClick={() => onToggleArchive(offer.id, offer.is_archived)} 
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors" 
                                        title={offer.is_archived ? "Restaurar" : "Arquivar"}
                                    >
                                        {offer.is_archived ? <ArchiveRestore size={15}/> : <Archive size={15}/>}
                                    </button>
                                    
                                    <button 
                                        onClick={() => onDeleteOffer(offer.id)} 
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" 
                                        title="Excluir"
                                    >
                                        <Trash2 size={15} />
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