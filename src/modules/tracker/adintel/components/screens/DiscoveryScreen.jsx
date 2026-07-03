import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Play, RefreshCw, ExternalLink, CheckCircle, X, Clock, Zap, Tag, TrendingUp, Square, Terminal, SlidersHorizontal } from 'lucide-react';

/**
 * Descoberta Automática — v2.
 * O robô (local ou GitHub Actions) espelha estado/logs/filtros no app_state do
 * Supabase (keys discovery_job / discovery_settings / discovery_stop), então
 * esta tela mostra progresso AO VIVO e controla o robô de qualquer lugar —
 * sem depender de localhost.
 */

const STATUS_CONFIG = {
    pending:   { label: 'Pendente',   color: 'text-yellow-400',  bg: 'bg-yellow-950/40',  border: 'border-yellow-500/30' },
    added:     { label: 'Adicionada', color: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-500/30' },
    dismissed: { label: 'Descartada', color: 'text-slate-500',   bg: 'bg-slate-900/30',   border: 'border-slate-700/30' },
};

const DEFAULT_SETTINGS = { minAdCount: 20, minDaysRunning: 2, maxAdvertisers: 15 };

function JobStatusPill({ job }) {
    if (!job) {
        return (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-900/60 border border-slate-700/40 text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                Sem execuções ainda
            </span>
        );
    }
    if (job.status === 'running') {
        const kw = (job.currentKeywords || []).join(', ');
        return (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-blue-950/40 border border-blue-500/30 text-blue-300" title={kw ? `Agora: ${kw}` : ''}>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Rodando · {job.keywordsDone}/{job.keywordsTotal} keywords · {job.found} achada{job.found === 1 ? '' : 's'}
            </span>
        );
    }
    if (job.status === 'error') {
        return (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-red-950/40 border border-red-500/30 text-red-400" title={job.error || ''}>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Erro na última busca
            </span>
        );
    }
    if (job.status === 'stopped') {
        return (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-yellow-950/40 border border-yellow-500/30 text-yellow-400">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                Parada manual · {job.found} salva{job.found === 1 ? '' : 's'}
            </span>
        );
    }
    if (job.status === 'done') {
        const when = job.finishedAt ? new Date(job.finishedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        return (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-950/40 border border-emerald-500/30 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Última busca {when}: {job.found} oferta{job.found === 1 ? '' : 's'}
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-900/60 border border-slate-700/40 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            Parado
        </span>
    );
}

export default function DiscoveryScreen({ userId, supabaseClient, showToast, onAddOffer }) {
    const [keywords, setKeywords] = useState([]);
    const [discoveries, setDiscoveries] = useState([]);
    const [newKeyword, setNewKeyword] = useState('');
    const [loadingKw, setLoadingKw] = useState(true);
    const [loadingDisc, setLoadingDisc] = useState(true);
    const [filterStatus, setFilterStatus] = useState('pending');

    const [job, setJob] = useState(null);
    const [showLogs, setShowLogs] = useState(false);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [savingSettings, setSavingSettings] = useState(false);
    const [starting, setStarting] = useState(false);
    const logsEndRef = useRef(null);
    const prevStatusRef = useRef(null);

    const jobRunning = job?.status === 'running';

    /* ── app_state helpers (o robô espelha o estado aqui) ── */
    const stateGet = useCallback(async (key) => {
        if (!supabaseClient) return null;
        const { data } = await supabaseClient.from('app_state').select('value').eq('key', key).maybeSingle();
        return data?.value ?? null;
    }, [supabaseClient]);

    const stateSet = useCallback(async (key, value) => {
        if (!supabaseClient) return;
        await supabaseClient.from('app_state').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    }, [supabaseClient]);

    const fetchStatus = useCallback(async () => {
        const j = await stateGet('discovery_job').catch(() => null);
        if (j) setJob(j);
        return j;
    }, [stateGet]);

    /* ── dados ── */
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
        fetchStatus();
        stateGet('discovery_settings').then((s) => s && setSettings(v => ({ ...v, ...s }))).catch(() => {});
    }, [fetchKeywords, fetchDiscoveries, fetchStatus, stateGet]);

    // polling do estado: 5s rodando, 20s parado (a tela reflete até runs do Actions/cron)
    useEffect(() => {
        const t = setInterval(fetchStatus, jobRunning ? 5000 : 20000);
        return () => clearInterval(t);
    }, [jobRunning, fetchStatus]);

    // terminou? recarrega a lista e avisa
    useEffect(() => {
        const prev = prevStatusRef.current;
        const cur = job?.status || null;
        prevStatusRef.current = cur;
        if (prev === 'running' && cur && cur !== 'running') {
            fetchDiscoveries();
            fetchKeywords();
            if (cur === 'done') showToast(`Busca concluída: ${job.found} oferta(s) escalada(s)!`, 'success');
            else if (cur === 'stopped') showToast(`Busca parada. ${job.found} salva(s) até aqui.`, 'info');
            else if (cur === 'error') showToast('Busca terminou com erro: ' + (job.error || ''), 'error');
        }
    }, [job, fetchDiscoveries, fetchKeywords, showToast]);

    useEffect(() => {
        if (showLogs) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [job?.logs?.length, showLogs]);

    /* ── keywords CRUD ── */
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
        if (error) showToast('Erro ao adicionar keyword: ' + error.message, 'error');
        else {
            setNewKeyword('');
            showToast(`Keyword "${kw}" adicionada!`, 'success');
            fetchKeywords();
        }
    };

    const handleDeleteKeyword = async (id, kw) => {
        const { error } = await supabaseClient.from('discovery_keywords').delete().eq('id', id);
        if (error) showToast('Erro ao remover: ' + error.message, 'error');
        else { showToast(`Keyword "${kw}" removida.`, 'success'); fetchKeywords(); }
    };

    const handleToggleKeyword = async (id, currentActive) => {
        const { error } = await supabaseClient.from('discovery_keywords').update({ is_active: !currentActive }).eq('id', id);
        if (!error) fetchKeywords();
    };

    /* ── robô: disparar / parar / filtros ── */
    const handleRunDiscovery = async () => {
        if (jobRunning || starting) return;
        if (keywords.filter(k => k.is_active).length === 0) {
            showToast('Adicione pelo menos uma keyword ativa.', 'error');
            return;
        }
        setStarting(true);
        try {
            // salva os filtros antes (o robô lê do app_state) e dispara na NUVEM
            await stateSet('discovery_settings', settings).catch(() => {});
            const res = await fetch('/api/scraper-run?job=discovery', { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.ok) {
                showToast('Busca disparada na nuvem! O robô sobe em ~1 min — acompanhe o status aqui.', 'success');
                setShowLogs(true);
            } else {
                showToast('Erro ao disparar busca: ' + (data.error || ''), 'error');
            }
        } catch {
            showToast('Não consegui disparar a busca na nuvem. Tente de novo.', 'error');
        } finally {
            setStarting(false);
        }
    };

    const handleStopDiscovery = async () => {
        try {
            await stateSet('discovery_stop', { requested: true, ts: new Date().toISOString() });
            showToast('Parada solicitada — o robô encerra no próximo passo (até ~15s).', 'info');
        } catch (e) {
            showToast('Erro ao pedir parada: ' + e.message, 'error');
        }
    };

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            const clean = {
                minAdCount: Math.max(1, parseInt(settings.minAdCount, 10) || 20),
                minDaysRunning: Math.max(0, parseInt(settings.minDaysRunning, 10) || 0),
                maxAdvertisers: Math.min(50, Math.max(1, parseInt(settings.maxAdvertisers, 10) || 15)),
            };
            await stateSet('discovery_settings', clean);
            setSettings(clean);
            showToast(`Filtro salvo: ≥${clean.minAdCount} ads · ≥${clean.minDaysRunning} dias. Vale pras rodadas automáticas também.`, 'success');
        } catch (e) {
            showToast('Erro ao salvar filtro: ' + e.message, 'error');
        } finally {
            setSavingSettings(false);
        }
    };

    /* ── ofertas encontradas ── */
    const handleAddToTracker = async (discovery) => {
        try {
            await onAddOffer({
                name: discovery.advertiser_name,
                link: discovery.facebook_link,
                tags: [discovery.keyword],
                initial_ad_count: discovery.ad_count
            });
            await supabaseClient.from('discovered_offers').update({ status: 'added' }).eq('id', discovery.id);
            setDiscoveries(prev => prev.map(d => d.id === discovery.id ? { ...d, status: 'added' } : d));
            showToast(`"${discovery.advertiser_name}" adicionado ao tracker!`, 'success');
        } catch (e) {
            showToast('Erro ao adicionar: ' + e.message, 'error');
        }
    };

    const handleDismiss = async (id, name) => {
        const { error } = await supabaseClient.from('discovered_offers').update({ status: 'dismissed' }).eq('id', id);
        if (error) showToast('Erro ao descartar: ' + error.message, 'error');
        else {
            setDiscoveries(prev => prev.map(d => d.id === id ? { ...d, status: 'dismissed' } : d));
            showToast(`"${name}" descartado.`, 'success');
        }
    };

    const filteredDisc = discoveries.filter(d => filterStatus === 'all' ? true : d.status === filterStatus);
    const pendingCount = discoveries.filter(d => d.status === 'pending').length;
    const setNum = (key, v) => setSettings(s => ({ ...s, [key]: v === '' ? '' : Math.max(0, parseInt(v, 10) || 0) }));

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <Search size={20} className="text-blue-400" />
                        Descoberta Automática
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                        O robô busca anunciantes escalando por keyword e traz para você avaliar
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <JobStatusPill job={job} />
                    <button
                        onClick={() => setShowLogs(v => !v)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                            showLogs ? 'bg-white/[0.08] text-white border-white/[0.12]' : 'text-slate-400 border-white/[0.08] hover:text-white'
                        }`}
                        title="Ver os logs do robô"
                    >
                        <Terminal size={13} />
                        Logs
                    </button>
                    {jobRunning ? (
                        <button
                            onClick={handleStopDiscovery}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30 transition-all"
                        >
                            <Square size={13} />
                            Parar
                        </button>
                    ) : (
                        <button
                            onClick={handleRunDiscovery}
                            disabled={starting}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                                starting
                                    ? 'bg-blue-600/10 text-blue-400/50 border border-blue-500/20 cursor-not-allowed'
                                    : 'bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30'
                            }`}
                        >
                            {starting ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
                            {starting ? 'Disparando...' : 'Buscar Agora'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── Logs do robô ───────────────────────────────────────────── */}
            {showLogs && (
                <div className="bg-[#0a0e14] border border-white/[0.06] rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Terminal size={13} className="text-slate-400" />
                            <h2 className="text-xs font-semibold text-slate-300">Logs do robô</h2>
                            {jobRunning && <RefreshCw size={11} className="text-blue-400 animate-spin" />}
                        </div>
                        <button onClick={fetchStatus} className="text-slate-600 hover:text-slate-300" title="Atualizar">
                            <RefreshCw size={12} />
                        </button>
                    </div>
                    <div className="max-h-52 overflow-y-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
                        {!job?.logs?.length ? (
                            <p className="text-slate-600">Sem logs ainda. Clique em "Buscar Agora" — o robô sobe em ~1 min e os logs aparecem aqui ao vivo.</p>
                        ) : (
                            <>
                                {job.logs.map((l, i) => (
                                    <div key={i} className={l.includes('✅') ? 'text-emerald-400' : l.includes('❌') || l.includes('⚠') ? 'text-red-400/80' : l.includes('⏹') ? 'text-yellow-400' : ''}>{l}</div>
                                ))}
                                <div ref={logsEndRef} />
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Keywords + filtro de escalado ──────────────────────────── */}
            <div className="bg-[#0d1117] border border-white/[0.06] rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <Tag size={14} className="text-slate-400" />
                    <h2 className="text-sm font-semibold text-slate-200">Keywords Monitoradas</h2>
                    <span className="text-xs text-slate-600 ml-1">
                        ({keywords.filter(k => k.is_active).length} ativas)
                    </span>
                </div>

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

                {/* Filtro do que é "escalado" pra você */}
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mr-1">
                        <SlidersHorizontal size={13} className="text-slate-400" />
                        Escalado pra mim é:
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                        ≥
                        <input
                            type="number" min="1" value={settings.minAdCount}
                            onChange={e => setNum('minAdCount', e.target.value)}
                            className="w-16 bg-white/[0.05] border border-white/[0.1] rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-blue-500/40"
                        />
                        anúncios ativos
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                        há ≥
                        <input
                            type="number" min="0" value={settings.minDaysRunning}
                            onChange={e => setNum('minDaysRunning', e.target.value)}
                            className="w-14 bg-white/[0.05] border border-white/[0.1] rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-blue-500/40"
                        />
                        dias
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                        · confirmar top
                        <input
                            type="number" min="1" max="50" value={settings.maxAdvertisers}
                            onChange={e => setNum('maxAdvertisers', e.target.value)}
                            className="w-14 bg-white/[0.05] border border-white/[0.1] rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-blue-500/40"
                        />
                        anunciantes/keyword
                    </label>
                    <button
                        onClick={handleSaveSettings}
                        disabled={savingSettings}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/15 border border-emerald-500/25 text-emerald-400 text-xs rounded-lg hover:bg-emerald-600/25 transition-all disabled:opacity-50"
                    >
                        {savingSettings ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                        Salvar filtro
                    </button>
                </div>

                <p className="text-[11px] text-slate-600">
                    Clique na keyword para pausar/ativar. O robô roda sozinho todo dia — e usa o filtro salvo acima.
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
                                                        title="Abrir anúncios ativos na Biblioteca"
                                                    >
                                                        <ExternalLink size={12} />
                                                    </a>
                                                </div>
                                            </td>
                                            <td className="py-3 pr-4">
                                                <span className="px-2 py-0.5 bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xs rounded-lg">
                                                    {d.keyword}
                                                </span>
                                            </td>
                                            <td className="py-3 pr-4 text-right">
                                                <span className={`font-bold ${d.ad_count >= 50 ? 'text-emerald-400' : d.ad_count >= 30 ? 'text-yellow-400' : 'text-slate-300'}`}>
                                                    {d.ad_count}
                                                </span>
                                            </td>
                                            <td className="py-3 pr-4 text-right">
                                                <span className="text-slate-400 flex items-center gap-1 justify-end">
                                                    <Clock size={11} />
                                                    {d.days_running ?? '—'}
                                                </span>
                                            </td>
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
                                            <td className="py-3">
                                                <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium ${sc.color} ${sc.bg} ${sc.border}`}>
                                                    {sc.label}
                                                </span>
                                            </td>
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
