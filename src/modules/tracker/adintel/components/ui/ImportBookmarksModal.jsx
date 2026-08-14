import React, { useState, useEffect } from 'react';
import { X, Bookmark, Check, AlertTriangle, Loader2, ExternalLink, CheckSquare, Square } from 'lucide-react';
import { authHeaders } from '@/lib/supabase';

const ImportBookmarksModal = ({ onClose, onImport, userId, supabaseClient, showToast }) => {
    const [bookmarks, setBookmarks] = useState([]);
    const [selectedUrls, setSelectedUrls] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [browser, setBrowser] = useState('');
    const [importing, setImporting] = useState(false);
    const [imported, setImported] = useState(new Set());

    useEffect(() => {
        authHeaders().then(h => fetch('http://localhost:3001/api/bookmarks/ofertas', { headers: h }))
            .then(r => r.json())
            .then(data => {
                if (!data.success) {
                    setError(data.error);
                } else {
                    setBookmarks(data.bookmarks);
                    setBrowser(data.browser);
                    setSelectedUrls(new Set(data.bookmarks.map(b => b.url)));
                }
            })
            .catch(() => setError('Serviço local não está rodando. Inicie o scraper-service (localhost:3001).'))
            .finally(() => setLoading(false));
    }, []);

    const toggle = (url) => {
        setSelectedUrls(prev => {
            const next = new Set(prev);
            if (next.has(url)) next.delete(url);
            else next.add(url);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedUrls.size === bookmarks.length) {
            setSelectedUrls(new Set());
        } else {
            setSelectedUrls(new Set(bookmarks.map(b => b.url)));
        }
    };

    const handleImport = async () => {
        if (selectedUrls.size === 0) return;
        setImporting(true);

        const toImport = bookmarks.filter(b => selectedUrls.has(b.url));
        let successCount = 0;
        const newImported = new Set(imported);

        for (const bookmark of toImport) {
            const { error } = await supabaseClient.from('offers').insert([{
                name: bookmark.name,
                link: bookmark.url,
                user_id: userId,
                created_at: new Date().toISOString(),
                is_archived: false,
            }]);
            if (!error) {
                successCount++;
                newImported.add(bookmark.url);
            }
        }

        setImported(newImported);
        setImporting(false);
        showToast && showToast(`${successCount} oferta(s) importada(s) com sucesso!`, 'success');
        if (onImport) onImport();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0D1220] border border-white/[0.1] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/[0.07]">
                    <div className="flex items-center gap-3">
                        <Bookmark size={18} className="text-amber-400" />
                        <div>
                            <h2 className="text-base font-semibold text-white">Importar Favoritos</h2>
                            <p className="text-xs text-slate-500 mt-0.5">Pasta "ofertas" {browser ? `· ${browser}` : ''}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 size={28} className="text-blue-400 animate-spin" />
                            <p className="text-slate-500 text-sm">Lendo bookmarks...</p>
                        </div>
                    )}

                    {!loading && error && (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <AlertTriangle size={28} className="text-rose-400" />
                            <p className="text-slate-400 text-sm text-center max-w-sm">{error}</p>
                        </div>
                    )}

                    {!loading && !error && bookmarks.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Bookmark size={28} className="text-slate-600" />
                            <p className="text-slate-500 text-sm">Nenhum bookmark encontrado na pasta "ofertas"</p>
                        </div>
                    )}

                    {!loading && !error && bookmarks.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs text-slate-500">{bookmarks.length} bookmark(s) encontrado(s)</span>
                                <button
                                    onClick={toggleAll}
                                    className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center gap-1.5"
                                >
                                    {selectedUrls.size === bookmarks.length
                                        ? <><Square size={12} /> Desmarcar tudo</>
                                        : <><CheckSquare size={12} /> Selecionar tudo</>
                                    }
                                </button>
                            </div>

                            {bookmarks.map((bookmark, i) => {
                                const isSelected = selectedUrls.has(bookmark.url);
                                const alreadyImported = imported.has(bookmark.url);
                                return (
                                    <button
                                        key={i}
                                        onClick={() => toggle(bookmark.url)}
                                        disabled={alreadyImported}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                                            alreadyImported
                                                ? 'border-emerald-500/20 bg-emerald-500/5 opacity-60 cursor-default'
                                                : isSelected
                                                    ? 'border-blue-500/30 bg-blue-500/8'
                                                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                                        }`}
                                    >
                                        <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                                            alreadyImported
                                                ? 'bg-emerald-500 border-emerald-500'
                                                : isSelected
                                                    ? 'bg-blue-500 border-blue-500'
                                                    : 'border-white/20'
                                        }`}>
                                            {(isSelected || alreadyImported) && <Check size={11} className="text-white" strokeWidth={3} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-slate-200 truncate font-medium">{bookmark.name}</p>
                                            <p className="text-xs text-slate-600 truncate mt-0.5">{bookmark.url}</p>
                                        </div>
                                        <a
                                            href={bookmark.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            className="text-slate-700 hover:text-sky-400 transition-colors flex-shrink-0"
                                        >
                                            <ExternalLink size={13} />
                                        </a>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!loading && !error && bookmarks.length > 0 && (
                    <div className="p-6 border-t border-white/[0.07] flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 bg-white/[0.05] hover:bg-white/[0.08] text-slate-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={selectedUrls.size === 0 || importing}
                            className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                        >
                            {importing ? <Loader2 size={15} className="animate-spin" /> : <Bookmark size={15} />}
                            {importing ? 'Importando...' : `Importar (${selectedUrls.size})`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImportBookmarksModal;
