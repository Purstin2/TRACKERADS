import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Modal } from '../ui/Modal';

const inputClass = "w-full bg-[#131929] border border-white/[0.08] text-white rounded-xl py-2.5 px-3 text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors";
const labelClass = "block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5";

const EditOfferModal = ({ isOpen, onClose, onUpdateOffer, offerToEdit, showToast }) => {
    const [name, setName] = useState('');
    const [link, setLink] = useState('');
    const [tags, setTags] = useState('');

    useEffect(() => {
        if (offerToEdit) {
            setName(offerToEdit.name || '');
            setLink(offerToEdit.link || '');
            setTags(offerToEdit.tags ? offerToEdit.tags.join(', ') : '');
        }
    }, [offerToEdit]);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!name.trim()) { 
            showToast("Nome é obrigatório.", "error"); 
            return; 
        }
        
        onUpdateOffer(
            offerToEdit.id, 
            { 
                name: name.trim(), 
                link: link.trim() || '',
                tags: tags.split(',')
                    .map(t => t.trim())
                    .filter(t => t).length > 0 
                        ? tags.split(',').map(t => t.trim()).filter(t => t) 
                        : null 
            }
        );
    };

    if (!offerToEdit) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Editar Target">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="offerNameEdit" className={labelClass}>Nome do Target *</label>
                    <input 
                        type="text" 
                        id="offerNameEdit" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        required 
                        className={inputClass}
                    />
                </div>
                
                <div>
                    <label htmlFor="offerLinkEdit" className={labelClass}>Link</label>
                    <input 
                        type="url" 
                        id="offerLinkEdit" 
                        value={link} 
                        onChange={(e) => setLink(e.target.value)} 
                        className={inputClass}
                        placeholder="https://..."
                    />
                </div>
                
                <div>
                    <label htmlFor="offerTagsEdit" className={labelClass}>Tags (separadas por vírgula)</label>
                    <input 
                        type="text" 
                        id="offerTagsEdit" 
                        value={tags} 
                        onChange={(e) => setTags(e.target.value)} 
                        className={inputClass}
                        placeholder="ecommerce, produto"
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
                        <Save size={15} /> Salvar Alterações
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default EditOfferModal;