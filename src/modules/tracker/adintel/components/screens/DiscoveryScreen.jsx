import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Trash2, Play, RefreshCw, ExternalLink, CheckCircle, X, Clock, Zap, Tag, TrendingUp } from 'lucide-react';

const SCRAPER_URL = import.meta.env.VITE_SCRAPER_URL || 'http://localhost:3001';

const STATUS_CONFIG = {
    pending:   { label: 'Pendente',   color: 'text-yellow-400',  bg: 'bg-yellow-950/40',  border: 'border-yellow-500/30' },
    added:     { label: 'Adicionada', color: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-500/30' },
    dismissed: { label: 'Descartada', color: 'text-slate-500',   bg: 'bg-slate-900/30',   border: 'border-slate-700/30' },
};

export default function DiscoveryScreen({ userId, supabaseClient, showToast, onAddOffer }) {
    const [keywords, setKeywords] = useState([]);
    const [discoveries, setDiscoveries] = useState([]);
    const [newKeyword, setNewKeyword] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [loadingKw, setLoadingKw] = useState(true);
    const [loadingDisc, setLoadingDisc] = useState(true);
    const [filterStatus, setFilterStatus] = useState('pending');

    // ── Carrega keywords ──────────────────────────────────────────────────────
    const fetchKeywords = useCallback(async () => {
        if (!userId || !supabaseClient) return;
        setLoadingKw(true);
        const { data, error } = await supabaseClient
            .from('discovery_keywords')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error) showToast('Erro ao carregar keywords: ' + error.message, 'error');
        else setKeywords(data || []);
        setLoadingKw(false);
    }, [userId, supabaseClient, showToast]);

    // ── Carrega descobertas ───────────────────────────────────────────────────
    const fetchDiscoveries = useCallback(async () => {
        if (!userId || !supabaseClient) return;
        setLoadingDisc(true);
        const { data, error } = await supabaseClient
            .from('discovered_offers')
            .select('*')
            .eq('user_id', userId)
            .order('discovered_at', { ascending: false });
        if (error) showToast('Erro ao carregar descobertas: ' + error.message, 'error');
        else setDiscoveries(data || []);
        setLoadingDisc(false);
    }, [userId, supabaseClient, showToast]);

    useEffect(() => {
        fetchKeywords();
        fetchDiscoveries();
    }, [fetchKeywords, fetchDiscoveries]);

    // ── Adiciona keyword ──────────────────────────────────────────────────────
    const handleAddKeyword = async (e) => {
        e.preventDefault();
        const kw = newKeyword.trim().toLowerCase();
        if (!kw) return;
        if (keywords.some(k => k.keyword === kw)) {
            showToast('Keyword já existe.', 'error');
            return;
        }
        const { error } = await supabaseClient
            .from('discovery_keywords')
            .insert([{ user_id: userId, keyword: kw, is_active: true }]);
        if (error) {
            showToast('Erro ao adicionar keyword: ' + error.message, 'error');
        } else {
            setNewKeyword('');
            showToast(`Keyword "${kw}" adicionada!`, 'success');
            fetchKeywords();
        }
    };

    // ── Remove keyword ────────────────────────────────────────────────────────
    const handleDeleteKeyword = async (id, kw) => {
        const { error } = await supabaseClient
            .from('discovery_keywords')
            .delete()
            .eq('id', id);
        if (error) showToast('Erro ao remover: ' + error.message, 'error');
        else {
            showToast(`Keyword "${kw}" removida.`, 'success');
            fetchKeywords();
        }
    };

    // ── Toggle ativo/inativo ──────────────────────────────────────────────────
    const handleToggleKeyword = async (id, currentActive) => {
        const { error } = await supabaseClient
            .from('discovery_keywords')
            .update({ is_active: !currentActive })
            .eq('id', id);
        if (!error) fetchKeywords();
    };

    // ── Dispara discovery ─────────────────────────────────────────────────────
    const handleRunDiscovery = async () => {
        if (isRunning) return;
        if (keywords.filter(k => k.is_active).length === 0) {
            showToast('Adicione pelo menos uma keyword ativa.', 'error');
            return;
        }
        setIsRunning(true);
        showToast('Busca iniciada em background. Aguarde alguns minutos...', 'info');
        try {
            const res = await fetch(`${SCRAPER_URL}/api/discovery/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                showToast('Busca em andamento! Atualize a lista em alguns minutos.', 'success');
                // Atualiza após 90s automaticamente
                setTimeout(() => {
                    fetchDiscoveries();
                    fetchKeywords();
                }, 90000);
            } else {
                showToast('Erro ao iniciar busca: ' + (data.error || ''), 'error');
            }
        } catch {
            showToast('Scraper offline. Verifique o serviço.', 'error');
        } finally {
            setIsRunning(false);
        }
    };

    // ── Adiciona ao tracker ───────────────────────────────────────────────────
    const handleAddToTracker = async (discovery) => {
        try {
            // Cria a oferta via callback do App (mesmo fluxo da oferta manual)
            await onAddOffer({
                name: discovery.advertiser_name,
                link: discovery.facebook_link,
                tags: [discovery.keyword],
                initial_ad_count: discovery.ad_count
            });

            // Marca como 'added' na tabela discovered_offers
            await supabaseClient
                .from('discovered_offers')
                .update({ status: 'added' })
                .eq('id', discovery.id);

            setDiscoveries(prev =>
                prev.map(d => d.id === discovery.id ? { ...d, status: 'added' } : d)
            );
            showToast(`"${discovery.advertiser_name}" adicionado ao tracker!`, 'success');
        } catch (e) {
            showToast('Erro ao adicionar: ' + e.message, 'error');
        }
    };

    // ── Descarta descoberta ───────────────────────────────────────────────────
    const handleDismiss = async (id, name) => {
        const { error } = await supabaseClient
            .from('discovered_offers')
            .update({ status: 'dismissed' })
            .eq('id', id);
        if (error) showToast('Erro ao descartar: ' + error.message, 'error');
        else {
            setDiscoveries(prev =>
                prev.map(d => d.id === id ? { ...d, status: 'dismissed' } : d)
            );
            showToast(`"${name}" descartado.`, 'success');
        }
    };

    const filteredDisc = discoveries.filter(d =>
        filterStatus === 'all' ? true : d.status === filterStatus
    );
    const pendingCount = discoveries.filter(d => d.status === 'pending').length;

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <Search size={20} className="text-blue-400" />
                        Descoberta Automática
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                        O robô busca anunciantes escalando por keyword e traz para você avaliar
                    </p>
                </div>
                <button
                    onClick={handleRunDiscovery}
                    disabled={isRunning}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        isRunning
                            ? 'bg-blue-600/10 text-blue-400/50 border border-blue-500/20 cursor-not-allowed'
                            : 'bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30'
                    }`}
                >
                    {isRunning
                        ? <RefreshCw size={15} className="animate-spin" />
                        : <Play size={15} />
                    }
                    {isRunning ? 'Buscando...' : 'Buscar Agora'}
                </button>
            </div>

            {/* ── Keywords ───────────────────────────────────────────────── */}
            <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <Tag size={14} className="text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-200">Keywords Monitoradas</h2>
                    <span className="text-xs text-slate-600 ml-1">
                        ({keywords.filter(k => k.is_active).length} ativas)
                    </span>
                </div>

                {/* Input nova keyword */}
                <form onSubmit={handleAddKeyword} className="flex gap-2">
                    <input
                        type="text"
                        value={newKeyword}
                        onChange={e => setNewKeyword(e.target.value)}
                        placeholder="Ex: emagrecimento, copo de café, curso de inglês..."
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/40"
                    />
                    <button
                        type="submit"
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600/20 border border-blue-500/30 text-blue-300 text-sm rounded-xl hover:bg-blue-600/30 transition-all"
                    >
                        <Plus size={14} />
                        Adicionar
                    </button>
                </form>

                {/* Lista de keywords */}
                {loadingKw ? (
                    <p className="text-xs text-slate-600 py-2">Carregando...</p>
                ) : keywords.length === 0 ? (
                    <p className="text-xs text-slate-600 py-2">Nenhuma keyword. Adicione uma acima.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {keywords.map(kw => (
                            <div
                                key={kw.id}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                                    kw.is_active
                                        ? 'bg-blue-600/10 border-blue-500/25 text-blue-300'
                                        : 'bg-slate-900/50 border-slate-700/30 text-slate-500'
                                }`}
                            >
                                <button
                                    onClick={() => handleToggleKeyword(kw.id, kw.is_active)}
                                    className="font-medium"
                                    title={kw.is_active ? 'Clique para pausar' : 'Clique para ativar'}
                                >
                                    {kw.keyword}
                                </button>
                                {kw.last_run_at && (
                                    <span className="text-slate-600 text-[10px]">
                                        {new Date(kw.last_run_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                    </span>
                                )}
                                <button
                                    onClick={() => handleDeleteKeyword(kw.id, kw.keyword)}
                                    className="text-slate-600 hover:text-red-400 transition-colors"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <p className="text-[11px] text-slate-600">
                    Clique na keyword para pausar/ativar. O robô roda automaticamente todo dia às 08:00.
                </p>
            </div>

            {/* ── Ofertas Encontradas ─────────────────────────────────────── */}
            <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Zap size={14} className="text-yellow-400" />
                        <h2 className="text-sm font-semibold text-slate-200">Ofertas Encontradas</h2>
                        {pendingCount > 0 && (
                            <span className="bg-yellow-500/20 text-yellow-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-yellow-500/30">
                                {pendingCount} novas
                            </span>
                        )}
                    </div>

                    {/* Filtros de status */}
                    <div className="flex gap-1">
                        {[
                            { value: 'pending',   label: 'Pendentes' },
                            { value: 'added',     label: 'Adicionadas' },
                            { value: 'dismissed', label: 'Descartadas' },
                            { value: 'all',       label: 'Todas' },
                        ].map(f => (
                            <button
                                key={f.value}
                                onClick={() => setFilterStatus(f.value)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                    filterStatus === f.value
                                        ? 'bg-white/[0.08] text-white'
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                        <button
                            onClick={fetchDiscoveries}
                            className="p-1 text-slate-600 hover:text-slate-300 transition-colors ml-1"
                            title="Atualizar"
                        >
                            <RefreshCw size={13} />
                        </button>
                    </div>
                </div>

                {loadingDisc ? (
                    <div className="py-8 flex items-center justify-center">
                        <RefreshCw size={16} className="text-slate-600 animate-spin" />
                    </div>
                ) : filteredDisc.length === 0 ? (
                    <div className="py-10 text-center space-y-2">
                        <Search size={28} className="text-slate-700 mx-auto" />
                        <p className="text-sm text-slate-600">
                            {filterStatus === 'pending'
                                ? 'Nenhuma oferta pendente. Clique em "Buscar Agora" para iniciar.'
                                : 'Nenhuma oferta neste filtro.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left border-b border-white/[0.05]">
                                    <th className="text-xs text-slate-500 font-medium pb-3 pr-4">Anunciante</th>
                                    <th className="text-xs text-slate-500 font-medium pb-3 pr-4">Keyword</th>
                                    <th className="text-xs text-slate-500 font-medium pb-3 pr-4 text-right">Ads Ativos</th>
                                    <th className="text-xs text-slate-500 font-medium pb-3 pr-4 text-right">Dias Rodando</th>
                                    <th className="text-xs text-slate-500 font-medium pb-3 pr-4">Encontrado em</th>
                                    <th className="text-xs text-slate-500 font-medium pb-3">Status</th>
                                    <th className="text-xs text-slate-500 font-medium pb-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                                {filteredDisc.map(d => {
                                    const sc = STATUS_CONFIG[d.status] || STATUS_CONFIG.pending;
                                    return (
                                        <tr key={d.id} className={`${d.status === 'dismissed' ? 'opacity-40' : ''}`}>
                                            {/* Anunciante */}
                                            <td className="py-3 pr-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-white truncate max-w-[180px]">
                                                        {d.advertiser_name}
                                                    </span>
                                                    <a
                                                        href={d.facebook_link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-slate-600 hover:text-blue-400 flex-shrink-0"
                                                    >
                                                        <ExternalLink size={12} />
                                                    </a>
                                                </div>
                                            </td>

                                            {/* Keyword */}
                                            <td className="py-3 pr-4">
                                                <span className="px-2 py-0.5 bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xs rounded-lg">
                                                    {d.keyword}
                                                </span>
                                            </td>

                                            {/* Ads */}
                                            <td className="py-3 pr-4 text-right">
                                                <span className={`font-bold ${d.ad_count >= 50 ? 'text-emerald-400' : d.ad_count >= 30 ? 'text-yellow-400' : 'text-slate-300'}`}>
                                                    {d.ad_count}
                                                </span>
                                            </td>

                                            {/* Dias rodando */}
                                            <td className="py-3 pr-4 text-right">
                                                <span className="text-slate-400 flex items-center gap-1 justify-end">
                                                    <Clock size={11} />
                                                    {d.days_running ?? '—'}
                                                </span>
                                            </td>

                                            {/* Data descoberta */}
                                            <td className="py-3 pr-4">
                                                <span className="text-slate-500 text-xs">
                                                    {new Date(d.discovered_at).toLocaleDateString('pt-BR', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                            </td>

                                            {/* Status */}
                                            <td className="py-3">
                                                <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium ${sc.color} ${sc.bg} ${sc.border}`}>
                                                    {sc.label}
                                                </span>
                                            </td>

                                            {/* Ações */}
                                            <td className="py-3 pl-3">
                                                {d.status === 'pending' && (
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => handleAddToTracker(d)}
                                                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600/15 border border-emerald-500/25 text-emerald-400 text-xs rounded-lg hover:bg-emerald-600/25 transition-all"
                                                            title="Adicionar ao tracker"
                                                        >
                                                            <TrendingUp size={11} />
                                                            Rastrear
                                                        </button>
                                                        <button
                                                            onClick={() => handleDismiss(d.id, d.advertiser_name)}
                                                            className="p-1.5 text-slate-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                                                            title="Descartar"
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                )}
                                                {d.status === 'added' && (
                                                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                                                        <CheckCircle size={12} />
                                                        No tracker
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
