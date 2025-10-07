import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, CreditCard as Edit3, ToggleLeft, ToggleRight, AlertTriangle, TrendingUp, TrendingDown, Target, Clock } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';

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
                return <TrendingUp size={20} className="text-green-400" />;
            case 'ad_count_decrease':
                return <TrendingDown size={20} className="text-red-400" />;
            case 'threshold_reached':
                return <Target size={20} className="text-yellow-400" />;
            case 'inactivity':
                return <Clock size={20} className="text-purple-400" />;
            case 'consistency_drop':
                return <AlertTriangle size={20} className="text-orange-400" />;
            default:
                return <Bell size={20} className="text-gray-400" />;
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
            <div className={`${HACKER_COLORS.background} ${HACKER_COLORS.primary} min-h-screen flex items-center justify-center font-mono text-2xl animate-pulse`}>
                CARREGANDO ALERTAS...
            </div>
        );
    }

    return (
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-6">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Bell size={32} className="text-blue-400" />
                    <h2 className="text-3xl font-bold text-white">GERENCIAR ALERTAS</h2>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                    <Plus size={20} />
                    NOVO ALERTA
                </button>
            </div>

            {alerts.length === 0 ? (
                <div className="text-center py-20">
                    <Bell size={64} className="mx-auto text-gray-600 mb-4" />
                    <p className="text-gray-400 text-lg mb-2">Nenhum alerta configurado</p>
                    <p className="text-gray-500 text-sm">Crie alertas para ser notificado sobre mudanças importantes</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {alerts.map(alert => (
                        <div
                            key={alert.id}
                            className={`bg-gray-900/80 border rounded-xl p-6 ${
                                alert.is_active ? 'border-blue-500/30' : 'border-gray-700 opacity-60'
                            }`}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    {getAlertTypeIcon(alert.alert_type)}
                                    <span className="text-white font-semibold">
                                        {getAlertTypeName(alert.alert_type)}
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleToggleActive(alert)}
                                    className="text-gray-400 hover:text-blue-400 transition-colors"
                                >
                                    {alert.is_active ? (
                                        <ToggleRight size={24} className="text-blue-400" />
                                    ) : (
                                        <ToggleLeft size={24} />
                                    )}
                                </button>
                            </div>

                            <div className="space-y-2 mb-4">
                                <div className="text-sm">
                                    <span className="text-gray-400">Target: </span>
                                    <span className="text-white font-medium">{getOfferName(alert.offer_id)}</span>
                                </div>

                                {alert.threshold_value && (
                                    <div className="text-sm">
                                        <span className="text-gray-400">Limite: </span>
                                        <span className="text-white font-medium">{alert.threshold_value}</span>
                                    </div>
                                )}

                                {alert.percentage_change && (
                                    <div className="text-sm">
                                        <span className="text-gray-400">Variação: </span>
                                        <span className="text-white font-medium">{alert.percentage_change}%</span>
                                    </div>
                                )}

                                {alert.last_triggered && (
                                    <div className="text-sm">
                                        <span className="text-gray-400">Último disparo: </span>
                                        <span className="text-yellow-400 font-medium">
                                            {new Date(alert.last_triggered).toLocaleString('pt-BR')}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEdit(alert)}
                                    className="flex-1 bg-gray-800 text-yellow-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Edit3 size={16} />
                                    Editar
                                </button>
                                <button
                                    onClick={() => handleDelete(alert.id)}
                                    className="flex-1 bg-gray-800 text-red-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={16} />
                                    Excluir
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border-2 border-blue-500 rounded-xl max-w-lg w-full">
                        <div className="border-b border-gray-700 p-6">
                            <h3 className="text-2xl font-bold text-white">
                                {editingAlert ? 'EDITAR ALERTA' : 'NOVO ALERTA'}
                            </h3>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Tipo de Alerta
                                </label>
                                <select
                                    value={formData.alert_type}
                                    onChange={(e) => setFormData(prev => ({ ...prev, alert_type: e.target.value }))}
                                    className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg py-2 px-3"
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
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Target
                                </label>
                                <select
                                    value={formData.offer_id}
                                    onChange={(e) => setFormData(prev => ({ ...prev, offer_id: e.target.value }))}
                                    className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg py-2 px-3"
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
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Valor do Limite
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.threshold_value}
                                        onChange={(e) => setFormData(prev => ({ ...prev, threshold_value: e.target.value }))}
                                        className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg py-2 px-3"
                                        placeholder="Ex: 100"
                                    />
                                </div>
                            )}

                            {(formData.alert_type === 'ad_count_increase' || formData.alert_type === 'ad_count_decrease') && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Variação Percentual (%)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={formData.percentage_change}
                                        onChange={(e) => setFormData(prev => ({ ...prev, percentage_change: e.target.value }))}
                                        className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg py-2 px-3"
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
                                    className="w-5 h-5 text-blue-600 bg-gray-800 border-gray-600 rounded"
                                />
                                <label htmlFor="is_active" className="text-sm font-medium text-gray-300">
                                    Alerta ativo
                                </label>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
                                >
                                    CANCELAR
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                                >
                                    {editingAlert ? 'ATUALIZAR' : 'CRIAR'}
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
