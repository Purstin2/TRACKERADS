import React, { useEffect } from 'react';
import { CheckCircle, AlertOctagon, Info } from 'lucide-react';

export const Toast = React.memo(({ message, type, onClose }) => { 
    let containerClass;

    if (type === 'error') {
        containerClass = 'bg-red-500/10 border border-red-500/20 text-red-300';
    } else if (type === 'info') {
        containerClass = 'bg-blue-500/10 border border-blue-500/20 text-blue-300';
    } else {
        containerClass = 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300';
    }

    const iconClass = type === 'error' ? 'text-red-400' : type === 'info' ? 'text-blue-400' : 'text-emerald-400';
    
    const IconComponent = type === 'success' 
        ? CheckCircle 
        : type === 'error' 
            ? AlertOctagon 
            : Info;
    
    useEffect(() => {
        let timeoutId;
        if (message) { 
            timeoutId = setTimeout(() => { onClose(); }, 4000);
        }
        return () => { if (timeoutId) clearTimeout(timeoutId); };
    }, [message, onClose]);

    if (!message) return null;

    return (
        <div className={`fixed bottom-6 right-6 ${containerClass} backdrop-blur-xl p-4 rounded-2xl shadow-2xl flex items-center gap-3 z-[100] min-w-[280px] max-w-sm`}>
            <IconComponent size={18} className={iconClass} />
            <span className="text-sm font-medium flex-1">{message}</span>
            <button onClick={onClose} className="opacity-50 hover:opacity-100 transition-opacity text-lg leading-none ml-1">
                &times;
            </button>
        </div>
    );
});