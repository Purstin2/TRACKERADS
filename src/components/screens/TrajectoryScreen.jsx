import React, { useState, useEffect, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { Trophy, XCircle, Clock, Target, TrendingUp, RotateCcw, Check, X } from 'lucide-react';
import { smartClassifyOffer } from '../../utils/smartClassification';
import { getSafeDate } from '../../utils/helpers';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

// ── Veredito automático a partir do status da classificação inteligente ────────
const WIN_STATUSES = ['DOMINANT', 'SCALING_CONFIRMED', 'SCALING', 'ACCELERATING', 'VALIDATING'];
const LOSS_STATUSES = ['DEAD', 'DYING'];

function autoOutcome(status, peak) {
    if (WIN_STATUSES.includes(status)) return 'win';
    if (peak >= 40 && (status === 'STABLE' || status === 'EXHAUSTING')) return 'win'; // chegou a escalar
    if (LOSS_STATUSES.includes(status)) return 'loss';
    if (status === 'EXHAUSTING') return 'loss'; // fadigou sem nunca escalar de verdade
    return 'pending';
}

// ── Agrupa o status atual em 3 baldes para os chips do portfólio ───────────────
function statusBucket(status) {
    if (WIN_STATUSES.includes(status)) return 'scaling';
    if (['DEAD', 'DYING', 'EXHAUSTING', 'INACTIVE'].includes(status)) return 'dead';
    return 'testing';
}

const OUTCOME_META = {
    win:     { label: 'Acerto',       color: '#10b981', text: 'text-emerald-400' },
    loss:    { label: 'Erro',         color: '#ef4444', text: 'text-red-400' },
    pending: { label: 'Em andamento', color: '#64748b', text: 'text-slate-400' }
};

const TrajectoryScreen = ({ offers = [], userId, supabaseClient, showToast, fetchOffers }) => {
    const [adCountsByOffer, setAdCountsByOffer] = useState({});
    const [timeRange, setTimeRange] = useState(30);
    const [loading, setLoading] = useState(true);

    // Considera todas as ofertas (inclui arquivadas) para o track-record completo
    const allOffers = offers;

    useEffect(() => {
        if (userId && supabaseClient && allOffers.length > 0) fetchHistory();
        else setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, supabaseClient, timeRange, allOffers.length]);

    const fetchHistory = async () => {
        setLoading(true);
        const ids = allOffers.map(o => o.id);
        let query = supabaseClient
            .from('ad_counts')
            .select('offer_id, count, timestamp')
            .eq('user_id', userId)
            .in('offer_id', ids)
            .order('timestamp', { ascending: true });

        if (timeRange > 0) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - timeRange);
            query = query.gte('timestamp', cutoff.toISOString());
        }

        const { data, error } = await query;
        const grouped = {};
        if (!error && data) {
            for (const row of data) {
                (grouped[row.offer_id] = grouped[row.offer_id] || []).push(row);
            }
        }
        setAdCountsByOffer(grouped);
        setLoading(false);
    };

    // ── Métricas + veredito por oferta ─────────────────────────────────────────
    const rows = useMemo(() => {
        return allOffers.map(offer => {
            const history = adCountsByOffer[offer.id] || [];
            const counts = history.map(h => h.count || 0);
            const peak = counts.length ? Math.max(...counts) : (offer.last_ad_count || 0);
            const latest = counts.length ? counts[counts.length - 1] : (offer.last_ad_count || 0);
            const classification = smartClassifyOffer(history.length ? history : [
                { count: offer.last_ad_count || 0, timestamp: offer.last_ad_count_timestamp || new Date().toISOString() }
            ]);

            const firstDate = history.length ? getSafeDate(history[0].timestamp) : null;
            const daysTracked = firstDate ? Math.max(1, Math.floor((Date.now() - firstDate.getTime()) / 86400000)) : 0;

            const auto = autoOutcome(classification.status, peak);
            const effective = offer.outcome || auto; // override manual vence
            const isOverridden = !!offer.outcome;

            return {
                id: offer.id, name: offer.name, offer,
                history, peak, latest, classification,
                daysTracked, auto, effective, isOverridden,
                bucket: statusBucket(classification.status)
            };
        });
    }, [allOffers, adCountsByOffer]);

    // ── Placar ─────────────────────────────────────────────────────────────────
    const score = useMemo(() => {
        const s = { win: 0, loss: 0, pending: 0, scaling: 0, testing: 0, dead: 0 };
        rows.forEach(r => { s[r.effective]++; s[r.bucket]++; });
        const decided = s.win + s.loss;
        s.winRate = decided > 0 ? Math.round((s.win / decided) * 100) : null;
        return s;
    }, [rows]);

    // ── Quais ofertas plotar (top 10 por pico, para o gráfico não virar sopa) ──
    const chartOffers = useMemo(() => {
        return [...rows].sort((a, b) => b.peak - a.peak).slice(0, 10);
    }, [rows]);

    const chartData = useMemo(() => {
        const dateMap = {};
        chartOffers.forEach(r => {
            r.history.forEach(ac => {
                const date = new Date(ac.timestamp).toISOString().split('T')[0];
                (dateMap[date] = dateMap[date] || { date })[r.name] = ac.count;
            });
        });
        return Object.values(dateMap)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map(d => ({ ...d, date: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }));
    }, [chartOffers]);

    const pieData = useMemo(() => ([
        { name: 'Acertos', value: score.win, color: OUTCOME_META.win.color },
        { name: 'Erros', value: score.loss, color: OUTCOME_META.loss.color },
        { name: 'Em andamento', value: score.pending, color: OUTCOME_META.pending.color }
    ].filter(d => d.value > 0)), [score]);

    const setOutcome = async (offerId, value) => {
        const { error } = await supabaseClient.from('offers').update({ outcome: value }).eq('id', offerId);
        if (error) {
            showToast && showToast(`Rode a migração SQL (coluna outcome): ${error.message}`, 'error');
            return;
        }
        showToast && showToast(value ? 'Veredito atualizado.' : 'Voltou ao veredito automático.', 'success');
        fetchOffers && fetchOffers();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-slate-500 text-sm">Carregando trajetória...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight">Trajetória</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Histórico das suas ofertas — quais escalaram, testaram e morreram</p>
                </div>
                <div className="flex items-center gap-1 bg-[#0D1220] border border-white/[0.07] rounded-xl p-1">
                    {[{ v: 7, l: '7d' }, { v: 14, l: '14d' }, { v: 30, l: '30d' }, { v: 60, l: '60d' }, { v: 0, l: 'Tudo' }].map(({ v, l }) => (
                        <button key={v} onClick={() => setTimeRange(v)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                timeRange === v ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                            {l}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Placar ─────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <ScoreCard icon={Trophy} label="Acertos" value={score.win} accent="emerald"
                    sub={score.winRate !== null ? `${score.winRate}% de acerto` : 'sem conclusões ainda'} />
                <ScoreCard icon={XCircle} label="Erros" value={score.loss} accent="red"
                    sub={`${score.win + score.loss} ofertas concluídas`} />
                <ScoreCard icon={Clock} label="Em andamento" value={score.pending} accent="slate"
                    sub="ainda rodando / testando" />
                <ScoreCard icon={Target} label="Total rastreado" value={rows.length} accent="blue"
                    sub={`🟢 ${score.scaling} escalando · 🟡 ${score.testing} teste · 💀 ${score.dead} mortas`} />
            </div>

            {rows.length === 0 ? (
                <div className="bg-[#0D1220]/80 border border-white/[0.07] rounded-2xl p-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                        <TrendingUp size={24} className="text-blue-400" />
                    </div>
                    <p className="text-slate-300 font-medium mb-1">Nenhuma oferta para mostrar</p>
                    <p className="text-slate-500 text-sm">Adicione targets e rode o scraping para começar a registrar sua trajetória.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    {/* Gráfico comparativo (2/3) */}
                    <div className="lg:col-span-2 bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6">
                        <h3 className="text-sm font-medium text-white mb-1">Evolução das ofertas</h3>
                        <p className="text-xs text-slate-500 mb-5">Subindo = escalando · reta baixa = teste · caiu a zero = morreu</p>
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={330}>
                                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                    <XAxis dataKey="date" stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <YAxis stroke="transparent" tick={{ fill: '#64748b', fontSize: 11 }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#0D1220', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#e2e8f0', fontSize: '12px' }}
                                        labelStyle={{ color: '#94a3b8', marginBottom: 4 }} />
                                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }} />
                                    {chartOffers.map((r, i) => (
                                        <Line key={r.id} type="monotone" dataKey={r.name}
                                            stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2}
                                            dot={false} activeDot={{ r: 4 }} connectNulls />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[330px] flex items-center justify-center">
                                <p className="text-slate-500 text-sm">Sem histórico no período. Rode o scraping ou troque o período para "Tudo".</p>
                            </div>
                        )}
                    </div>

                    {/* Donut acertos x erros (1/3) */}
                    <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6 flex flex-col">
                        <h3 className="text-sm font-medium text-white mb-1">Acertos × Erros</h3>
                        <p className="text-xs text-slate-500 mb-2">Seu aproveitamento</p>
                        {pieData.length > 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center">
                                <ResponsiveContainer width="100%" height={200}>
                                    <PieChart>
                                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                                            innerRadius={55} outerRadius={80} paddingAngle={3} stroke="none">
                                            {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: '#0D1220', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#e2e8f0', fontSize: '12px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="text-center -mt-[125px] mb-[95px] pointer-events-none">
                                    <div className="text-3xl font-bold text-white tabular-nums">{score.winRate !== null ? `${score.winRate}%` : '—'}</div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">acerto</div>
                                </div>
                                <div className="flex flex-wrap justify-center gap-3 mt-1">
                                    {pieData.map((d, i) => (
                                        <span key={i} className="flex items-center gap-1.5 text-xs text-slate-400">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                                            {d.name} <span className="text-slate-500 tabular-nums">{d.value}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <p className="text-slate-500 text-sm text-center">Sem conclusões ainda.<br/>Conforme as ofertas escalam ou morrem, o placar aparece aqui.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Tabela de trajetória ──────────────────────────────────────── */}
            {rows.length > 0 && (
                <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6">
                    <h3 className="text-sm font-medium text-white mb-4">Trajetória por oferta</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/[0.05]">
                                    <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Oferta</th>
                                    <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status atual</th>
                                    <th className="text-right py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Pico</th>
                                    <th className="text-right py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Atual</th>
                                    <th className="text-right py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Dias</th>
                                    <th className="text-center py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Veredito</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...rows].sort((a, b) => b.peak - a.peak).map((r, i) => (
                                    <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                        <td className="py-3 px-3">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[chartOffers.findIndex(c => c.id === r.id) % CHART_COLORS.length] || '#475569' }} />
                                                <span className="text-slate-200 font-medium truncate max-w-[180px]">{r.name}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-3">
                                            <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${r.classification.bgColor} ${r.classification.color} ${r.classification.borderColor}`}>
                                                {r.classification.label}
                                            </span>
                                        </td>
                                        <td className="text-right py-3 px-3 text-emerald-400 tabular-nums">{r.peak}</td>
                                        <td className="text-right py-3 px-3 text-white font-semibold tabular-nums">{r.latest}</td>
                                        <td className="text-right py-3 px-3 text-slate-500 tabular-nums">{r.daysTracked || '—'}</td>
                                        <td className="py-3 px-3">
                                            <div className="flex items-center justify-center gap-1">
                                                <OutcomeBtn active={r.effective === 'win'} onClick={() => setOutcome(r.id, 'win')} title="Marcar como Acerto" color="emerald"><Check size={13} /></OutcomeBtn>
                                                <OutcomeBtn active={r.effective === 'loss'} onClick={() => setOutcome(r.id, 'loss')} title="Marcar como Erro" color="red"><X size={13} /></OutcomeBtn>
                                                <OutcomeBtn active={r.effective === 'pending'} onClick={() => setOutcome(r.id, 'pending')} title="Em andamento" color="slate"><Clock size={13} /></OutcomeBtn>
                                                {r.isOverridden && (
                                                    <button onClick={() => setOutcome(r.id, null)} title="Voltar ao automático"
                                                        className="ml-1 text-slate-600 hover:text-slate-300 transition-colors">
                                                        <RotateCcw size={12} />
                                                    </button>
                                                )}
                                                <span className="ml-1.5 text-[10px] text-slate-600 w-10">{r.isOverridden ? 'manual' : 'auto'}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Subcomponentes ─────────────────────────────────────────────────────────────
const ACCENTS = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    red: 'text-red-400 bg-red-500/10',
    slate: 'text-slate-400 bg-slate-500/10',
    blue: 'text-blue-400 bg-blue-500/10'
};

function ScoreCard({ icon: Icon, label, value, sub, accent }) {
    return (
        <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${ACCENTS[accent]}`}>
                    <Icon size={16} />
                </div>
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-3xl font-bold text-white tabular-nums leading-none mb-1.5">{value}</div>
            <p className="text-[11px] text-slate-500 leading-tight">{sub}</p>
        </div>
    );
}

const BTN_COLORS = {
    emerald: 'bg-emerald-500 text-white border-emerald-400',
    red: 'bg-red-500 text-white border-red-400',
    slate: 'bg-slate-600 text-white border-slate-500'
};

function OutcomeBtn({ active, onClick, title, color, children }) {
    return (
        <button onClick={onClick} title={title}
            className={`w-6 h-6 rounded-md flex items-center justify-center border transition-all ${
                active ? BTN_COLORS[color] : 'bg-white/[0.03] text-slate-500 border-white/[0.06] hover:bg-white/[0.08] hover:text-slate-300'}`}>
            {children}
        </button>
    );
}

export default TrajectoryScreen;
