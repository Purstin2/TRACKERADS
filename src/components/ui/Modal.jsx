import React from 'react';
import { XCircle } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';

export const Modal = ({ isOpen, onClose, title, children }) => { 
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`${HACKER_COLORS.surface} border ${HACKER_COLORS.borderNeon} ${HACKER_COLORS.primaryNeonGlow} rounded-md p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto`}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className={`text-2xl font-mono ${HACKER_COLORS.primaryNeon}`}>{title}</h3>
                    <button 
                        onClick={onClose} 
                        className={`${HACKER_COLORS.textDim} hover:${HACKER_COLORS.destructiveNeon} transition-colors`}
                    >
                        <XCircle size={28} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
};

export const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => { 
    if (!isOpen) return null;
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <p className={`${HACKER_COLORS.textBase} mb-6 text-sm`}>{message}</p>
            <div className="flex justify-end space-x-3">
                <button 
                    onClick={onClose} 
                    className={`px-4 py-2 rounded-md text-sm font-medium ${HACKER_COLORS.textDim} bg-gray-700 hover:bg-gray-600 transition-colors`}
                >
                    CANCELAR
                </button>
                <button 
                    onClick={() => { onConfirm(); onClose(); }} 
                    className={`px-4 py-2 rounded-md text-sm font-medium ${HACKER_COLORS.buttonDestructiveText} ${HACKER_COLORS.buttonDestructiveBg} transition-colors`}
                >
                    CONFIRMAR
                </button>
            </div>
        </Modal>
    );
};