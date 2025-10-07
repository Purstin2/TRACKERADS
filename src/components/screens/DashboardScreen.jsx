import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Activity, Target, AlertTriangle, Zap, Calendar, Database } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';

const DashboardScreen = ({ offers, userId, supabaseClient }) => {
    const [adCountsData, setAdCountsData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState(7);

    useEffect(() => {
        const fetchAdCountsData = async () => {
            if (!userId || !supabaseClient) return;

            setLoading(true);
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - timeRange);

            const { data, error } = await supabaseClient
                .from('ad_counts')
                .select('*')
                .eq('user_id', userId)
                .gte('timestamp', daysAgo.toISOString())
                .order('timestamp', { ascending: true });

            if (!error && data) {
                setAdCountsData(data);
            }
            setLoading(false);
        };

        fetchAdCountsData();
    }, [userId, supabaseClient, timeRange]);

    const stats = useMemo(() => {
        const activeOffers = offers.filter(o => !o.is_archived);
        const archivedOffers = offers.filter(o => o.is_archived);

        const totalAdCount = activeOffers.reduce((sum, offer) => sum + (offer.last_ad_count || 0), 0);
        const avgAdCount = activeOffers.length > 0 ? Math.round(totalAdCount / activeOffers.length) : 0;

        const offersWithData = activeOffers.filter(o => o.last_ad_count > 0);
        const topPerformers = [...activeOffers]
            .sort((a, b) => (b.last_ad_count || 0) - (a.last_ad_count || 0))
            .slice(0, 5);

        const adCountsByDay = {};
        adCountsData.forEach(ac => {
            const day = new Date(ac.timestamp).toISOString().split('T')[0];
            if (!adCountsByDay[day]) {
                adCountsByDay[day] = { date: day, total: 0, count: 0 };
            }
            adCountsByDay[day].total += ac.count;
            adCountsByDay[day].count += 1;
        });

        const chartData = Object.values(adCountsByDay)
            .map(d => ({
                date: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                total: d.total,
                avg: Math.round(d.total / d.count)
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const statusDistribution = activeOffers.reduce((acc, offer) => {
            const count = offer.last_ad_count || 0;
            let status;
            if (count === 0) status = 'Sem Dados';
            else if (count < 10) status = 'Baixo';
            else if (count < 50) status = 'Médio';
            else if (count < 100) status = 'Alto';
            else status = 'Muito Alto';

            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});

        const pieData = Object.entries(statusDistribution).map(([name, value]) => ({
            name,
            value
        }));

        const growthData = activeOffers.map(offer => {
            const offerCounts = adCountsData
                .filter(ac => ac.offer_id === offer.id)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            if (offerCounts.length < 2) return { name: offer.name, growth: 0 };

            const firstCount = offerCounts[0].count;
            const lastCount = offerCounts[offerCounts.length - 1].count;
            const growth = firstCount > 0 ? ((lastCount - firstCount) / firstCount) * 100 : 0;

            return { name: offer.name, growth: Math.round(growth) };
        })
        .filter(d => d.growth !== 0)
        .sort((a, b) => Math.abs(b.growth) - Math.abs(a.growth))
        .slice(0, 10);

        return {
            totalOffers: offers.length,
            activeOffers: activeOffers.length,
            archivedOffers: archivedOffers.length,
            totalAdCount,
            avgAdCount,
            offersWithData: offersWithData.length,
            topPerformers,
            chartData,
            pieData,
            growthData
        };
    }, [offers, adCountsData]);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    if (loading) {
        return (
            <div className={`${HACKER_COLORS.background} ${HACKER_COLORS.primary} min-h-screen flex items-center justify-center font-mono text-2xl animate-pulse`}>
                CARREGANDO DASHBOARD...
            </div>
        );
    }

    return (
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-6">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Database size={32} className="text-blue-400" />
                    <h2 className="text-3xl font-bold text-white">DASHBOARD</h2>
                </div>
                <div className="flex gap-2">
                    {[7, 14, 30].map(days => (
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-gray-900/80 border border-blue-500/30 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <Target size={24} className="text-blue-400" />
                        <span className="text-3xl font-bold text-white">{stats.totalOffers}</span>
                    </div>
                    <p className="text-sm text-gray-400">Total de Targets</p>
                    <p className="text-xs text-blue-400 mt-1">{stats.activeOffers} ativos</p>
                </div>

                <div className="bg-gray-900/80 border border-green-500/30 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <Activity size={24} className="text-green-400" />
                        <span className="text-3xl font-bold text-white">{stats.totalAdCount}</span>
                    </div>
                    <p className="text-sm text-gray-400">Total de Anúncios</p>
                    <p className="text-xs text-green-400 mt-1">Média: {stats.avgAdCount}/target</p>
                </div>

                <div className="bg-gray-900/80 border border-purple-500/30 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <Zap size={24} className="text-purple-400" />
                        <span className="text-3xl font-bold text-white">{stats.offersWithData}</span>
                    </div>
                    <p className="text-sm text-gray-400">Targets com Dados</p>
                    <p className="text-xs text-purple-400 mt-1">
                        {stats.activeOffers > 0 ? Math.round((stats.offersWithData / stats.activeOffers) * 100) : 0}% do total
                    </p>
                </div>

                <div className="bg-gray-900/80 border border-yellow-500/30 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <Calendar size={24} className="text-yellow-400" />
                        <span className="text-3xl font-bold text-white">{timeRange}</span>
                    </div>
                    <p className="text-sm text-gray-400">Dias Analisados</p>
                    <p className="text-xs text-yellow-400 mt-1">{adCountsData.length} registros</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <TrendingUp size={20} className="text-blue-400" />
                        Evolução de Anúncios ({timeRange} dias)
                    </h3>
                    {stats.chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={stats.chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="date" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                                    labelStyle={{ color: '#f3f4f6' }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} name="Total" />
                                <Line type="monotone" dataKey="avg" stroke="#10b981" strokeWidth={2} name="Média" />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[300px] flex items-center justify-center text-gray-500">
                            Sem dados para exibir
                        </div>
                    )}
                </div>

                <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Activity size={20} className="text-green-400" />
                        Distribuição por Performance
                    </h3>
                    {stats.pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={stats.pieData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {stats.pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[300px] flex items-center justify-center text-gray-500">
                            Sem dados para exibir
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <TrendingUp size={20} className="text-yellow-400" />
                        Top 5 Performers
                    </h3>
                    <div className="space-y-3">
                        {stats.topPerformers.map((offer, idx) => (
                            <div key={offer.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                                <div className="flex items-center gap-3">
                                    <span className={`text-lg font-bold ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-600' : 'text-gray-500'}`}>
                                        #{idx + 1}
                                    </span>
                                    <span className="text-white font-medium truncate max-w-[200px]">{offer.name}</span>
                                </div>
                                <span className="text-blue-400 font-bold">{offer.last_ad_count || 0}</span>
                            </div>
                        ))}
                        {stats.topPerformers.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                Nenhum target com dados
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <TrendingUp size={20} className="text-purple-400" />
                        Crescimento ({timeRange} dias)
                    </h3>
                    {stats.growthData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={stats.growthData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis type="number" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                                <YAxis type="category" dataKey="name" stroke="#9ca3af" style={{ fontSize: '11px' }} width={100} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                                    formatter={(value) => `${value}%`}
                                />
                                <Bar dataKey="growth" fill="#8b5cf6" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[300px] flex items-center justify-center text-gray-500">
                            Sem dados suficientes para análise
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardScreen;
