import React from 'react';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, children }) => { 
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#0D1220] border border-white/[0.1] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="flex justify-between items-center p-6 border-b border-white/[0.07]">
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                    <button 
                        onClick={onClose} 
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};

export const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => { 
    if (!isOpen) return null;
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <p className="text-slate-300 mb-6 text-sm">{message}</p>
            <div className="flex justify-end gap-3">
                <button 
                    onClick={onClose} 
                    className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 bg-white/[0.05] hover:bg-white/[0.08] transition-colors"
                >
                    Cancelar
                </button>
                <button 
                    onClick={() => { onConfirm(); onClose(); }} 
                    className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-500 transition-colors"
                >
                    Confirmar
                </button>
            </div>
        </Modal>
    );
};