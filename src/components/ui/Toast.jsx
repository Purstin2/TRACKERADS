import React, { useEffect } from 'react';
import { CheckCircle, AlertOctagon, Info } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';

export const Toast = React.memo(({ message, type, onClose }) => { 
    let bgColor = HACKER_COLORS.buttonPrimaryBg;
    let textColor = HACKER_COLORS.buttonPrimaryText;
    let iconColor = "text-black";

    if (type === 'error') { 
        bgColor = HACKER_COLORS.buttonDestructiveBg; 
        textColor = HACKER_COLORS.buttonDestructiveText; 
        iconColor = "text-white"; 
    }
    
    if (type === 'info') { 
        bgColor = HACKER_COLORS.buttonSecondaryBg; 
        textColor = HACKER_COLORS.buttonSecondaryText; 
        iconColor = "text-black"; 
    }
    
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
        <div className={`fixed bottom-6 right-6 ${bgColor} ${textColor} p-4 rounded-md shadow-xl flex items-center space-x-3 z-[100] border border-black/50 ${HACKER_COLORS.primaryNeonGlow}`}>
            <IconComponent size={22} className={iconColor} />
            <span className="text-sm font-medium">{message}</span>
            <button onClick={onClose} className={`ml-auto opacity-70 hover:opacity-100 ${textColor}`}>
                &times;
            </button>
        </div>
    );
});