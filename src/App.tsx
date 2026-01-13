import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabaseClient, isSupabaseMockActive } from './utils/supabaseClient';
import { HACKER_COLORS } from './styles/theme';
import { Toast } from './components/ui/Toast';
import { Modal, ConfirmationModal } from './components/ui/Modal';
import OfferGridScreen from './components/screens/OfferGridScreen';
import OfferDetailScreen from './components/screens/OfferDetailScreen';
import ComparativeAnalysisScreen from './components/screens/ComparativeAnalysisScreen';
import DashboardScreen from './components/screens/DashboardScreen';
import AlertsScreen from './components/screens/AlertsScreen';
import AddOfferModal from './components/modals/AddOfferModal';
import EditOfferModal from './components/modals/EditOfferModal';
import AuthForm from './components/auth/AuthForm';
import AdvancedFilters from './components/ui/AdvancedFilters';
import { Database, LayoutGrid, ChevronsLeftRight, BarChart3, Bell, Download, Filter } from 'lucide-react';
import { exportToCSV, exportToJSON, exportDetailedReport } from './utils/exportHelpers';
import ReactMarkdown from 'react-markdown';

// URL parameter handling for deep linking
const getUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    return {
        view: params.get('view'),
        id: params.get('id')
    };
};

const updateUrl = (view, id = null) => {
    const url = new URL(window.location);
    if (view && view !== 'grid') {
        url.searchParams.set('view', view);
        if (id) url.searchParams.set('id', id);
    } else {
        url.searchParams.delete('view');
        url.searchParams.delete('id');
    }
    window.history.replaceState({}, '', url);
};

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
    const [pinnedOfferIds, setPinnedOfferIds] = useState([]); // agora array
    const [showNotes, setShowNotes] = useState(false);
    const [showActiveOffers, setShowActiveOffers] = useState(false);
    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState('');
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editingNoteText, setEditingNoteText] = useState('');
    const [activeOfferIds, setActiveOfferIds] = useState([]);
    const [activeOfferNotes, setActiveOfferNotes] = useState({}); // { offerId: [ {id, text, date} ] }
    const [newActiveNote, setNewActiveNote] = useState('');
    const [activeNoteOfferId, setActiveNoteOfferId] = useState(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [filteredOffersList, setFilteredOffersList] = useState([]);

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

    const handleLogin = async (email, password) => {
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                showToast(`Erro no login: ${error.message}`, "error");
            } else if (data?.user) {
                setUserId(data.user.id);
                showToast("Login realizado com sucesso!", "success");
            }
        } catch (error) {
            showToast("Erro ao tentar fazer login", "error");
        }
    };

    const handleRegister = async (email, password) => {
        try {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: window.location.origin
                }
            });

            if (error) {
                if (error.message === "User already registered") {
                    showToast("Erro no registro: Usuário já registrado. Por favor, faça login ou use outro email.", "error");
                } else {
                    showToast(`Erro no registro: ${error.message}`, "error");
                }
            } else if (data?.user) {
                showToast("Conta criada com sucesso! Faça login para continuar.", "success");
                setUserId(null);
            }
        } catch (error) {
            showToast("Erro ao tentar criar conta", "error");
        }
    };

    useEffect(() => {
        setActiveSupabaseClient(supabaseClient);
    }, []);

    useEffect(() => {
        // Handle URL parameters on load
        const { view, id } = getUrlParams();
        if (view === 'detail' && id) {
            setCurrentScreen('detail');
            setSelectedOfferId(id);
        } else if (view === 'compare') {
            setCurrentScreen('compare');
        }
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
            const initialAdCount = offerData.initial_ad_count ?? 0;
            const payload = {
                name: offerData.name,
                link: offerData.link || '',
                tags: offerData.tags || null,
                user_id: userId,
                last_ad_count: initialAdCount,
                last_ad_count_timestamp: initialAdCount > 0 ? new Date().toISOString() : null,
                is_archived: false
            };

            const { data, error } = await activeSupabaseClient
                .from('offers')
                .insert([payload])
                .select();

            if (error) throw error;

            if (initialAdCount > 0 && data && data[0]) {
                const offerId = data[0].id;
                await activeSupabaseClient
                    .from('ad_counts')
                    .insert([{
                        offer_id: offerId,
                        user_id: userId,
                        count: initialAdCount,
                        timestamp: new Date().toISOString()
                    }]);
            }

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
                    // Delete the offer - CASCADE will handle related data
                    const { error: offerError } = await activeSupabaseClient
                        .from('offers')
                        .delete()
                        .eq('id', offerId);
                    
                    if (offerError) throw offerError;
                    
                    // Atualiza o estado local imediatamente
                    setOffers(prev => prev.filter(o => o.id !== offerId));
                    
                    // Remove from pinned offers if it was pinned
                    setPinnedOfferIds(prev => prev.filter(id => id !== offerId));
                    
                    // Remove from active offers if it was active
                    setActiveOfferIds(prev => prev.filter(id => id !== offerId));
                    
                    showToast("TARGET EXCLUÍDO!", "success");
                    
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
        updateUrl('detail', offerId);
    };
    
    const navigateToCompare = () => { 
        setCurrentScreen('compare');
        updateUrl('compare');
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

    // --- SUPABASE NOTES INTEGRATION ---
    // Função para buscar notas do Supabase
    const fetchNotes = useCallback(async () => {
        if (!userId || !activeSupabaseClient) return;
        const { data, error } = await activeSupabaseClient
            .from('notes')
            .select('*')
            .eq('user_id', userId)
            .order('date', { ascending: false });
        if (error) {
            showToast('Erro ao carregar notas: ' + error.message, 'error');
            setNotes([]);
        } else {
            setNotes(data || []);
        }
    }, [userId, activeSupabaseClient, showToast]);

    // Carrega notas do Supabase ao abrir o bloco de notas
    useEffect(() => {
        if (!showNotes || !userId || !activeSupabaseClient) return;
        fetchNotes();
    }, [showNotes, userId, activeSupabaseClient, fetchNotes]);

    // Adiciona nova nota no Supabase
    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!newNote.trim()) return;
        if (!userId || !activeSupabaseClient) return;
        const text = newNote.trim();
        setNewNote('');
        const { data, error } = await activeSupabaseClient
            .from('notes')
            .insert([{ user_id: userId, text }])
            .select();
        console.log('Add note:', { data, error });
        if (error) {
            showToast('Erro ao adicionar nota: ' + error.message, 'error');
        }
        // Sempre recarrega do Supabase
        fetchNotes();
    };

    // Edita nota no Supabase
    const handleSaveEditNote = async (noteId) => {
        if (!editingNoteText.trim()) return;
        if (!userId || !activeSupabaseClient) return;
        const { data, error } = await activeSupabaseClient
            .from('notes')
            .update({ text: editingNoteText })
            .eq('id', noteId)
            .eq('user_id', userId)
            .select();
        console.log('Edit note:', { data, error });
        if (error) {
            showToast('Erro ao editar nota: ' + error.message, 'error');
        }
        setEditingNoteId(null);
        // Sempre recarrega do Supabase
        fetchNotes();
    };

    // Exclui nota no Supabase
    const handleDeleteNote = async (noteId) => {
        if (!userId || !activeSupabaseClient) return;
        const { error } = await activeSupabaseClient
            .from('notes')
            .delete()
            .eq('id', noteId)
            .eq('user_id', userId);
        console.log('Delete note:', { noteId, error });
        if (error) {
            showToast('Erro ao excluir nota: ' + error.message, 'error');
        }
        // Sempre recarrega do Supabase
        fetchNotes();
    };

    // Carregar pinnedOfferIds do localStorage ao iniciar
    useEffect(() => {
        const saved = localStorage.getItem('pinnedOfferIds');
        if (saved) {
            try {
                setPinnedOfferIds(JSON.parse(saved));
            } catch {}
        }
    }, []);

    // Salvar pinnedOfferIds no localStorage sempre que mudar
    useEffect(() => {
        localStorage.setItem('pinnedOfferIds', JSON.stringify(pinnedOfferIds));
    }, [pinnedOfferIds]);

    if (!isAuthReady) {
        return (
            <div className={`${HACKER_COLORS.background} ${HACKER_COLORS.primary} min-h-screen flex items-center justify-center font-mono text-2xl animate-pulse`}>
                INICIALIZANDO SISTEMA...
            </div>
        );
    }
    
    if (!userId) {
        return (
            <div className={`${HACKER_COLORS.background} min-h-screen flex items-center justify-center font-mono`}>
                <div className="w-full max-w-md">
                    <h1 className={`text-2xl mb-6 text-center ${HACKER_COLORS.primary}`}>ACESSO AO SISTEMA</h1>
                    <AuthForm onLogin={handleLogin} onRegister={handleRegister} />
                </div>
            </div>
        );
    }
    
    if (isAuthReady && isLoading && userId && activeSupabaseClient) {
        return (
            <div className={`${HACKER_COLORS.background} ${HACKER_COLORS.primary} min-h-screen flex items-center justify-center font-mono text-2xl animate-pulse`}>
                CARREGANDO PURSTINLAB...
            </div>
        );
    }

    return (
        <div className={`${HACKER_COLORS.background} ${HACKER_COLORS.textBase} min-h-screen font-mono flex flex-row`}>
            {/* Sidebar lateral */}
            <aside className={`h-screen ${sidebarCollapsed ? 'w-16' : 'w-64'} flex flex-col justify-between fixed left-0 top-0 z-40 ${HACKER_COLORS.surface} border-r-2 ${HACKER_COLORS.borderPrimary} shadow-2xl transition-all duration-300`}>
                <div>
                    <div className="flex items-center gap-3 px-6 py-6 cursor-pointer select-none" onClick={() => { setCurrentScreen('grid'); setSelectedOfferId(null); setShowNotes(false); setShowActiveOffers(false); }}>
                        <Database size={36} className={`${HACKER_COLORS.primary}`} />
                        {!sidebarCollapsed && <span className={`text-3xl font-extrabold tracking-wider ${HACKER_COLORS.primary}`}>PURSTINLAB</span>}
                    </div>
                    
                    {/* Collapse button */}
                    <div className="px-4 mb-4">
                        <button
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border-2 ${HACKER_COLORS.borderDim} ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.primary}`}
                        >
                            {sidebarCollapsed ? '→' : '←'}
                            {!sidebarCollapsed && <span>MINIMIZAR</span>}
                        </button>
                    </div>
                    
                    <nav className="flex flex-col gap-2 mt-8 px-4">
                        <button
                            onClick={() => {
                                setCurrentScreen('grid');
                                setSelectedOfferId(null);
                                setShowNotes(false);
                                setShowActiveOffers(false);
                                updateUrl('grid');
                            }}
                            className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-lg text-base font-semibold transition-all border-2 ${currentScreen === 'grid' && !showNotes && !showActiveOffers ? `${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.borderPrimary}` : `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.primary} ${HACKER_COLORS.borderDim}`}`}
                        >
                            <LayoutGrid size={20} className="inline" />
                            {!sidebarCollapsed && <span>GRID</span>}
                        </button>
                        <button
                            onClick={() => {
                                setCurrentScreen('dashboard');
                                setSelectedOfferId(null);
                                setShowNotes(false);
                                setShowActiveOffers(false);
                                updateUrl('dashboard');
                            }}
                            className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-lg text-base font-semibold transition-all border-2 ${currentScreen === 'dashboard' ? `${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.borderPrimary}` : `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.primary} ${HACKER_COLORS.borderDim}`}`}
                        >
                            <BarChart3 size={20} className="inline" />
                            {!sidebarCollapsed && <span>DASHBOARD</span>}
                        </button>
                        <button
                            onClick={() => {
                                setCurrentScreen('compare');
                                setSelectedOfferId(null);
                                setShowNotes(false);
                                setShowActiveOffers(false);
                                updateUrl('compare');
                            }}
                            className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-lg text-base font-semibold transition-all border-2 ${currentScreen === 'compare' ? `${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.borderPrimary}` : `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.primary} ${HACKER_COLORS.borderDim}`}`}
                        >
                            <ChevronsLeftRight size={20} className="inline" />
                            {!sidebarCollapsed && <span>COMPARAR</span>}
                        </button>
                        <button
                            onClick={() => {
                                setCurrentScreen('alerts');
                                setSelectedOfferId(null);
                                setShowNotes(false);
                                setShowActiveOffers(false);
                                updateUrl('alerts');
                            }}
                            className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-lg text-base font-semibold transition-all border-2 ${currentScreen === 'alerts' ? `${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.borderPrimary}` : `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.primary} ${HACKER_COLORS.borderDim}`}`}
                        >
                            <Bell size={20} className="inline" />
                            {!sidebarCollapsed && <span>ALERTAS</span>}
                        </button>
                    </nav>
                </div>
                {!sidebarCollapsed && (
                    <div className="px-6 py-4 text-xs text-right text-slate-500">
                        <div className="mb-1 font-semibold text-slate-400">UID:</div>
                        <div className="font-mono text-slate-400">{userId.substring(0, 12)}...</div>
                    </div>
                )}
            </aside>
            {/* Conteúdo principal com padding lateral */}
            <main className={`flex-1 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} min-h-screen flex flex-col transition-all duration-300`}>
                <div className="flex-1">
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
                            pinnedOfferIds={pinnedOfferIds}
                            setPinnedOfferIds={setPinnedOfferIds}
                            activeOfferIds={activeOfferIds}
                            setActiveOfferIds={setActiveOfferIds}
                            showToast={showToast}
                            fetchOffers={fetchOffers}
                        />
                    )}
                    {currentScreen === 'dashboard' && (
                        <DashboardScreen
                            offers={offers}
                            userId={userId}
                            supabaseClient={activeSupabaseClient}
                        />
                    )}
                    {currentScreen === 'compare' && (
                        <ComparativeAnalysisScreen
                            offers={offers}
                            userId={userId}
                            showToast={showToast}
                            supabaseClient={activeSupabaseClient}
                        />
                    )}
                    {currentScreen === 'alerts' && (
                        <AlertsScreen
                            userId={userId}
                            supabaseClient={activeSupabaseClient}
                            offers={offers}
                            showToast={showToast}
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
                </div>
                <footer className={`${HACKER_COLORS.surface} border-t-2 ${HACKER_COLORS.borderPrimary} p-4 text-center text-xs ${HACKER_COLORS.textDim}`}>
                    PURSTINLAB // Supabase Edition © {new Date().getFullYear()} // Status: ONLINE
                </footer>
            </main>
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