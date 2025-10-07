import React, { useState, useEffect } from 'react';
import { X, Filter, Tag, Calendar, TrendingUp, Activity } from 'lucide-react';
import { HACKER_COLORS } from '../../styles/theme';

const AdvancedFilters = ({ offers, onFilterChange, onClose }) => {
    const [selectedTags, setSelectedTags] = useState([]);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [adCountRange, setAdCountRange] = useState({ min: '', max: '' });
    const [performanceFilter, setPerformanceFilter] = useState('all');
    const [sortBy, setSortBy] = useState('newest');

    const allTags = Array.from(
        new Set(
            offers
                .flatMap(offer => offer.tags || [])
                .filter(Boolean)
        )
    ).sort();

    useEffect(() => {
        applyFilters();
    }, [selectedTags, dateRange, adCountRange, performanceFilter, sortBy]);

    const applyFilters = () => {
        let filtered = [...offers];

        if (selectedTags.length > 0) {
            filtered = filtered.filter(offer =>
                selectedTags.some(tag => (offer.tags || []).includes(tag))
            );
        }

        if (dateRange.start) {
            filtered = filtered.filter(offer =>
                new Date(offer.created_at) >= new Date(dateRange.start)
            );
        }

        if (dateRange.end) {
            filtered = filtered.filter(offer =>
                new Date(offer.created_at) <= new Date(dateRange.end)
            );
        }

        if (adCountRange.min !== '') {
            filtered = filtered.filter(offer =>
                (offer.last_ad_count || 0) >= parseInt(adCountRange.min)
            );
        }

        if (adCountRange.max !== '') {
            filtered = filtered.filter(offer =>
                (offer.last_ad_count || 0) <= parseInt(adCountRange.max)
            );
        }

        if (performanceFilter !== 'all') {
            filtered = filtered.filter(offer => {
                const count = offer.last_ad_count || 0;
                switch (performanceFilter) {
                    case 'high':
                        return count >= 50;
                    case 'medium':
                        return count >= 10 && count < 50;
                    case 'low':
                        return count > 0 && count < 10;
                    case 'zero':
                        return count === 0;
                    default:
                        return true;
                }
            });
        }

        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'newest':
                    return new Date(b.created_at) - new Date(a.created_at);
                case 'oldest':
                    return new Date(a.created_at) - new Date(b.created_at);
                case 'most_ads':
                    return (b.last_ad_count || 0) - (a.last_ad_count || 0);
                case 'least_ads':
                    return (a.last_ad_count || 0) - (b.last_ad_count || 0);
                case 'alphabetical':
                    return a.name.localeCompare(b.name);
                default:
                    return 0;
            }
        });

        onFilterChange(filtered);
    };

    const resetFilters = () => {
        setSelectedTags([]);
        setDateRange({ start: '', end: '' });
        setAdCountRange({ min: '', max: '' });
        setPerformanceFilter('all');
        setSortBy('newest');
        onFilterChange(offers);
    };

    const toggleTag = (tag) => {
        setSelectedTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border-2 border-blue-500 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-6 flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                        <Filter size={24} className="text-blue-400" />
                        <h2 className="text-2xl font-bold text-white">FILTROS AVANÇADOS</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Tag size={18} className="text-blue-400" />
                            <label className="text-white font-semibold">Filtrar por Tags</label>
                        </div>
                        {allTags.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {allTags.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => toggleTag(tag)}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                            selectedTags.includes(tag)
                                                ? 'bg-blue-600 text-white border-2 border-blue-400'
                                                : 'bg-gray-800 text-gray-400 border border-gray-600 hover:bg-gray-700'
                                        }`}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">Nenhuma tag disponível</p>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Calendar size={18} className="text-green-400" />
                            <label className="text-white font-semibold">Data de Criação</label>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">De</label>
                                <input
                                    type="date"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                    className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg py-2 px-3 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Até</label>
                                <input
                                    type="date"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                    className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg py-2 px-3 text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Activity size={18} className="text-purple-400" />
                            <label className="text-white font-semibold">Contagem de Anúncios</label>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Mínimo</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={adCountRange.min}
                                    onChange={(e) => setAdCountRange(prev => ({ ...prev, min: e.target.value }))}
                                    placeholder="0"
                                    className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg py-2 px-3 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Máximo</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={adCountRange.max}
                                    onChange={(e) => setAdCountRange(prev => ({ ...prev, max: e.target.value }))}
                                    placeholder="∞"
                                    className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg py-2 px-3 text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingUp size={18} className="text-yellow-400" />
                            <label className="text-white font-semibold">Performance</label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { value: 'all', label: 'Todos' },
                                { value: 'high', label: 'Alta (≥50)' },
                                { value: 'medium', label: 'Média (10-49)' },
                                { value: 'low', label: 'Baixa (1-9)' },
                                { value: 'zero', label: 'Sem Dados (0)' }
                            ].map(option => (
                                <button
                                    key={option.value}
                                    onClick={() => setPerformanceFilter(option.value)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                        performanceFilter === option.value
                                            ? 'bg-yellow-600 text-white'
                                            : 'bg-gray-800 text-gray-400 border border-gray-600 hover:bg-gray-700'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Filter size={18} className="text-cyan-400" />
                            <label className="text-white font-semibold">Ordenar Por</label>
                        </div>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg py-2 px-3 text-sm"
                        >
                            <option value="newest">Mais Recentes</option>
                            <option value="oldest">Mais Antigos</option>
                            <option value="most_ads">Mais Anúncios</option>
                            <option value="least_ads">Menos Anúncios</option>
                            <option value="alphabetical">Ordem Alfabética</option>
                        </select>
                    </div>
                </div>

                <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 p-6 flex gap-3">
                    <button
                        onClick={resetFilters}
                        className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
                    >
                        RESETAR
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                        APLICAR
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdvancedFilters;
