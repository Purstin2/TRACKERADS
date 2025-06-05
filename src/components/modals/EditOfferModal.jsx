import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { HACKER_COLORS } from '../../styles/theme';

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
            showToast("NOME É OBRIGATÓRIO.", "error"); 
            return; 
        }
        
        onUpdateOffer(
            offerToEdit.id, 
            { 
                name: name.trim(), 
                link: link.trim() || null, 
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
        <Modal isOpen={isOpen} onClose={onClose} title="EDITAR TARGET">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label 
                        htmlFor="offerNameEdit" 
                        className={`block text-sm font-medium ${HACKER_COLORS.textDim} mb-1`}
                    >
                        NOME DO TARGET *
                    </label>
                    <input 
                        type="text" 
                        id="offerNameEdit" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        required 
                        className={`w-full ${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.primaryNeon} p-2.5 rounded-md focus:ring-1 focus:${HACKER_COLORS.borderNeon} outline-none text-sm`}
                    />
                </div>
                
                <div>
                    <label 
                        htmlFor="offerLinkEdit" 
                        className={`block text-sm font-medium ${HACKER_COLORS.textDim} mb-1`}
                    >
                        LINK
                    </label>
                    <input 
                        type="url" 
                        id="offerLinkEdit" 
                        value={link} 
                        onChange={(e) => setLink(e.target.value)} 
                        className={`w-full ${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderDim} ${HACKER_COLORS.primaryNeon} p-2.5 rounded-md focus:ring-1 focus:${HACKER_COLORS.borderNeon} outline-none text-sm`}
                    />
                </div>
                
                <div>
                    <label 
                        htmlFor="offerTagsEdit" 
                        className={`block text-sm font-medium ${HACKER_COLORS.textDim} mb-1`}
                    >
                        TAGS
                    </label>
                    <input 
                        type="text" 
                        id="offerTagsEdit" 
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
                        <Save size={16} /> <span>SALVAR ALTERAÇÕES</span>
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default EditOfferModal;