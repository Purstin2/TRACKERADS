import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, X, Plus, CheckSquare, Square } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';

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
            <div className={`${HACKER_COLORS.background} ${HACKER_COLORS.primary} min-h-screen flex items-center justify-center font-mono text-2xl animate-pulse`}>
                CARREGANDO COMPARAÇÃO...
            </div>
        );
    }

    return (
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-6">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <TrendingUp size={32} className="text-blue-400" />
                    <h2 className="text-3xl font-bold text-white">ANÁLISE COMPARATIVA</h2>
                </div>
                <div className="flex gap-2">
                    {[7, 14, 30, 60].map(days => (
                        <button
                            key={days}
                            onClick={() => setTimeRange(days)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                timeRange === days
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                        >
                            {days}d
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">
                        Targets Selecionados ({selectedOffers.length}/8)
                    </h3>
                    <button
                        onClick={() => setShowSelector(!showSelector)}
                        className="bg-gray-800 text-blue-400 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                    >
                        {showSelector ? 'Ocultar Seleção' : 'Mostrar Seleção'}
                    </button>
                </div>

                {showSelector && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {activeOffers.map(offer => {
                            const isSelected = selectedOffers.includes(offer.id);
                            return (
                                <button
                                    key={offer.id}
                                    onClick={() => toggleOfferSelection(offer.id)}
                                    className={`flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                                        isSelected
                                            ? 'bg-blue-600 text-white border-2 border-blue-400'
                                            : 'bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700'
                                    }`}
                                >
                                    {isSelected ? (
                                        <CheckSquare size={20} className="flex-shrink-0" />
                                    ) : (
                                        <Square size={20} className="flex-shrink-0" />
                                    )}
                                    <span className="truncate text-sm font-medium">{offer.name}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {selectedOffers.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {selectedOffers.map(offerId => {
                            const offer = offers.find(o => o.id === offerId);
                            return (
                                <div
                                    key={offerId}
                                    className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1 rounded-lg text-sm"
                                >
                                    <span>{offer?.name || 'Unknown'}</span>
                                    <button
                                        onClick={() => toggleOfferSelection(offerId)}
                                        className="hover:bg-blue-700 rounded-full p-0.5"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {selectedOffers.length === 0 ? (
                <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-12 text-center">
                    <Plus size={64} className="mx-auto text-gray-600 mb-4" />
                    <p className="text-gray-400 text-lg mb-2">Nenhum target selecionado</p>
                    <p className="text-gray-500 text-sm">Selecione até 8 targets para comparar suas métricas</p>
                </div>
            ) : (
                <>
                    <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-6 mb-6">
                        <h3 className="text-xl font-bold text-white mb-4">Evolução Comparativa</h3>
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={400}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis dataKey="date" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                                    <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                                        labelStyle={{ color: '#f3f4f6' }}
                                    />
                                    <Legend />
                                    {selectedOffers.map((offerId, index) => {
                                        const offer = offers.find(o => o.id === offerId);
                                        return (
                                            <Line
                                                key={offerId}
                                                type="monotone"
                                                dataKey={offer?.name || `Target ${index + 1}`}
                                                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                                                strokeWidth={2}
                                            />
                                        );
                                    })}
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[400px] flex items-center justify-center text-gray-500">
                                Sem dados para exibir no período selecionado
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-6 mb-6">
                        <h3 className="text-xl font-bold text-white mb-4">Estatísticas Comparativas</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="text-left py-3 px-4 text-gray-400 font-semibold">Target</th>
                                        <th className="text-right py-3 px-4 text-gray-400 font-semibold">Atual</th>
                                        <th className="text-right py-3 px-4 text-gray-400 font-semibold">Máximo</th>
                                        <th className="text-right py-3 px-4 text-gray-400 font-semibold">Mínimo</th>
                                        <th className="text-right py-3 px-4 text-gray-400 font-semibold">Média</th>
                                        <th className="text-right py-3 px-4 text-gray-400 font-semibold">Tendência</th>
                                        <th className="text-right py-3 px-4 text-gray-400 font-semibold">Registros</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comparisonStats.map((stat, index) => (
                                        <tr key={stat.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                                    />
                                                    <span className="text-white font-medium">{stat.name}</span>
                                                </div>
                                            </td>
                                            <td className="text-right py-3 px-4 text-white font-bold">{stat.current}</td>
                                            <td className="text-right py-3 px-4 text-green-400">{stat.max}</td>
                                            <td className="text-right py-3 px-4 text-blue-400">{stat.min}</td>
                                            <td className="text-right py-3 px-4 text-purple-400">{stat.avg}</td>
                                            <td className={`text-right py-3 px-4 font-semibold ${
                                                stat.trend > 0 ? 'text-green-400' : stat.trend < 0 ? 'text-red-400' : 'text-gray-400'
                                            }`}>
                                                {stat.trend > 0 ? '+' : ''}{stat.trend}%
                                            </td>
                                            <td className="text-right py-3 px-4 text-gray-400">{stat.dataPoints}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-6">
                        <h3 className="text-xl font-bold text-white mb-4">Comparação por Média</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={comparisonStats}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="name" stroke="#9ca3af" style={{ fontSize: '11px' }} angle={-45} textAnchor="end" height={100} />
                                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                                />
                                <Bar dataKey="avg" fill="#8b5cf6" name="Média" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}
        </div>
    );
};

export default ComparativeAnalysisScreen;
