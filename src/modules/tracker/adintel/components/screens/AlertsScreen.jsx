import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, Pencil, ToggleLeft, ToggleRight, AlertTriangle, TrendingUp, TrendingDown, Target, Clock, X } from 'lucide-react';

const AlertsScreen = ({ userId, supabaseClient, offers, showToast }) => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingAlert, setEditingAlert] = useState(null);

    const [formData, setFormData] = useState({
        offer_id: '',
        alert_type: 'ad_count_increase',
        threshold_value: '',
        percentage_change: '',
        is_active: true
    });

    useEffect(() => {
        fetchAlerts();
    }, [userId, supabaseClient]);

    const fetchAlerts = async () => {
        if (!userId || !supabaseClient) return;

        setLoading(true);
        const { data, error } = await supabaseClient
            .from('alerts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            showToast('Erro ao carregar alertas: ' + error.message, 'error');
        } else {
            setAlerts(data || []);
        }
        setLoading(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.offer_id && formData.alert_type !== 'inactivity') {
            showToast('Selecione um target', 'error');
            return;
        }

        const payload = {
            user_id: userId,
            offer_id: formData.offer_id || null,
            alert_type: formData.alert_type,
            threshold_value: formData.threshold_value ? parseInt(formData.threshold_value) : null,
            percentage_change: formData.percentage_change ? parseInt(formData.percentage_change) : null,
            is_active: formData.is_active
        };

        if (editingAlert) {
            const { error } = await supabaseClient
                .from('alerts')
                .update(payload)
                .eq('id', editingAlert.id)
                .eq('user_id', userId);

            if (error) {
                showToast('Erro ao atualizar alerta: ' + error.message, 'error');
            } else {
                showToast('Alerta atualizado!', 'success');
                resetForm();
                fetchAlerts();
            }
        } else {
            const { error } = await supabaseClient
                .from('alerts')
                .insert([payload]);

            if (error) {
                showToast('Erro ao criar alerta: ' + error.message, 'error');
            } else {
                showToast('Alerta criado!', 'success');
                resetForm();
                fetchAlerts();
            }
        }
    };

    const handleDelete = async (alertId) => {
        const { error } = await supabaseClient
            .from('alerts')
            .delete()
            .eq('id', alertId)
            .eq('user_id', userId);

        if (error) {
            showToast('Erro ao excluir alerta: ' + error.message, 'error');
        } else {
            showToast('Alerta excluído!', 'success');
            fetchAlerts();
        }
    };

    const handleToggleActive = async (alert) => {
        const { error } = await supabaseClient
            .from('alerts')
            .update({ is_active: !alert.is_active })
            .eq('id', alert.id)
            .eq('user_id', userId);

        if (error) {
            showToast('Erro ao atualizar alerta: ' + error.message, 'error');
        } else {
            showToast(`Alerta ${!alert.is_active ? 'ativado' : 'desativado'}!`, 'success');
            fetchAlerts();
        }
    };

    const handleEdit = (alert) => {
        setEditingAlert(alert);
        setFormData({
            offer_id: alert.offer_id || '',
            alert_type: alert.alert_type,
            threshold_value: alert.threshold_value || '',
            percentage_change: alert.percentage_change || '',
            is_active: alert.is_active
        });
        setShowAddModal(true);
    };

    const resetForm = () => {
        setFormData({
            offer_id: '',
            alert_type: 'ad_count_increase',
            threshold_value: '',
            percentage_change: '',
            is_active: true
        });
        setEditingAlert(null);
        setShowAddModal(false);
    };

    const getAlertTypeIcon = (type) => {
        switch (type) {
            case 'ad_count_increase':
                return <TrendingUp size={16} className="text-emerald-400" />;
            case 'ad_count_decrease':
                return <TrendingDown size={16} className="text-red-400" />;
            case 'threshold_reached':
                return <Target size={16} className="text-amber-400" />;
            case 'inactivity':
                return <Clock size={16} className="text-violet-400" />;
            case 'consistency_drop':
                return <AlertTriangle size={16} className="text-orange-400" />;
            default:
                return <Bell size={16} className="text-slate-400" />;
        }
    };

    const getAlertTypeBadgeClass = (type) => {
        switch (type) {
            case 'ad_count_increase': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'ad_count_decrease': return 'bg-red-500/10 text-red-400 border-red-500/20';
            case 'threshold_reached': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            case 'inactivity': return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
            case 'consistency_drop': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
            default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
        }
    };

    const getAlertTypeName = (type) => {
        const names = {
            'ad_count_increase': 'Aumento de Anúncios',
            'ad_count_decrease': 'Diminuição de Anúncios',
            'threshold_reached': 'Limite Atingido',
            'inactivity': 'Inatividade',
            'consistency_drop': 'Queda de Consistência'
        };
        return names[type] || type;
    };

    const getOfferName = (offerId) => {
        if (!offerId) return 'Global';
        const offer = offers.find(o => o.id === offerId);
        return offer ? offer.name : 'Target removido';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-slate-500 text-sm">Carregando alertas...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight">Alertas</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Gerencie notificações automáticas para seus targets</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                    <Plus size={16} />
                    Novo Alerta
                </button>
            </div>

            {alerts.length === 0 ? (
                <div className="bg-[#0D1220]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                        <Bell size={24} className="text-blue-400" />
                    </div>
                    <p className="text-slate-300 font-medium mb-1">Nenhum alerta configurado</p>
                    <p className="text-slate-500 text-sm">Crie alertas para ser notificado sobre mudanças importantes</p>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="mt-6 inline-flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 px-4 py-2 rounded-xl text-sm font-medium transition-colors border border-blue-500/20"
                    >
                        <Plus size={15} /> Criar primeiro alerta
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {alerts.map(alert => (
                        <div
                            key={alert.id}
                            className={`bg-[#0D1220]/80 backdrop-blur-xl border rounded-2xl p-5 transition-all ${
                                alert.is_active
                                    ? 'border-white/[0.08] hover:border-white/[0.14]'
                                    : 'border-white/[0.04] opacity-50'
                            }`}
                        >
                            {/* Card header */}
                            <div className="flex items-start justify-between mb-4">
                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                                    getAlertTypeBadgeClass(alert.alert_type)
                                }`}>
                                    {getAlertTypeIcon(alert.alert_type)}
                                    {getAlertTypeName(alert.alert_type)}
                                </div>
                                <button
                                    onClick={() => handleToggleActive(alert)}
                                    className="text-slate-500 hover:text-blue-400 transition-colors"
                                    title={alert.is_active ? 'Desativar' : 'Ativar'}
                                >
                                    {alert.is_active ? (
                                        <ToggleRight size={22} className="text-blue-400" />
                                    ) : (
                                        <ToggleLeft size={22} />
                                    )}
                                </button>
                            </div>

                            {/* Details */}
                            <div className="space-y-2 mb-5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Target</span>
                                    <span className="text-slate-200 font-medium truncate ml-2 text-right">{getOfferName(alert.offer_id)}</span>
                                </div>

                                {alert.threshold_value && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Limite</span>
                                        <span className="text-slate-200 font-medium tabular-nums">{alert.threshold_value}</span>
                                    </div>
                                )}

                                {alert.percentage_change && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Variação</span>
                                        <span className="text-slate-200 font-medium tabular-nums">{alert.percentage_change}%</span>
                                    </div>
                                )}

                                {alert.last_triggered && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Último disparo</span>
                                        <span className="text-amber-400 font-medium text-xs tabular-nums">
                                            {new Date(alert.last_triggered).toLocaleString('pt-BR')}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-4 border-t border-white/[0.05]">
                                <button
                                    onClick={() => handleEdit(alert)}
                                    className="flex-1 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Pencil size={13} />
                                    Editar
                                </button>
                                <button
                                    onClick={() => handleDelete(alert.id)}
                                    className="flex-1 bg-red-500/[0.08] hover:bg-red-500/[0.15] text-red-400 px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Trash2 size={13} />
                                    Excluir
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add / Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#0D1220] border border-white/[0.1] rounded-2xl max-w-lg w-full shadow-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-white/[0.07]">
                            <h3 className="text-lg font-semibold text-white">
                                {editingAlert ? 'Editar Alerta' : 'Novo Alerta'}
                            </h3>
                            <button onClick={resetForm} className="text-slate-500 hover:text-slate-300 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                                    Tipo de Alerta
                                </label>
                                <select
                                    value={formData.alert_type}
                                    onChange={(e) => setFormData(prev => ({ ...prev, alert_type: e.target.value }))}
                                    className="w-full bg-[#131929] border border-white/[0.08] text-white rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-blue-500/50"
                                    required
                                >
                                    <option value="ad_count_increase">Aumento de Anúncios</option>
                                    <option value="ad_count_decrease">Diminuição de Anúncios</option>
                                    <option value="threshold_reached">Limite Atingido</option>
                                    <option value="inactivity">Inatividade</option>
                                    <option value="consistency_drop">Queda de Consistência</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                                    Target
                                </label>
                                <select
                                    value={formData.offer_id}
                                    onChange={(e) => setFormData(prev => ({ ...prev, offer_id: e.target.value }))}
                                    className="w-full bg-[#131929] border border-white/[0.08] text-white rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-blue-500/50"
                                >
                                    <option value="">Selecione um target</option>
                                    {offers.filter(o => !o.is_archived).map(offer => (
                                        <option key={offer.id} value={offer.id}>
                                            {offer.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {formData.alert_type === 'threshold_reached' && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                                        Valor do Limite
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.threshold_value}
                                        onChange={(e) => setFormData(prev => ({ ...prev, threshold_value: e.target.value }))}
                                        className="w-full bg-[#131929] border border-white/[0.08] text-white rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-blue-500/50"
                                        placeholder="Ex: 100"
                                    />
                                </div>
                            )}

                            {(formData.alert_type === 'ad_count_increase' || formData.alert_type === 'ad_count_decrease') && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                                        Variação Percentual (%)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={formData.percentage_change}
                                        onChange={(e) => setFormData(prev => ({ ...prev, percentage_change: e.target.value }))}
                                        className="w-full bg-[#131929] border border-white/[0.08] text-white rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-blue-500/50"
                                        placeholder="Ex: 20"
                                    />
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                                    className="w-4 h-4 rounded border-white/20 bg-[#131929] text-blue-600 focus:ring-blue-500/50"
                                />
                                <label htmlFor="is_active" className="text-sm text-slate-300">
                                    Alerta ativo
                                </label>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="flex-1 bg-white/[0.05] hover:bg-white/[0.08] text-slate-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                                >
                                    {editingAlert ? 'Atualizar' : 'Criar Alerta'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AlertsScreen;
