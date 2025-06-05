import React from 'react';
import { HACKER_COLORS } from '../../styles/theme';

const ComparativeAnalysisScreen = ({ offers, userId, showToast, supabaseClient }) => { 
    return (
        <div className={`${HACKER_COLORS.surfaceLighter} border ${HACKER_COLORS.borderNeon} p-6 rounded-md shadow-md`}>
            <h2 className={`text-2xl font-semibold ${HACKER_COLORS.primaryNeon} mb-6`}>ANÁLISE COMPARATIVA</h2>
            
            <div className="flex justify-center items-center h-64">
                <p className={`${HACKER_COLORS.secondaryNeon} text-lg`}>
                    Funcionalidade em desenvolvimento. Disponível em breve.
                </p>
            </div>
            
            <div className="mt-6 border-t border-gray-700 pt-4">
                <p className={`${HACKER_COLORS.textDim} text-sm`}>
                    Esta seção permitirá comparar métricas entre diferentes targets, 
                    identificar padrões de crescimento/queda e visualizar estatísticas
                    agregadas por períodos e categorias.
                </p>
            </div>
        </div>
    );
};

export default ComparativeAnalysisScreen;