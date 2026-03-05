import React, { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';

const inputClass = "w-full bg-[#131929] border border-white/[0.08] text-white rounded-xl py-2.5 px-3 text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors";
const labelClass = "block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5";

const AddOfferModal = ({ isOpen, onClose, onAddOffer, showToast }) => {
    const [name, setName] = useState('');
    const [link, setLink] = useState('');
    const [tags, setTags] = useState('');
    const [adCount, setAdCount] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!name.trim()) {
            showToast("Nome é obrigatório.", "error");
            return;
        }

        const offerData = {
            name: name.trim(),
            link: link.trim() || '',
            tags: tags.split(',')
                .map(t => t.trim())
                .filter(t => t).length > 0
                    ? tags.split(',').map(t => t.trim()).filter(t => t)
                    : null
        };

        if (adCount.trim()) {
            const count = parseInt(adCount, 10);
            if (!isNaN(count) && count >= 0) {
                offerData.initial_ad_count = count;
            } else {
                showToast("Número de ads inválido.", "error");
                return;
            }
        }

        onAddOffer(offerData);

        setName('');
        setLink('');
        setTags('');
        setAdCount('');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Novo Target">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="offerNameAdd" className={labelClass}>Nome do Target *</label>
                    <input 
                        type="text" 
                        id="offerNameAdd" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        required 
                        className={inputClass}
                        placeholder="Ex: Concorrente A"
                    />
                </div>
                
                <div>
                    <label htmlFor="offerLinkAdd" className={labelClass}>Link (opcional)</label>
                    <input 
                        type="url" 
                        id="offerLinkAdd" 
                        value={link} 
                        onChange={(e) => setLink(e.target.value)} 
                        className={inputClass}
                        placeholder="https://..."
                    />
                </div>
                
                <div>
                    <label htmlFor="offerTagsAdd" className={labelClass}>Tags (separadas por vírgula)</label>
                    <input
                        type="text"
                        id="offerTagsAdd"
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        className={inputClass}
                        placeholder="ecommerce, produto, blackfriday"
                    />
                </div>

                <div>
                    <label htmlFor="offerAdCountAdd" className={labelClass}>Número de Ads (opcional)</label>
                    <input
                        type="number"
                        id="offerAdCountAdd"
                        value={adCount}
                        onChange={(e) => setAdCount(e.target.value)}
                        min="0"
                        className={inputClass}
                        placeholder="0"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-white/[0.05] hover:bg-white/[0.08] transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        type="submit" 
                        className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
                    >
                        <PlusCircle size={15}/> Adicionar Target
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default AddOfferModal;