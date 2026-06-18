/* eslint-disable @typescript-eslint/no-explicit-any */
// Módulo Tracker Ads = port do TrackerAds "Ad Intelligence" (standalone) pra dentro
// do purstinlab. Usa o Supabase compartilhado (@/lib/supabase) e vive dentro do shell
// do purstinlab — por isso a sidebar original virou barra de sub-abas no topo.
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Database, LayoutGrid, ChevronsLeftRight, BarChart3, Bell, Search, History, LogOut,
} from 'lucide-react'
import { isConfigured, saveCreds, clearCreds } from '@/lib/supabase'
import { supabaseClient } from './adintel/utils/supabaseClient'
import { Toast as ToastRaw } from './adintel/components/ui/Toast'
import { ConfirmationModal as ConfirmationModalRaw } from './adintel/components/ui/Modal'
import OfferGridScreenRaw from './adintel/components/screens/OfferGridScreen'
import OfferDetailScreenRaw from './adintel/components/screens/OfferDetailScreen'
import ComparativeAnalysisScreenRaw from './adintel/components/screens/ComparativeAnalysisScreen'
import DashboardScreenRaw from './adintel/components/screens/DashboardScreen'
import AlertsScreenRaw from './adintel/components/screens/AlertsScreen'
import DiscoveryScreenRaw from './adintel/components/screens/DiscoveryScreen'
import TrajectoryScreenRaw from './adintel/components/screens/TrajectoryScreen'
import AddOfferModalRaw from './adintel/components/modals/AddOfferModal'
import EditOfferModalRaw from './adintel/components/modals/EditOfferModal'
import AuthForm from './adintel/components/auth/AuthForm'
import './adintel/adintel.css'

// os componentes portados são .jsx (sem tipos) — trata como any pro JSX não reclamar de props
const Toast = ToastRaw as any
const ConfirmationModal = ConfirmationModalRaw as any
const OfferGridScreen = OfferGridScreenRaw as any
const OfferDetailScreen = OfferDetailScreenRaw as any
const ComparativeAnalysisScreen = ComparativeAnalysisScreenRaw as any
const DashboardScreen = DashboardScreenRaw as any
const AlertsScreen = AlertsScreenRaw as any
const DiscoveryScreen = DiscoveryScreenRaw as any
const TrajectoryScreen = TrajectoryScreenRaw as any
const AddOfferModal = AddOfferModalRaw as any
const EditOfferModal = EditOfferModalRaw as any

type ToastState = { message: string; type: string }

