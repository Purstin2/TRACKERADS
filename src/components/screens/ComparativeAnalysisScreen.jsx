import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, X, Plus, CheckSquare, Square, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const ComparativeAnalysisScreen = ({ offers, userId, showToast, supabaseClient }) => {
    const [selectedOffers, setSelectedOffers] = useState([]);
    const [adCountsData, setAdCountsData] = useState({});
    const [timeRange, setTimeRange] = useState(30);
    const [loading, setLoading] = useState(false);
    const [showSelector, setShowSelector] = useState(true);

    const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

    useEffect(() => {
        if (selectedOffers.length > 0) {
            fetchAdCountsForOffers();
        }
    }, [selectedOffers, timeRange]);

    const fetchAdCountsForOffers = async () => {
        if (!userId || !supabaseClient || selectedOffers.length === 0) return;

        setLoading(true);
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - timeRange);

        const dataMap = {};

        for (const offerId of selectedOffers) {
            const { data, error } = await supabaseClient
                .from('ad_counts')
                .select('*')
                .eq('offer_id', offerId)
                .eq('user_id', userId)
                .gte('timestamp', daysAgo.toISOString())
                .order('timestamp', { ascending: true });

            if (!error && data) {
                dataMap[offerId] = data;
            }
        }

        setAdCountsData(dataMap);
        setLoading(false);
    };

    const toggleOfferSelection = (offerId) => {
        setSelectedOffers(prev =>
            prev.includes(offerId)
                ? prev.filter(id => id !== offerId)
                : prev.length < 8
                    ? [...prev, offerId]
                    : prev
        );
    };

    const chartData = useMemo(() => {
        const dateMap = {};

        selectedOffers.forEach((offerId, index) => {
            const offer = offers.find(o => o.id === offerId);
            const counts = adCountsData[offerId] || [];

            counts.forEach(ac => {
                const date = new Date(ac.timestamp).toISOString().split('T')[0];
                if (!dateMap[date]) {
                    dateMap[date] = { date };
                }
                dateMap[date][offer?.name || `Target ${index + 1}`] = ac.count;
            });
        });

        return Object.values(dateMap)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map(d => ({
                ...d,
                date: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            }));
    }, [selectedOffers, adCountsData, offers]);

    const comparisonStats = useMemo(() => {
        return selectedOffers.map(offerId => {
            const offer = offers.find(o => o.id === offerId);
            const counts = adCountsData[offerId] || [];

            if (counts.length === 0) {
                return {
                    id: offerId,
                    name: offer?.name || 'Unknown',
                    current: offer?.last_ad_count || 0,
                    max: offer?.last_ad_count || 0,
                    min: offer?.last_ad_count || 0,
                    avg: offer?.last_ad_count || 0,
                    trend: 0,
                    dataPoints: 0
                };
            }

            const countValues = counts.map(c => c.count);
            const max = Math.max(...countValues);
            const min = Math.min(...countValues);
            const avg = countValues.reduce((a, b) => a + b, 0) / countValues.length;

            const firstCount = counts[0].count;
            const lastCount = counts[counts.length - 1].count;
            const trend = firstCount > 0 ? ((lastCount - firstCount) / firstCount) * 100 : 0;

            return {
                id: offerId,
                name: offer?.name || 'Unknown',
                current: lastCount,
                max,
                min,
                avg: Math.round(avg),
                trend: Math.round(trend),
                dataPoints: counts.length
            };
        });
    }, [selectedOffers, adCountsData, offers]);

    const activeOffers = offers.filter(o => !o.is_archived);

    if (loading && selectedOffers.length > 0) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-slate-500 text-sm">Carregando comparação...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight">Análise Comparativa</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Compare a evolução de até 8 targets lado a lado</p>
                </div>
                <div className="flex items-center gap-1 bg-[#0D1220] border border-white/[0.07] rounded-xl p-1">
                    {[7, 14, 30, 60].map(days => (
                        <button
                            key={days}
                            onClick={() => setTimeRange(days)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                timeRange === days
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {days}d
                        </button>
                    ))}
                </div>
            </div>

            {/* Target Selector */}
            <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-medium text-white">
                            Targets Selecionados
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">{selectedOffers.length}/8 selecionados</p>
                    </div>
                    <button
                        onClick={() => setShowSelector(!showSelector)}
                        className="text-xs text-slate-400 hover:text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 rounded-lg transition-colors"
                    >
                        {showSelector ? 'Ocultar' : 'Mostrar'}
                    </button>
                </div>

                {showSelector && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 mb-4">
                        {activeOffers.map((offer, index) => {
                            const isSelected = selectedOffers.includes(offer.id);
                            const colorIdx = selectedOffers.indexOf(offer.id);
                            return (
                                <button
                                    key={offer.id}
                                    onClick={() => toggleOfferSelection(offer.id)}
                                    className={`flex items-center gap-2 p-2.5 rounded-xl text-left transition-all text-sm border ${
                                        isSelected
                                            ? 'border-blue-500/30 bg-blue-500/10 text-white'
                                            : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                                    }`}
                                >
                                    {isSelected ? (
                                        <CheckSquare size={14} className="flex-shrink-0 text-blue-400" />
                                    ) : (
                                        <Square size={14} className="flex-shrink-0" />
                                    )}
                                    <span className="truncate text-xs font-medium">{offer.name}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {selectedOffers.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-white/[0.05]">
                        {selectedOffers.map((offerId, index) => {
                            const offer = offers.find(o => o.id === offerId);
                            return (
                                <div
                                    key={offerId}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-medium border border-white/[0.15]"
                                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] + '25', borderColor: CHART_COLORS[index % CHART_COLORS.length] + '50' }}
                                >
                                    <span style={{ color: CHART_COLORS[index % CHART_COLORS.length] }}>{offer?.name || 'Unknown'}</span>
                                    <button
                                        onClick={() => toggleOfferSelection(offerId)}
                                        className="hover:opacity-70 transition-opacity"
                                        style={{ color: CHART_COLORS[index % CHART_COLORS.length] }}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {selectedOffers.length === 0 ? (
                <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                        <TrendingUp size={24} className="text-blue-400" />
                    </div>
                    <p className="text-slate-300 font-medium mb-1">Nenhum target selecionado</p>
                    <p className="text-slate-500 text-sm">Selecione até 8 targets acima para comparar suas métricas</p>
                </div>
            ) : (
                <>
                    {/* Line Chart */}
                    <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6 mb-6">
                        <h3 className="text-sm font-medium text-white mb-6">Evolução Comparativa</h3>
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={360}>
                                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                    <XAxis
                                        dataKey="date"
                                        stroke="transparent"
                                        tick={{ fill: '#64748b', fontSize: 11 }}
                                    />
                                    <YAxis
                                        stroke="transparent"
                                        tick={{ fill: '#64748b', fontSize: 11 }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#0D1220',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '12px',
                                            color: '#e2e8f0',
                                            fontSize: '12px'
                                        }}
                                        labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
                                    />
                                    <Legend
                                        wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }}
                                    />
                                    {selectedOffers.map((offerId, index) => {
                                        const offer = offers.find(o => o.id === offerId);
                                        return (
                                            <Line
                                                key={offerId}
                                                type="monotone"
                                                dataKey={offer?.name || `Target ${index + 1}`}
                                                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                                                strokeWidth={2}
                                                dot={false}
                                                activeDot={{ r: 4 }}
                                            />
                                        );
                                    })}
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[360px] flex items-center justify-center">
                                <p className="text-slate-500 text-sm">Sem dados para exibir no período selecionado</p>
                            </div>
                        )}
                    </div>

                    {/* Stats Table */}
                    <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6 mb-6">
                        <h3 className="text-sm font-medium text-white mb-4">Estatísticas Comparativas</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/[0.05]">
                                        <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Target</th>
                                        <th className="text-right py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Atual</th>
                                        <th className="text-right py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Máx</th>
                                        <th className="text-right py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Mín</th>
                                        <th className="text-right py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Média</th>
                                        <th className="text-right py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Tendência</th>
                                        <th className="text-right py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Registros</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comparisonStats.map((stat, index) => (
                                        <tr key={stat.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                            <td className="py-3 px-3">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                                    />
                                                    <span className="text-slate-200 font-medium truncate max-w-[160px]">{stat.name}</span>
                                                </div>
                                            </td>
                                            <td className="text-right py-3 px-3 text-white font-semibold tabular-nums">{stat.current}</td>
                                            <td className="text-right py-3 px-3 text-emerald-400 tabular-nums">{stat.max}</td>
                                            <td className="text-right py-3 px-3 text-blue-400 tabular-nums">{stat.min}</td>
                                            <td className="text-right py-3 px-3 text-violet-400 tabular-nums">{stat.avg}</td>
                                            <td className="text-right py-3 px-3">
                                                <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
                                                    stat.trend > 0 ? 'text-emerald-400' : stat.trend < 0 ? 'text-red-400' : 'text-slate-500'
                                                }`}>
                                                    {stat.trend > 0 ? <ArrowUpRight size={13} /> : stat.trend < 0 ? <ArrowDownRight size={13} /> : null}
                                                    {stat.trend > 0 ? '+' : ''}{stat.trend}%
                                                </span>
                                            </td>
                                            <td className="text-right py-3 px-3 text-slate-500 tabular-nums">{stat.dataPoints}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Bar Chart */}
                    <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6">
                        <h3 className="text-sm font-medium text-white mb-6">Comparação por Média</h3>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={comparisonStats} margin={{ top: 5, right: 10, left: -10, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                <XAxis
                                    dataKey="name"
                                    stroke="transparent"
                                    tick={{ fill: '#64748b', fontSize: 11 }}
                                    angle={-40}
                                    textAnchor="end"
                                />
                                <YAxis
                                    stroke="transparent"
                                    tick={{ fill: '#64748b', fontSize: 11 }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#0D1220',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        color: '#e2e8f0',
                                        fontSize: '12px'
                                    }}
                                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                />
                                <Bar dataKey="avg" name="Média" radius={[6, 6, 0, 0]}>
                                    {comparisonStats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}
        </div>
    );
};

export default ComparativeAnalysisScreen;
