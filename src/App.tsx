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
import AuthForm from './components/auth/AuthForm';
import { Database, LayoutGrid, ChevronsLeftRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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
    const [pinnedOfferId, setPinnedOfferId] = useState(null);
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
                showToast(`Erro no registro: ${error.message}`, "error");
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
                is_archived: false,
                category: offerData.category // garantir que category está presente
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
                    
                    // Atualiza o estado local imediatamente
                    setOffers(prev => prev.filter(o => o.id !== offerId));
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
            <aside className={`h-screen w-64 flex flex-col justify-between fixed left-0 top-0 z-40 ${HACKER_COLORS.surface} border-r-2 ${HACKER_COLORS.borderPrimary} shadow-2xl`}>
                <div>
                    <div className="flex items-center gap-3 px-6 py-6 cursor-pointer select-none" onClick={() => { setCurrentScreen('grid'); setSelectedOfferId(null); setShowNotes(false); setShowActiveOffers(false); }}>
                        <Database size={36} className={`${HACKER_COLORS.primary}`} />
                        <span className={`text-3xl font-extrabold tracking-wider ${HACKER_COLORS.primary}`}>PURSTINLAB</span>
                    </div>
                    <nav className="flex flex-col gap-2 mt-8 px-4">
                        <button 
                            onClick={() => { setCurrentScreen('grid'); setSelectedOfferId(null); setShowNotes(false); setShowActiveOffers(false); }} 
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-semibold transition-all border-2 ${currentScreen === 'grid' && !showNotes && !showActiveOffers ? `${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.borderPrimary}` : `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.primary} ${HACKER_COLORS.borderDim}`}`}
                        >
                            <LayoutGrid size={20} className="inline" /> GRID
                        </button>
                        <button 
                            onClick={navigateToCompare} 
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-semibold transition-all border-2 ${currentScreen === 'compare' ? `${HACKER_COLORS.buttonSecondaryBg} ${HACKER_COLORS.buttonSecondaryText} ${HACKER_COLORS.borderSecondary}` : `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.secondary} ${HACKER_COLORS.borderDim}`}`}
                        >
                            <ChevronsLeftRight size={20} className="inline" /> COMPARAR
                        </button>
                        <button
                            onClick={() => { setShowNotes(true); setShowActiveOffers(false); setCurrentScreen(''); }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-semibold transition-all border-2 ${showNotes ? `${HACKER_COLORS.buttonSecondaryBg} ${HACKER_COLORS.buttonSecondaryText} ${HACKER_COLORS.borderSecondary}` : `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.secondary} ${HACKER_COLORS.borderDim}`}`}
                        >
                            <span className="inline-block w-5 h-5 bg-blue-400 rounded-full mr-1.5" /> BLOCO DE NOTAS
                        </button>
                        <button
                            onClick={() => { setShowActiveOffers(true); setShowNotes(false); setCurrentScreen(''); }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-semibold transition-all border-2 ${showActiveOffers ? `${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} ${HACKER_COLORS.borderPrimary}` : `${HACKER_COLORS.surfaceLighter} ${HACKER_COLORS.textDim} hover:${HACKER_COLORS.primary} ${HACKER_COLORS.borderDim}`}`}
                        >
                            <span className="inline-block w-5 h-5 bg-purple-400 rounded-full mr-1.5" /> MINHAS OFERTAS ATIVAS
                        </button>
                    </nav>
                </div>
                <div className="px-6 py-4 text-xs text-right text-slate-500">
                    <div className="mb-1 font-semibold text-slate-400">UID:</div>
                    <div className="font-mono text-slate-400">{userId.substring(0, 12)}...</div>
                </div>
            </aside>
            {/* Conteúdo principal com padding lateral */}
            <main className="flex-1 ml-64 min-h-screen flex flex-col">
                <div className="flex-1">
                    {showNotes && (
                        <div className="max-w-2xl mx-auto py-12">
                            <h2 className="text-2xl font-bold mb-6 text-blue-400">Bloco de Notas</h2>
                            <form onSubmit={e => {
                                e.preventDefault();
                                if (!newNote.trim()) return;
                                setNotes(prev => [
                                    { id: Date.now(), text: newNote.trim(), date: new Date().toLocaleString() },
                                    ...prev
                                ]);
                                setNewNote('');
                            }} className="mb-6 flex gap-2">
                                <div className="flex-1 flex flex-col gap-1">
                                    <div className="flex gap-1 mb-1">
                                        <button type="button" title="Negrito (Ctrl+B)" onClick={e => {
                                            e.preventDefault();
                                            const textarea = document.getElementById('noteTextarea');
                                            if (!textarea) return;
                                            const start = textarea.selectionStart;
                                            const end = textarea.selectionEnd;
                                            setNewNote(prev => prev.substring(0, start) + '**' + prev.substring(start, end) + '**' + prev.substring(end));
                                            setTimeout(() => textarea.focus(), 0);
                                        }} className="px-2 py-1 rounded bg-blue-700 text-white font-bold">B</button>
                                        <button type="button" title="Itálico (Ctrl+I)" onClick={e => {
                                            e.preventDefault();
                                            const textarea = document.getElementById('noteTextarea');
                                            if (!textarea) return;
                                            const start = textarea.selectionStart;
                                            const end = textarea.selectionEnd;
                                            setNewNote(prev => prev.substring(0, start) + '_' + prev.substring(start, end) + '_' + prev.substring(end));
                                            setTimeout(() => textarea.focus(), 0);
                                        }} className="px-2 py-1 rounded bg-blue-700 text-white font-bold italic">I</button>
                                    </div>
                                    <textarea
                                        id="noteTextarea"
                                        value={newNote}
                                        onChange={e => setNewNote(e.target.value)}
                                        placeholder="Digite uma nova nota..."
                                        rows={2}
                                        className={`flex-1 resize-y ${HACKER_COLORS.surfaceLighter} border-2 ${HACKER_COLORS.borderPrimary} rounded-lg px-4 py-2 text-base focus:ring-2 focus:${HACKER_COLORS.borderPrimary} outline-none`}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && e.ctrlKey) {
                                                e.preventDefault();
                                                const textarea = e.target;
                                                const start = textarea.selectionStart;
                                                const end = textarea.selectionEnd;
                                                setNewNote(prev => prev.substring(0, start) + '\n' + prev.substring(end));
                                                setTimeout(() => textarea.setSelectionRange(start + 1, start + 1), 0);
                                            } else if (e.key === 'Enter' && !e.ctrlKey) {
                                                // submit
                                            }
                                        }}
                                    />
                                </div>
                                <button type="submit" className={`${HACKER_COLORS.buttonPrimaryBg} ${HACKER_COLORS.buttonPrimaryText} px-5 py-2 rounded-lg font-semibold`}>Adicionar</button>
                            </form>
                            <ul className="space-y-4">
                                {notes.length === 0 && (
                                    <li className="text-slate-500 text-center">Nenhuma nota ainda.</li>
                                )}
                                {notes.map(note => (
                                    <li key={note.id} className={`p-4 rounded-lg border-2 ${HACKER_COLORS.borderPrimary} bg-[#23262F]/80 flex flex-col gap-2`}>
                                        <div className="flex justify-between items-center">
                                            {editingNoteId === note.id ? (
                                                <textarea
                                                    value={editingNoteText}
                                                    onChange={e => setEditingNoteText(e.target.value)}
                                                    rows={2}
                                                    className={`flex-1 resize-y ${HACKER_COLORS.surfaceLighter} border-2 ${HACKER_COLORS.borderPrimary} rounded-lg px-3 py-1 text-base focus:ring-2 focus:${HACKER_COLORS.borderPrimary} outline-none`}
                                                />
                                            ) : (
                                                <span className="text-base text-slate-200"><ReactMarkdown>{note.text}</ReactMarkdown></span>
                                            )}
                                            <div className="flex gap-2 ml-2">
                                                {editingNoteId === note.id ? (
                                                    <>
                                                        <button onClick={() => {
                                                            setNotes(prev => prev.map(n => n.id === note.id ? { ...n, text: editingNoteText } : n));
                                                            setEditingNoteId(null);
                                                        }} className="px-2 py-1 rounded bg-blue-600 text-white font-semibold">Salvar</button>
                                                        <button onClick={() => setEditingNoteId(null)} className="px-2 py-1 rounded bg-gray-700 text-white">Cancelar</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.text); }} className="px-2 py-1 rounded bg-blue-600 text-white font-semibold">Editar</button>
                                                        <button onClick={() => setNotes(prev => prev.filter(n => n.id !== note.id))} className="px-2 py-1 rounded bg-red-600 text-white font-semibold">Excluir</button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-400 text-right">{note.date}</div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {showActiveOffers && (
                        <div className="max-w-2xl mx-auto py-12">
                            <h2 className="text-2xl font-bold mb-6 text-purple-400">Minhas Ofertas Ativas</h2>
                            {activeOfferIds.length === 0 && (
                                <div className="text-slate-500 text-center">Nenhuma oferta ativa no momento.</div>
                            )}
                            {activeOfferIds.map(oid => {
                                const offer = offers.find(o => o.id === oid);
                                if (!offer) return null;
                                return (
                                    <div key={oid} className="mb-8 p-5 rounded-xl border-2 border-purple-500 bg-[#23262F]/80 shadow-lg">
                                        <div className="flex justify-between items-center mb-2">
                                            <div>
                                                <div className="text-lg font-bold text-purple-300">{offer.name}</div>
                                                <div className="text-xs text-slate-400">Categoria: {offer.category || 'N/A'}</div>
                                            </div>
                                            <button
                                                onClick={() => setActiveOfferIds(activeOfferIds.filter(id => id !== oid))}
                                                className="px-3 py-1 rounded-full text-xs font-bold border-2 bg-gray-800 border-gray-600 text-purple-300 hover:bg-purple-900 hover:border-purple-400 transition-all duration-200"
                                            >
                                                Remover da lista
                                            </button>
                                        </div>
                                        <div className="mb-2 text-sm text-slate-300">{offer.link && <a href={offer.link} target="_blank" rel="noopener noreferrer" className="underline text-blue-400">{offer.link}</a>}</div>
                                        <div className="mb-2 text-xs text-slate-400">Última atualização: {offer.updated_at ? new Date(offer.updated_at).toLocaleString() : 'N/A'}</div>
                                        {/* Notas específicas da oferta ativa */}
                                        <div className="mt-4">
                                            <div className="font-semibold text-purple-200 mb-2">Notas desta oferta</div>
                                            <form onSubmit={e => {
                                                e.preventDefault();
                                                if (!newActiveNote.trim() || activeNoteOfferId !== oid) return;
                                                setActiveOfferNotes(prev => ({
                                                    ...prev,
                                                    [oid]: [
                                                        { id: Date.now(), text: newActiveNote.trim(), date: new Date().toLocaleString() },
                                                        ...(prev[oid] || [])
                                                    ]
                                                }));
                                                setNewActiveNote('');
                                                setActiveNoteOfferId(null);
                                            }} className="flex gap-2 mb-3">
                                                <input
                                                    type="text"
                                                    value={activeNoteOfferId === oid ? newActiveNote : ''}
                                                    onChange={e => { setActiveNoteOfferId(oid); setNewActiveNote(e.target.value); }}
                                                    placeholder="Adicionar nota para esta oferta..."
                                                    className={`flex-1 ${HACKER_COLORS.surfaceLighter} border-2 ${HACKER_COLORS.borderSecondary} rounded-lg px-3 py-1 text-base focus:ring-2 focus:${HACKER_COLORS.borderSecondary} outline-none`}
                                                />
                                                <button type="submit" className={`${HACKER_COLORS.buttonSecondaryBg} ${HACKER_COLORS.buttonSecondaryText} px-4 py-1 rounded-lg font-semibold`}>Adicionar</button>
                                            </form>
                                            <ul className="space-y-2">
                                                {(activeOfferNotes[oid] || []).length === 0 && (
                                                    <li className="text-slate-500 text-xs">Nenhuma nota para esta oferta.</li>
                                                )}
                                                {(activeOfferNotes[oid] || []).map(note => (
                                                    <li key={note.id} className="p-2 rounded border border-purple-700 bg-[#23262F]/90 flex justify-between items-center">
                                                        <span className="text-sm text-slate-200"><ReactMarkdown>{note.text}</ReactMarkdown></span>
                                                        <span className="text-xs text-slate-400 ml-3">{note.date}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {!showNotes && !showActiveOffers && currentScreen === 'grid' && (
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
                            pinnedOfferId={pinnedOfferId}
                            setPinnedOfferId={setPinnedOfferId}
                            activeOfferIds={activeOfferIds}
                            setActiveOfferIds={setActiveOfferIds}
                        />
                    )}
                    {!showNotes && !showActiveOffers && currentScreen === 'detail' && selectedOfferId && (
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
                    {!showNotes && !showActiveOffers && currentScreen === 'compare' && (
                        <ComparativeAnalysisScreen 
                            offers={offers.filter(o => !o.is_archived)}
                            userId={userId}
                            showToast={showToast}
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