/* ── tela de conexão Supabase (quando não há env nem creds salvas) ── */
function ConnectScreen() {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  return (
    <div className="adintel mx-auto max-w-[520px] py-10">
      <div className="rounded-2xl border border-white/[0.06] bg-[#0d1220] p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/15 border border-blue-500/20">
          <Database className="h-7 w-7 text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Conectar Supabase</h2>
        <p className="mx-auto mt-1 max-w-[380px] text-[13px] text-slate-400">
          Cole as credenciais do projeto (a mesma Supabase do TrackerAds). Salvo só neste navegador.
        </p>
        <div className="mt-5 space-y-3 text-left">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co"
            className="w-full rounded-xl border border-white/[0.08] bg-[#131929] px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-blue-500/50 focus:outline-none" />
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="anon public key (eyJhbGci...)"
            className="w-full rounded-xl border border-white/[0.08] bg-[#131929] px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-blue-500/50 focus:outline-none" />
          <button
            onClick={() => {
              if (!url.trim() || !key.trim()) return
              saveCreds({ url: url.trim(), key: key.trim() })
              window.location.reload()
            }}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Conectar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TrackerPage() {
  const [currentScreen, setCurrentScreen] = useState<string>('grid')
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [offerToEdit, setOfferToEdit] = useState<any>(null)
  const [offers, setOffers] = useState<any[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [isAddOfferModalOpen, setIsAddOfferModalOpen] = useState(false)
  const [isEditOfferModalOpen, setIsEditOfferModalOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [toast, setToast] = useState<ToastState>({ message: '', type: '' })
  const [confirmationModal, setConfirmationModal] = useState<any>({ isOpen: false, title: '', message: '', onConfirm: () => {} })
  const [pinnedOfferIds, setPinnedOfferIds] = useState<string[]>([])
  const [activeOfferIds, setActiveOfferIds] = useState<string[]>([])

  const sb: any = supabaseClient

  const showToast = useCallback((message: string, type = 'info') => setToast({ message, type }), [])
  const closeToast = useCallback(() => setToast({ message: '', type: '' }), [])
  const openConfirmationModal = (title: string, message: string, onConfirmAction: () => void) =>
    setConfirmationModal({ isOpen: true, title, message, onConfirm: onConfirmAction })
  const closeConfirmationModal = () => setConfirmationModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  const handleLogin = async (email: string, password: string) => {
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) showToast(`Erro no login: ${error.message}`, 'error')
      else if (data?.user) { setUserId(data.user.id); showToast('Login realizado!', 'success') }
    } catch { showToast('Erro ao tentar fazer login', 'error') }
  }
  const handleRegister = async (email: string, password: string) => {
    try {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      if (error) showToast(`Erro no registro: ${error.message}`, 'error')
      else if (data?.user) { showToast('Conta criada! Faça login.', 'success'); setUserId(null) }
    } catch { showToast('Erro ao tentar criar conta', 'error') }
  }

  // sessão
  useEffect(() => {
    if (!sb) { setIsAuthReady(true); return }
    sb.auth.getUser()
      .then(({ data }: any) => setUserId(data?.user?.id ?? null))
      .catch(() => setUserId(null))
      .finally(() => setIsAuthReady(true))
  }, [sb])

  const fetchOffers = useCallback(async () => {
    if (!userId || !sb?.from) { setIsLoading(false); setOffers([]); return }
    setIsLoading(true)
    const { data, error } = await sb.from('offers').select('*').order('created_at', { ascending: false })
    if (error) { showToast(`Erro ao carregar ofertas: ${error.message}`, 'error'); setOffers([]) }
    else setOffers(data || [])
    setIsLoading(false)
  }, [userId, showToast, sb])

  useEffect(() => {
    if (isAuthReady && userId && sb) fetchOffers()
    else if (isAuthReady && (!userId || !sb)) { setIsLoading(false); setOffers([]) }
  }, [isAuthReady, userId, fetchOffers, sb])

  const handleAddOffer = async (offerData: any) => {
    if (!userId || !sb?.from) return showToast('Não autenticado.', 'error')
    try {
      const initialAdCount = offerData.initial_ad_count ?? 0
      const payload = {
        name: offerData.name, link: offerData.link || '', tags: offerData.tags || null,
        user_id: userId, last_ad_count: initialAdCount,
        last_ad_count_timestamp: initialAdCount > 0 ? new Date().toISOString() : null, is_archived: false,
      }
      const { data, error } = await sb.from('offers').insert([payload]).select()
      if (error) throw error
      if (initialAdCount > 0 && data?.[0]) {
        await sb.from('ad_counts').insert([{ offer_id: data[0].id, user_id: userId, count: initialAdCount, timestamp: new Date().toISOString() }])
      }
      showToast('TARGET ADICIONADO!', 'success'); setIsAddOfferModalOpen(false); fetchOffers()
    } catch (e: any) { showToast(`ERRO AO ADICIONAR: ${e.message}`, 'error') }
  }

  const handleEditOffer = (offer: any) => { setOfferToEdit(offer); setIsEditOfferModalOpen(true) }
  const handleUpdateOffer = async (offerId: string, updatedData: any) => {
    if (!userId || !sb?.from) return showToast('Não autenticado.', 'error')
    try {
      const { error } = await sb.from('offers').update({ ...updatedData, updated_at: new Date().toISOString() }).eq('id', offerId).select()
      if (error) throw error
      showToast('TARGET ATUALIZADO!', 'success'); setIsEditOfferModalOpen(false); setOfferToEdit(null); fetchOffers()
    } catch (e: any) { showToast(`ERRO AO ATUALIZAR: ${e.message}`, 'error') }
  }
  const handleDeleteOffer = async (offerId: string) => {
    if (!userId || !sb?.from) return showToast('Não autenticado.', 'error')
    openConfirmationModal('EXCLUIR TARGET', 'CONFIRMA EXCLUSÃO DESTE TARGET E TODOS OS SEUS DADOS?', async () => {
      try {
        const { error } = await sb.from('offers').delete().eq('id', offerId)
        if (error) throw error
        setOffers((prev) => prev.filter((o) => o.id !== offerId))
        setPinnedOfferIds((prev) => prev.filter((id) => id !== offerId))
        setActiveOfferIds((prev) => prev.filter((id) => id !== offerId))
        showToast('TARGET EXCLUÍDO!', 'success')
        if (selectedOfferId === offerId) { setCurrentScreen('grid'); setSelectedOfferId(null) }
      } catch (e: any) { showToast(`ERRO AO EXCLUIR: ${e.message}`, 'error') }
    })
  }
  const handleToggleArchiveOffer = async (offerId: string, currentArchivedStatus: boolean) => {
    if (!userId || !sb?.from) return showToast('Não autenticado.', 'error')
    try {
      const { error } = await sb.from('offers').update({ is_archived: !currentArchivedStatus, updated_at: new Date().toISOString() }).eq('id', offerId).select()
      if (error) throw error
      showToast(`TARGET ${!currentArchivedStatus ? 'ARQUIVADO' : 'RESTAURADO'}!`, 'success'); fetchOffers()
    } catch { showToast('ERRO AO ARQUIVAR/RESTAURAR.', 'error') }
  }

  const navigateToDetail = (offerId: string) => { setSelectedOfferId(offerId); setCurrentScreen('detail') }

  const filteredOffers = useMemo(() => {
    return offers
      .filter((offer) => (showArchived ? offer.is_archived : !offer.is_archived))
      .filter((offer) =>
        offer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (Array.isArray(offer.tags) && offer.tags.some((tag: string) => tag?.toLowerCase().includes(searchTerm.toLowerCase()))),
      )
  }, [offers, searchTerm, showArchived])

  // pinned no localStorage
  useEffect(() => {
    const saved = localStorage.getItem('pinnedOfferIds')
    if (saved) { try { setPinnedOfferIds(JSON.parse(saved)) } catch {} }
  }, [])
  useEffect(() => { localStorage.setItem('pinnedOfferIds', JSON.stringify(pinnedOfferIds)) }, [pinnedOfferIds])

  // ── gates ──
  if (!isConfigured()) return <ConnectScreen />

  if (!isAuthReady) {
    return (
      <div className="adintel flex min-h-[60vh] items-center justify-center">
        <Database className="h-7 w-7 animate-pulse text-blue-400" />
      </div>
    )
  }
  if (!userId) {
    return (
      <div className="adintel mx-auto max-w-md py-12">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/12 border border-blue-500/20">
            <Database className="h-8 w-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Tracker Ads</h1>
          <p className="mt-1 text-sm text-slate-500">Entre com a conta do TrackerAds (RLS por usuário)</p>
        </div>
        <AuthForm onLogin={handleLogin} onRegister={handleRegister} />
        <button onClick={() => { if (confirm('Desconectar a Supabase deste navegador?')) { clearCreds(); window.location.reload() } }}
          className="mx-auto mt-4 block text-[11px] text-slate-600 hover:text-slate-400">trocar Supabase</button>
      </div>
    )
  }

  const navItems = [
    { id: 'grid', icon: LayoutGrid, label: 'Targets' },
    { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
    { id: 'compare', icon: ChevronsLeftRight, label: 'Comparar' },
    { id: 'trajectory', icon: History, label: 'Trajetória' },
    { id: 'alerts', icon: Bell, label: 'Alertas' },
    { id: 'discovery', icon: Search, label: 'Descoberta' },
  ]

  return (
    <div className="adintel min-h-[70vh] rounded-2xl border border-white/[0.05] bg-[#070b14] text-slate-100">
      {/* barra de sub-abas (substitui a sidebar do app standalone) */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.05] px-3 py-2">
        {navItems.map(({ id, icon: Icon, label }) => {
          const isActive = currentScreen === id || (id === 'grid' && currentScreen === 'detail')
          return (
            <button key={id} onClick={() => { setCurrentScreen(id); setSelectedOfferId(null) }}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition-all ${
                isActive ? 'bg-blue-600/12 text-blue-300' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
              }`}>
              <Icon size={15} className={isActive ? 'text-blue-400' : 'text-slate-600'} strokeWidth={isActive ? 2.5 : 2} />
              {label}
            </button>
          )
        })}
        <span className="ml-auto flex items-center gap-2 pr-1 text-[11px] text-slate-600">
          <span className="hidden font-mono sm:inline">{userId.substring(0, 10)}…</span>
          <button onClick={() => sb.auth.signOut().then(() => setUserId(null))} title="Sair"
            className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/[0.04] hover:text-slate-300">
            <LogOut size={13} /> Sair
          </button>
        </span>
      </div>

      <div className="p-1">
        {isLoading && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Database className="h-6 w-6 animate-pulse text-blue-400" />
          </div>
        )}
        {!isLoading && currentScreen === 'grid' && (
          <OfferGridScreen
            offers={filteredOffers} onViewDetails={navigateToDetail} onAddOffer={() => setIsAddOfferModalOpen(true)}
            onEditOffer={handleEditOffer} onToggleArchive={handleToggleArchiveOffer} searchTerm={searchTerm} setSearchTerm={setSearchTerm}
            viewMode={viewMode} setViewMode={setViewMode} showArchived={showArchived} setShowArchived={setShowArchived}
            onDeleteOffer={handleDeleteOffer} userId={userId} isAuthReady={isAuthReady} supabaseClient={sb}
            pinnedOfferIds={pinnedOfferIds} setPinnedOfferIds={setPinnedOfferIds} activeOfferIds={activeOfferIds}
            setActiveOfferIds={setActiveOfferIds} showToast={showToast} fetchOffers={fetchOffers}
          />
        )}
        {!isLoading && currentScreen === 'dashboard' && <DashboardScreen offers={offers} userId={userId} supabaseClient={sb} />}
        {!isLoading && currentScreen === 'compare' && <ComparativeAnalysisScreen offers={offers} userId={userId} showToast={showToast} supabaseClient={sb} />}
        {!isLoading && currentScreen === 'alerts' && <AlertsScreen userId={userId} supabaseClient={sb} offers={offers} showToast={showToast} />}
        {!isLoading && currentScreen === 'discovery' && <DiscoveryScreen userId={userId} supabaseClient={sb} showToast={showToast} onAddOffer={handleAddOffer} />}
        {!isLoading && currentScreen === 'trajectory' && <TrajectoryScreen offers={offers} userId={userId} supabaseClient={sb} showToast={showToast} fetchOffers={fetchOffers} />}
        {!isLoading && currentScreen === 'detail' && selectedOfferId && (
          <OfferDetailScreen
            offerId={selectedOfferId} userId={userId} showToast={showToast} onDeleteOffer={handleDeleteOffer}
            openConfirmationModal={openConfirmationModal} onToggleArchive={handleToggleArchiveOffer} fetchOffers={fetchOffers} supabaseClient={sb}
          />
        )}
      </div>

      <AddOfferModal isOpen={isAddOfferModalOpen} onClose={() => setIsAddOfferModalOpen(false)} onAddOffer={handleAddOffer} showToast={showToast} />
      {offerToEdit && (
        <EditOfferModal isOpen={isEditOfferModalOpen} onClose={() => { setIsEditOfferModalOpen(false); setOfferToEdit(null) }}
          onUpdateOffer={handleUpdateOffer} offerToEdit={offerToEdit} showToast={showToast} />
      )}
      <ConfirmationModal isOpen={confirmationModal.isOpen} onClose={closeConfirmationModal} onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title} message={confirmationModal.message} />
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
    </div>
  )
}
