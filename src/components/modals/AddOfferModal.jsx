import React, { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { HACKER_COLORS } from '../../styles/theme';

const AddOfferModal = ({ isOpen, onClose, onAddOffer, showToast }) => {
    const [name, setName] = useState('');
    const [link, setLink] = useState('');
    const [tags, setTags] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!name.trim()) { 
            showToast("NOME É OBRIGATÓRIO.", "error"); 
            return; 
        }
        
        onAddOffer({ 
            name: name.trim(), 
            link: link.trim() || '', // Changed from null to empty string
            tags: tags.split(',')
                .map(t => t.trim())
                .filter(t => t).length > 0 
                    ? tags.split(',').map(t => t.trim()).filter(t => t) 
                    : null 
        });
        
        setName(''); 
        setLink(''); 
        setTags('');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="NOVO TARGET">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label 
                        htmlFor="offerNameAdd" 
                        className={`block text-sm font-medium ${HACKER_COLORS.textDim} mb-1`}
                    >
                        NOME DO TARGET *
                    </label>
                    <input 
                        type="text" 
                        id="offerNameAdd" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        required 
                        className={`w-full ${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.primaryNeon} p-2.5 rounded-md focus:ring-1 focus:${HACKER_COLORS.borderNeon} outline-none text-sm`} 
                    />
                </div>
                
                <div>
                    <label 
                        htmlFor="offerLinkAdd" 
                        className={`block text-sm font-medium ${HACKER_COLORS.textDim} mb-1`}
                    >
                        LINK (OPCIONAL)
                    </label>
                    <input 
                        type="url" 
                        id="offerLinkAdd" 
                        value={link} 
                        onChange={(e) => setLink(e.target.value)} 
                        className={`w-full ${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.primaryNeon} p-2.5 rounded-md focus:ring-1 focus:${HACKER_COLORS.borderNeon} outline-none text-sm`} 
                    />
                </div>
                
                <div>
                    <label 
                        htmlFor="offerTagsAdd" 
                        className={`block text-sm font-medium ${HACKER_COLORS.textDim} mb-1`}
                    >
                        TAGS (SEPARADAS POR VÍRGULA)
                    </label>
                    <input 
                        type="text" 
                        id="offerTagsAdd" 
                        value={tags} 
                        onChange={(e) => setTags(e.target.value)} 
                        className={`w-full ${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.primaryNeon} p-2.5 rounded-md focus:ring-1 focus:${HACKER_COLORS.borderNeon} outline-none text-sm`} 
                    />
                </div>
                
                <div className="flex justify-end pt-3 space-x-3">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className={`px-4 py-2 rounded-md text-sm font-medium ${HACKER_COLORS.textDim} bg-gray-700 hover:bg-gray-600 transition-colors`}
                    >
                        CANCELAR
                    </button>
                    <button 
                        type="submit" 
                        className={`${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} px-5 py-2 rounded-md hover:${HACKER_COLORS.buttonPrimaryBg} flex items-center space-x-2 text-sm font-medium border border-black/50`}
                    >
                        <PlusCircle size={16}/> <span>ADICIONAR TARGET</span>
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default AddOfferModal;