import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Activity, Target, AlertTriangle, Zap, Calendar, Database, ArrowUpRight, ArrowDownRight } from 'lucide-react';

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

    const COLORS = ['#4F8EF7', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

    const chartTooltipStyle = {
        backgroundColor: '#0D1220',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        fontSize: '12px',
    };
    const chartAxisStyle = { fontSize: 11, fill: '#64748b' };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
                    <Database size={20} className="text-blue-400 animate-pulse" />
                </div>
                <p className="text-slate-500 text-sm font-medium tracking-wider">Carregando dashboard...</p>
            </div>
        );
    }

    const statCards = [
        {
            label: 'Targets Totais',
            value: stats.totalOffers,
            sub: `${stats.activeOffers} ativos`,
            icon: Target,
            color: 'text-blue-400',
            iconBg: 'bg-blue-500/10',
            accent: 'stat-blue',
        },
        {
            label: 'Anúncios Totais',
            value: stats.totalAdCount.toLocaleString(),
            sub: `Média ${stats.avgAdCount}/target`,
            icon: Activity,
            color: 'text-emerald-400',
            iconBg: 'bg-emerald-500/10',
            accent: 'stat-green',
        },
        {
            label: 'Com Dados',
            value: stats.offersWithData,
            sub: `${stats.activeOffers > 0 ? Math.round((stats.offersWithData / stats.activeOffers) * 100) : 0}% do total`,
            icon: Zap,
            color: 'text-violet-400',
            iconBg: 'bg-violet-500/10',
            accent: 'stat-violet',
        },
        {
            label: 'Período Analisado',
            value: `${timeRange}d`,
            sub: `${adCountsData.length} registros`,
            icon: Calendar,
            color: 'text-amber-400',
            iconBg: 'bg-amber-500/10',
            accent: 'stat-amber',
        },
    ];

    return (
        <div className="px-6 lg:px-8 max-w-7xl mx-auto py-7 animate-fade-in">

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Dashboard</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Visão geral do desempenho dos seus targets</p>
                </div>
                <div className="flex items-center gap-1 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl">
                    {[7, 14, 30].map(days => (
                        <button
                            key={days}
                            onClick={() => setTimeRange(days)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                timeRange === days
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-700/30'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            {days}d
                        </button>
                    ))}
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
                {statCards.map(({ label, value, sub, icon: Icon, color, iconBg, accent }) => (
                    <div key={label} className={`stat-card-top ${accent} bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-5 hover:border-white/[0.12] transition-all duration-300 group`}>
                        <div className="flex items-center justify-between mb-3">
                            <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
                                <Icon size={17} className={color} />
                            </div>
                        </div>
                        <div className="font-bold text-3xl text-white tracking-tight tabular-nums mb-1">{value}</div>
                        <div className="text-sm text-slate-500 font-medium">{label}</div>
                        <div className={`text-xs ${color} mt-1.5`}>{sub}</div>
                    </div>
                ))}
            </div>

            {/* Charts row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                {/* Area chart */}
                <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-sm font-semibold text-white">Evolução de Anúncios</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Últimos {timeRange} dias</p>
                        </div>
                        <TrendingUp size={16} className="text-blue-400" />
                    </div>
                    {stats.chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <AreaChart data={stats.chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#4F8EF7" stopOpacity={0.3}/>
                                        <stop offset="100%" stopColor="#4F8EF7" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="gradAvg" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.25}/>
                                        <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis dataKey="date" tick={chartAxisStyle} axisLine={false} tickLine={false} />
                                <YAxis tick={chartAxisStyle} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: '#94a3b8', marginBottom: 4 }} itemStyle={{ color: '#e2e8f0' }} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
                                <Legend wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }} />
                                <Area type="monotone" dataKey="total" stroke="#4F8EF7" strokeWidth={2} fill="url(#gradTotal)" name="Total" dot={false} activeDot={{ r: 4, fill: '#4F8EF7' }} />
                                <Area type="monotone" dataKey="avg" stroke="#10b981" strokeWidth={2} fill="url(#gradAvg)" name="Média" dot={false} activeDot={{ r: 4, fill: '#10b981' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[240px] flex flex-col items-center justify-center gap-2">
                            <Activity size={24} className="text-slate-700" />
                            <p className="text-sm text-slate-600">Sem dados para exibir</p>
                        </div>
                    )}
                </div>

                {/* Pie chart */}
                <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-sm font-semibold text-white">Distribuição por Performance</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Segmentação atual dos targets</p>
                        </div>
                        <Activity size={16} className="text-emerald-400" />
                    </div>
                    {stats.pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <PieChart>
                                <Pie
                                    data={stats.pieData}
                                    cx="50%" cy="50%"
                                    innerRadius={55}
                                    outerRadius={90}
                                    paddingAngle={3}
                                    dataKey="value"
                                >
                                    {stats.pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={chartTooltipStyle} itemStyle={{ color: '#e2e8f0' }} />
                                <Legend wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[240px] flex flex-col items-center justify-center gap-2">
                            <Activity size={24} className="text-slate-700" />
                            <p className="text-sm text-slate-600">Sem dados para exibir</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Charts row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Top 5 Performers */}
                <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-sm font-semibold text-white">Top Performers</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Targets com mais anúncios ativos</p>
                        </div>
                        <TrendingUp size={16} className="text-amber-400" />
                    </div>
                    <div className="space-y-2.5">
                        {stats.topPerformers.map((offer, idx) => {
                            const maxCount = stats.topPerformers[0]?.last_ad_count || 1;
                            const pct = Math.round(((offer.last_ad_count || 0) / maxCount) * 100);
                            const medalColors = ['text-yellow-400', 'text-slate-300', 'text-amber-600'];
                            return (
                                <div key={offer.id} className="flex items-center gap-3 group">
                                    <span className={`text-sm font-bold w-6 text-center flex-shrink-0 ${medalColors[idx] || 'text-slate-500'}`}>
                                        {idx + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm text-slate-300 truncate font-medium">{offer.name}</span>
                                            <span className="text-sm font-bold text-blue-400 tabular-nums ml-3 flex-shrink-0">{offer.last_ad_count || 0}</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                                            <div className="h-full rounded-full bg-blue-500/60 transition-all duration-700" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {stats.topPerformers.length === 0 && (
                            <div className="py-8 flex flex-col items-center gap-2">
                                <Target size={24} className="text-slate-700" />
                                <p className="text-sm text-slate-600">Nenhum target com dados</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Growth Bar Chart */}
                <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-sm font-semibold text-white">Crescimento</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Variação percentual em {timeRange} dias</p>
                        </div>
                        <Zap size={16} className="text-violet-400" />
                    </div>
                    {stats.growthData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={stats.growthData} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                                <XAxis type="number" tick={chartAxisStyle} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                                <YAxis type="category" dataKey="name" tick={chartAxisStyle} axisLine={false} tickLine={false} width={90} />
                                <Tooltip
                                    contentStyle={chartTooltipStyle}
                                    itemStyle={{ color: '#e2e8f0' }}
                                    formatter={(value) => [`${value}%`, 'Crescimento']}
                                />
                                <Bar dataKey="growth" radius={[0, 4, 4, 0]}>
                                    {stats.growthData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.growth >= 0 ? '#10b981' : '#f43f5e'}
                                            fillOpacity={0.8}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[240px] flex flex-col items-center justify-center gap-2">
                            <TrendingUp size={24} className="text-slate-700" />
                            <p className="text-sm text-slate-600">Sem dados suficientes</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardScreen;
