import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabaseClient, isSupabaseMockActive } from './utils/supabaseClient';
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
            <div className="bg-[#080C14] min-h-screen flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/20 flex items-center justify-center mx-auto">
                        <Database size={24} className="text-blue-400 animate-pulse" />
                    </div>
                    <p className="text-slate-400 text-sm font-medium tracking-wider">INICIALIZANDO...</p>
                </div>
            </div>
        );
    }
    
    if (!userId) {
        return (
            <div className="bg-[#080C14] min-h-screen flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    <div className="text-center mb-8">
                        <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
                            <Database size={28} className="text-blue-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">Purstinlab</h1>
                        <p className="text-slate-500 text-sm mt-1">Plataforma de Inteligência em Anúncios</p>
                    </div>
                    <AuthForm onLogin={handleLogin} onRegister={handleRegister} />
                </div>
            </div>
        );
    }
    
    if (isAuthReady && isLoading && userId && activeSupabaseClient) {
        return (
            <div className="bg-[#080C14] min-h-screen flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/20 flex items-center justify-center mx-auto">
                        <Database size={24} className="text-blue-400 animate-pulse" />
                    </div>
                    <p className="text-slate-400 text-sm font-medium tracking-wider">CARREGANDO DADOS...</p>
                </div>
            </div>
        );
    }

    const navItems = [
        { id: 'grid',      icon: LayoutGrid,       label: 'Targets' },
        { id: 'dashboard', icon: BarChart3,         label: 'Dashboard' },
        { id: 'compare',   icon: ChevronsLeftRight, label: 'Comparar' },
        { id: 'alerts',    icon: Bell,              label: 'Alertas' },
    ] as const;

    return (
        <div className="bg-[#080C14] text-slate-100 min-h-screen flex flex-row">
            {/* ── Sidebar ──────────────────────────────────────────────── */}
            <aside className={`h-screen ${
                sidebarCollapsed ? 'w-[68px]' : 'w-64'
            } flex flex-col fixed left-0 top-0 z-40 bg-[#080C14] border-r border-white/[0.05] transition-all duration-300`}>

                {/* Logo */}
                <div
                    className="flex items-center gap-3 px-4 py-5 cursor-pointer group border-b border-white/[0.05]"
                    onClick={() => { setCurrentScreen('grid'); setSelectedOfferId(null); setShowNotes(false); setShowActiveOffers(false); }}
                >
                    <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/25 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-600/30 transition-colors">
                        <Database size={18} className="text-blue-400" />
                    </div>
                    {!sidebarCollapsed && (
                        <div>
                            <span className="text-sm font-bold text-white tracking-tight leading-none">Purstinlab</span>
                            <p className="text-[10px] text-slate-500 leading-none mt-0.5">Ad Intelligence</p>
                        </div>
                    )}
                </div>

                {/* Nav */}
                <nav className="flex flex-col gap-1 px-2 pt-4 flex-1">
                    {navItems.map(({ id, icon: Icon, label }) => {
                        const isActive = currentScreen === id && !showNotes && !showActiveOffers;
                        return (
                            <button
                                key={id}
                                onClick={() => {
                                    setCurrentScreen(id);
                                    setSelectedOfferId(null);
                                    setShowNotes(false);
                                    setShowActiveOffers(false);
                                    updateUrl(id);
                                }}
                                title={sidebarCollapsed ? label : undefined}
                                className={`flex items-center ${
                                    sidebarCollapsed ? 'justify-center' : 'gap-3'
                                } px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                                    isActive
                                        ? 'bg-blue-600/15 text-blue-300 border border-blue-500/20'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] border border-transparent'
                                }`}
                            >
                                <Icon size={18} className={isActive ? 'text-blue-400' : ''} />
                                {!sidebarCollapsed && <span>{label}</span>}
                            </button>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="px-2 pb-4">
                    {/* Collapse button */}
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] transition-all border border-transparent hover:border-white/[0.06] mb-2"
                        title={sidebarCollapsed ? 'Expandir' : 'Recolher'}
                    >
                        {sidebarCollapsed ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                        ) : (
                            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg><span>Recolher</span></>
                        )}
                    </button>
                    {!sidebarCollapsed && (
                        <div className="px-2 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                            <p className="text-[10px] text-slate-600 mb-0.5 font-medium">SESSÃO</p>
                            <p className="text-xs text-slate-400 font-mono truncate">{userId.substring(0, 14)}…</p>
                        </div>
                    )}
                </div>
            </aside>

            {/* ── Main content ─────────────────────────────────────────── */}
            <main className={`flex-1 ${
                sidebarCollapsed ? 'ml-[68px]' : 'ml-64'
            } min-h-screen flex flex-col transition-all duration-300`}>
                {/* Alerta de modo demo */}
                {isSupabaseMockActive && (
                    <div className="bg-rose-950/80 border-b border-rose-500/30 text-white px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-rose-400 text-sm">!</span>
                            </div>
                            <div>
                                <span className="font-semibold text-sm text-rose-300">Modo Demo —&nbsp;</span>
                                <span className="text-sm text-slate-400">Configure o Supabase para salvar dados permanentemente.</span>
                            </div>
                        </div>
                        <button
                            onClick={() => { showToast("Veja o arquivo .env.example na raiz do projeto.", "info"); }}
                            className="text-xs text-rose-400 hover:text-rose-300 border border-rose-500/30 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 transition-all flex-shrink-0"
                        >
                            Ver instruções
                        </button>
                    </div>
                )}
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
                <footer className="border-t border-white/[0.04] px-8 py-3 flex items-center justify-between">
                    <span className="text-xs text-slate-600">Purstinlab © {new Date().getFullYear()}</span>
                    <span className="text-xs text-emerald-500 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                        Online
                    </span>
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