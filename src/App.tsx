import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabaseClient, isSupabaseMockActive } from './utils/supabaseClient';
import { HACKER_COLORS } from './styles/theme';
import { Toast } from './components/ui/Toast';
import { Modal, ConfirmationModal } from './components/ui/Modal';
import OfferGridScreen from './components/screens/OfferGridScreen';
import OfferDetailScreen from './components/screens/OfferDetailScreen';
import ComparativeAnalysisScreen from './components/screens/ComparativeAnalysisScreen';
import AddOfferModal from './components/modals/AddOfferModal';
import EditOfferModal from './components/modals/EditOfferModal';
import { Database, LayoutGrid, ChevronsLeftRight } from 'lucide-react';

function App() {
    const [currentScreen, setCurrentScreen] = useState('grid'); 
    const [selectedOfferId, setSelectedOfferId] = useState(null);
    const [offerToEdit, setOfferToEdit] = useState(null);
    const [offers, setOffers] = useState([]);
    const [userId, setUserId] = useState(null); 
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('grid'); 
    const [isAddOfferModalOpen, setIsAddOfferModalOpen] = useState(false);
    const [isEditOfferModalOpen, setIsEditOfferModalOpen] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [toast, setToast] = useState({ message: '', type: '' });
    const [confirmationModal, setConfirmationModal] = useState({ 
        isOpen: false, 
        title: '', 
        message: '', 
        onConfirm: () => {} 
    });
    const [activeSupabaseClient, setActiveSupabaseClient] = useState(null);
    const [authForm, setAuthForm] = useState({ 
        email: '', 
        password: '',
        isRegistering: false 
    });

    const showToast = useCallback((message, type = 'info') => { 
        setToast({ message, type }); 
    }, []);
    
    const closeToast = useCallback(() => { 
        setToast({ message: '', type: '' }); 
    }, []);
    
    const openConfirmationModal = (title, message, onConfirmAction) => { 
        setConfirmationModal({ 
            isOpen: true, 
            title, 
            message, 
            onConfirm: onConfirmAction 
        }); 
    };
    
    const closeConfirmationModal = () => { 
        setConfirmationModal({ 
            isOpen: false, 
            title: '', 
            message: '', 
            onConfirm: () => {} 
        }); 
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        try {
            if (authForm.isRegistering) {
                const { data, error } = await supabaseClient.auth.signUp({
                    email: authForm.email,
                    password: authForm.password
                });
                
                if (error) {
                    showToast(`Erro no registro: ${error.message}`, "error");
                } else {
                    showToast("Conta criada com sucesso! Faça login para continuar.", "success");
                    setAuthForm(prev => ({ ...prev, isRegistering: false }));
                }
            } else {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email: authForm.email,
                    password: authForm.password
                });

                if (error) {
                    showToast(`Erro no login: ${error.message}`, "error");
                } else if (data?.user) {
                    setUserId(data.user.id);
                    showToast("Login realizado com sucesso!", "success");
                }
            }
        } catch (error) {
            showToast(`Erro na autenticação: ${error.message}`, "error");
        }
    };

    useEffect(() => {
        setActiveSupabaseClient(supabaseClient);
    }, []);

    useEffect(() => {
        if (!activeSupabaseClient) { 
            console.warn("App Auth Effect: activeSupabaseClient ainda não definido, aguardando...");
            if(isSupabaseMockActive && !isAuthReady) {
                const getMockUser = async () => {
                    if (activeSupabaseClient && activeSupabaseClient.auth) { 
                        const {data: {user}} = await activeSupabaseClient.auth.getUser();
                        if(user) setUserId(user.id);
                    }
                    setIsAuthReady(true);
                };
                getMockUser();
            }
            return;
        }

        console.log("App Auth Effect: Tentando obter sessão Supabase...");
        const getSession = async () => {
            try {
                const { data: { user }, error: getUserError } = await activeSupabaseClient.auth.getUser();
                
                if (getUserError || !user) {
                    console.log("App Auth Effect: Usuário não encontrado.");
                    setUserId(null);
                } else {
                    setUserId(user.id);
                    console.log("App Auth Effect: Usuário existente encontrado:", user.id);
                }
            } catch (e) {
                console.error("App Auth Effect: Exceção no getSession:", e);
                showToast("Erro ao verificar autenticação.", "error");
                setUserId(null);
            } finally {
                setIsAuthReady(true);
            }
        };
        getSession();
    }, [activeSupabaseClient, showToast]); 

    const fetchOffers = useCallback(async () => {
        if (!userId || !activeSupabaseClient || !activeSupabaseClient.from) { 
            console.warn("App: Fetch offers abortado: userId ou supabaseInstance não disponível.", {
                userId, 
                supabaseReady: !!(activeSupabaseClient && activeSupabaseClient.from)
            });
            setIsLoading(false); 
            setOffers([]); 
            return; 
        }
        
        console.log("App: Iniciando fetchOffers para userId:", userId);
        setIsLoading(true);
        
        const { data, error } = await activeSupabaseClient
            .from('offers')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error("App: Supabase Load Offers Error:", error);
            showToast(`Erro ao carregar ofertas: ${error.message}`, "error");
            setOffers([]);
        } else {
            setOffers(data || []);
        }
        
        setIsLoading(false);
    }, [userId, showToast, activeSupabaseClient]);

    useEffect(() => {
        if (isAuthReady && userId && activeSupabaseClient) { 
            console.log("App: Auth pronta e userId/supabaseInstance existe, chamando fetchOffers.");
            fetchOffers();
        } else if (isAuthReady && (!userId || !activeSupabaseClient)) {
            console.warn("App: Auth pronta mas SEM userId ou supabaseInstance. Não vai buscar ofertas.");
            setIsLoading(false);
            setOffers([]);
        }
    }, [isAuthReady, userId, fetchOffers, activeSupabaseClient]);

    const handleAddOffer = async (offerData) => {
        if (!userId || !activeSupabaseClient || !activeSupabaseClient.from) { 
            showToast("Não autenticado ou Supabase não configurado.", "error"); 
            return; 
        }
        
        try {
            const payload = { 
                ...offerData, 
                user_id: userId, 
                last_ad_count: 0, 
                last_ad_count_timestamp: null, 
                is_archived: false 
            };
            
            const { data, error } = await activeSupabaseClient
                .from('offers')
                .insert([payload]) 
                .select(); 

            if (error) throw error;
            
            showToast("TARGET ADICIONADO!", "success"); 
            setIsAddOfferModalOpen(false);
            fetchOffers(); 
        } catch (e) { 
            console.error("App: Erro em handleAddOffer:", e); 
            showToast(`ERRO AO ADICIONAR: ${e.message}`, "error"); 
        }
    };

    const handleEditOffer = (offer) => { 
        setOfferToEdit(offer); 
        setIsEditOfferModalOpen(true); 
    };
    
    const handleUpdateOffer = async (offerId, updatedData) => {
        if (!userId || !activeSupabaseClient || !activeSupabaseClient.from) { 
            showToast("Não autenticado ou Supabase não configurado.", "error"); 
            return; 
        }
        
        try {
            const payload = { 
                ...updatedData, 
                updated_at: new Date().toISOString() 
            };
            
            const { data, error } = await activeSupabaseClient
                .from('offers')
                .update(payload)
                .eq('id', offerId)
                .select(); 

            if (error) throw error;
            
            showToast("TARGET ATUALIZADO!", "success"); 
            setIsEditOfferModalOpen(false); 
            setOfferToEdit(null);
            fetchOffers(); 
        } catch (e) { 
            console.error("App: Erro em handleUpdateOffer:", e); 
            showToast(`ERRO AO ATUALIZAR: ${e.message}`, "error"); 
        }
    };
    
    const handleDeleteOffer = async (offerId) => {
        if (!userId || !activeSupabaseClient || !activeSupabaseClient.from) { 
            showToast("Não autenticado ou Supabase não configurado.", "error"); 
            return; 
        }
        
        openConfirmationModal(
            "EXCLUIR TARGET", 
            "CONFIRMA EXCLUSÃO DESTE TARGET E TODOS OS SEUS DADOS?", 
            async () => {
                try {
                    const { error: adCountsError } = await activeSupabaseClient
                        .from('ad_counts')
                        .delete()
                        .eq('offer_id', offerId);
                    
                    if (adCountsError) {
                        console.warn("App: Supabase delete ad_counts warning (continuando):", adCountsError);
                    }
                    
                    const { error: commentsError } = await activeSupabaseClient
                        .from('comments')
                        .delete()
                        .eq('offer_id', offerId);
                    
                    if (commentsError) {
                        console.warn("App: Supabase delete comments warning (continuando):", commentsError);
                    }
                    
                    const { error: offerError } = await activeSupabaseClient
                        .from('offers')
                        .delete()
                        .eq('id', offerId);
                    
                    if (offerError) throw offerError;
                    
                    showToast("TARGET EXCLUÍDO!", "success");
                    fetchOffers(); 
                    
                    if (selectedOfferId === offerId) { 
                        setCurrentScreen('grid'); 
                        setSelectedOfferId(null); 
                    }
                } catch (e) { 
                    console.error("App: Erro em handleDeleteOffer (confirmado):", e); 
                    showToast(`ERRO AO EXCLUIR: ${e.message}`, "error"); 
                }
            }
        );
    };

    const handleToggleArchiveOffer = async (offerId, currentArchivedStatus) => {
        if (!userId || !activeSupabaseClient || !activeSupabaseClient.from) { 
            showToast("Não autenticado ou Supabase não configurado.", "error"); 
            return; 
        }
        
        try {
            const payload = { 
                is_archived: !currentArchivedStatus, 
                updated_at: new Date().toISOString() 
            };
            
            const { data, error } = await activeSupabaseClient
                .from('offers')
                .update(payload)
                .eq('id', offerId)
                .select();
            
            if (error) throw error;
            
            showToast(`TARGET ${!currentArchivedStatus ? 'ARQUIVADO' : 'RESTAURADO'}!`, "success");
            fetchOffers(); 
        } catch (e) { 
            console.error("App: Erro em handleToggleArchiveOffer:", e); 
            showToast("ERRO AO ARQUIVAR/RESTAURAR.", "error"); 
        }
    };

    const navigateToDetail = (offerId) => { 
        setSelectedOfferId(offerId); 
        setCurrentScreen('detail'); 
    };
    
    const navigateToCompare = () => { 
        setCurrentScreen('compare'); 
    };
    
    const filteredOffers = useMemo(() => {
        return offers
            .filter(offer => showArchived ? offer.is_archived : !offer.is_archived)
            .filter(offer => 
                offer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (Array.isArray(offer.tags) && offer.tags.some(tag => 
                    tag?.toLowerCase().includes(searchTerm.toLowerCase())
                ))
            );
    }, [offers, searchTerm, showArchived]);

    if (!isAuthReady) {
        return (
            <div className={`${HACKER_COLORS.background} ${HACKER_COLORS.primaryNeon} min-h-screen flex items-center justify-center font-mono text-2xl animate-pulse`}>
                INICIALIZANDO SISTEMA...
            </div>
        );
    }
    
    if (!userId) {
        return (
            <div className={`${HACKER_COLORS.background} ${HACKER_COLORS.primaryNeon} min-h-screen flex items-center justify-center font-mono`}>
                <div className="text-center p-8 rounded-lg border-2 backdrop-blur-sm bg-black/30 w-96">
                    <h1 className="text-2xl mb-6">ACESSO RESTRITO</h1>
                    <form onSubmit={handleAuth} className="space-y-4">
                        <div className="space-y-2">
                            <input
                                type="email"
                                placeholder="Email"
                                value={authForm.email}
                                onChange={(e) => setAuthForm(prev => ({ ...prev, email: e.target.value }))}
                                className={`w-full px-4 py-2 rounded-md text-sm bg-black/50 border ${HACKER_COLORS.borderNeon} focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <input
                                type="password"
                                placeholder="Senha"
                                value={authForm.password}
                                onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                                className={`w-full px-4 py-2 rounded-md text-sm bg-black/50 border ${HACKER_COLORS.borderNeon} focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                                required
                            />
                        </div>
                        <button 
                            type="submit"
                            className={`w-full px-4 py-2 rounded-md text-sm font-medium transition-all border ${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.borderNeon} hover:bg-cyan-600`}
                        >
                            {authForm.isRegistering ? 'CRIAR CONTA' : 'LOGIN'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setAuthForm(prev => ({ ...prev, isRegistering: !prev.isRegistering }))}
                            className="w-full text-sm text-cyan-400 hover:text-cyan-300 mt-2"
                        >
                            {authForm.isRegistering ? 'Já tem uma conta? Fazer login' : 'Não tem uma conta? Criar conta'}
                        </button>
                    </form>
                    <p className="text-xs mt-4 opacity-60">O acesso anônimo está desativado.</p>
                </div>
                {toast.message && (
                    <Toast 
                        message={toast.message}
                        type={toast.type}
                        onClose={closeToast}
                    />
                )}
            </div>
        );
    }
    
    if (isAuthReady && isLoading && userId && activeSupabaseClient) {
        return (
            <div className={`${HACKER_COLORS.background} ${HACKER_COLORS.primaryNeon} min-h-screen flex items-center justify-center font-mono text-2xl animate-pulse`}>
                CARREGANDO MATRIX DE DADOS...
            </div>
        );
    }

    return (
        <div className={`${HACKER_COLORS.background} ${HACKER_COLORS.textBase} min-h-screen font-mono flex flex-col`}>
            {isSupabaseMockActive && (
                <div className={`w-full p-2 text-center ${HACKER_COLORS.warningNeon} bg-yellow-900/50 border-b-2 ${HACKER_COLORS.borderNeon} text-xs font-semibold z-50 sticky top-0`}>
                    ATENÇÃO: MODO DE SIMULAÇÃO SUPABASE ATIVO! OS DADOS NÃO SERÃO SALVOS. VERIFIQUE A IMPORTAÇÃO DA BIBLIOTECA E AS CREDENCIAIS.
                </div>
            )}
            
            <header className={`${HACKER_COLORS.surface} border-b-2 ${HACKER_COLORS.borderNeon} p-4 ${HACKER_COLORS.primaryNeonGlow}`}>
                <div className="container mx-auto flex justify-between items-center">
                    <div 
                        className="flex items-center space-x-2 cursor-pointer" 
                        onClick={() => { setCurrentScreen('grid'); setSelectedOfferId(null); }}
                    >
                        <Database size={32} className={`${HACKER_COLORS.primaryNeon}`} /> 
                        <h1 className={`text-3xl font-bold tracking-wider ${HACKER_COLORS.primaryNeon}`}>
                            AdIntel Matrix
                        </h1>
                    </div>
                    
                    <nav className="space-x-2 sm:space-x-3 flex items-center">
                        <button 
                            onClick={() => { setCurrentScreen('grid'); setSelectedOfferId(null); }} 
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-all border ${
                                currentScreen === 'grid' 
                                    ? `${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.borderNeon}` 
                                    : `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.primaryNeon} ${HACKER_COLORS.borderDim}`
                            }`}
                        >
                            <LayoutGrid size={16} className="inline mr-1.5" />GRID
                        </button>
                        
                        <button 
                            onClick={navigateToCompare} 
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-all border ${
                                currentScreen === 'compare' 
                                    ? `${HACKER_COLORS.buttonSecondaryBg} ${HACKER_COLORS.buttonSecondaryText} border-cyan-500` 
                                    : `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.secondaryNeon} ${HACKER_COLORS.borderDim}`
                            }`}
                        >
                            <ChevronsLeftRight size={16} className="inline mr-1.5" />COMPARAR
                        </button>
                        
                        {userId && (
                            <span className={`text-xs ${HACKER_COLORS.textDim} hidden md:block`}>
                                UID: {userId.substring(0,6)}..
                            </span>
                        )}
                    </nav>
                </div>
            </header>

            <main className="container mx-auto p-4 sm:p-6 flex-grow">
                {currentScreen === 'grid' && (
                    <OfferGridScreen
                        offers={filteredOffers}
                        onViewDetails={navigateToDetail}
                        onAddOffer={() => setIsAddOfferModalOpen(true)}
                        onEditOffer={handleEditOffer}
                        onToggleArchive={handleToggleArchiveOffer}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        viewMode={viewMode}
                        setViewMode={setViewMode}
                        showArchived={showArchived}
                        setShowArchived={setShowArchived}
                        onDeleteOffer={handleDeleteOffer}
                        userId={userId}
                        isAuthReady={isAuthReady}
                        supabaseClient={activeSupabaseClient}
                    />
                )}
                
                {currentScreen === 'detail' && selectedOfferId && (
                    <OfferDetailScreen 
                        offerId={selectedOfferId}
                        userId={userId}
                        showToast={showToast}
                        onDeleteOffer={handleDeleteOffer}
                        openConfirmationModal={openConfirmationModal}
                        onToggleArchive={handleToggleArchiveOffer}
                        fetchOffers={fetchOffers}
                        supabaseClient={activeSupabaseClient}
                    />
                )}
                
                {currentScreen === 'compare' && (
                    <ComparativeAnalysisScreen 
                        offers={offers.filter(o => !o.is_archived)}
                        userId={userId}
                        showToast={showToast}
                        supabaseClient={activeSupabaseClient}
                    />
                )}
            </main>

            <footer className={`${HACKER_COLORS.surface} border-t-2 ${HACKER_COLORS.borderNeon} p-4 text-center text-xs ${HACKER_COLORS.textDim}`}>
                AdIntel Matrix // Supabase Edition © {new Date().getFullYear()} // Status: ONLINE
            </footer>

            <AddOfferModal 
                isOpen={isAddOfferModalOpen}
                onClose={() => setIsAddOfferModalOpen(false)}
                onAddOffer={handleAddOffer}
                showToast={showToast}
            />
            
            {offerToEdit && (
                <EditOfferModal 
                    isOpen={isEditOfferModalOpen}
                    onClose={() => { setIsEditOfferModalOpen(false); setOfferToEdit(null); }}
                    onUpdateOffer={handleUpdateOffer}
                    offerToEdit={offerToEdit}
                    showToast={showToast}
                />
            )}
            
            <ConfirmationModal 
                isOpen={confirmationModal.isOpen}
                onClose={closeConfirmationModal}
                onConfirm={confirmationModal.onConfirm}
                title={confirmationModal.title}
                message={confirmationModal.message}
            />
            
            {toast.message && (
                <Toast 
                    message={toast.message}
                    type={toast.type}
                    onClose={closeToast}
                />
            )}
        </div>
    );
}

export default App;