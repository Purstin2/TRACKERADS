import React, { useState, useEffect, useMemo } from 'react';
import { X, Bookmark, Check, AlertTriangle, Loader2, ExternalLink, CheckSquare, Square, Copy } from 'lucide-react';
import { authHeaders } from '@/lib/supabase';
import { chaveOferta, indiceDeOfertas } from '../../utils/offerKey';

const ImportBookmarksModal = ({ onClose, onImport, userId, supabaseClient, showToast }) => {
    const [bookmarks, setBookmarks] = useState([]);
    const [existentes, setExistentes] = useState(null); // Map chave -> oferta ja cadastrada
    const [selectedUrls, setSelectedUrls] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [browser, setBrowser] = useState('');
    const [importing, setImporting] = useState(false);
    const [imported, setImported] = useState(new Set());

    useEffect(() => {
        let vivo = true;

        // ofertas ja cadastradas (inclusive arquivadas — continuam existindo)
        const carregaExistentes = supabaseClient
            ? supabaseClient.from('offers').select('id,name,link,is_archived')
                .then(({ data }) => { if (vivo) setExistentes(indiceDeOfertas(data || [])); })
                .catch(() => { if (vivo) setExistentes(new Map()); })
            : Promise.resolve().then(() => { if (vivo) setExistentes(new Map()); });

        const carregaBookmarks = authHeaders()
            .then(h => fetch('http://localhost:3001/api/bookmarks/ofertas', { headers: h }))
            .then(r => r.json())
            .then(data => {
                if (!vivo) return;
                if (!data.success) setError(data.error);
                else { setBookmarks(data.bookmarks); setBrowser(data.browser); }
            })
            .catch(() => { if (vivo) setError('Serviço local não está rodando. Inicie o scraper-service (localhost:3001).'); });

        Promise.all([carregaExistentes, carregaBookmarks]).finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [supabaseClient]);

    /* Classifica cada favorito ANTES de deixar importar:
     *  - jaCadastrado: a mesma oferta já está no tracker. A comparação é pelo
     *    LINK normalizado, nunca pelo nome — todo favorito da Biblioteca de
     *    Anúncios chega chamado "Biblioteca de Anúncios", então nome não
     *    distingue nada (ver utils/offerKey.js).
     *  - repetido: o mesmo alvo aparece duas vezes na própria pasta. */
    const analise = useMemo(() => {
        if (!existentes) return [];
        const vistos = new Set();
        return bookmarks.map((b) => {
            const chave = chaveOferta(b.url);
            const jaCadastrado = chave ? existentes.get(chave) : null;
            const repetido = !!chave && vistos.has(chave);
            if (chave) vistos.add(chave);
            return { ...b, chave, jaCadastrado: jaCadastrado || null, repetido, novo: !jaCadastrado && !repetido };
        });
    }, [bookmarks, existentes]);

    const novos = useMemo(() => analise.filter(a => a.novo), [analise]);
    const jaExistiam = analise.length - novos.length;

    // pré-seleciona só o que é novo — duplicata nunca vem marcada
    useEffect(() => {
        if (!existentes) return;
        setSelectedUrls(new Set(novos.map(a => a.url)));
    }, [existentes, novos]);

    const toggle = (item) => {
        if (!item.novo) return; // duplicata não é selecionável
        setSelectedUrls(prev => {
            const next = new Set(prev);
            if (next.has(item.url)) next.delete(item.url); else next.add(item.url);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedUrls.size === novos.length) setSelectedUrls(new Set());
        else setSelectedUrls(new Set(novos.map(a => a.url)));
    };

    const handleImport = async () => {
        const toImport = analise.filter(a => a.novo && selectedUrls.has(a.url));
        if (toImport.length === 0) return;
        setImporting(true);

        let successCount = 0;
        const newImported = new Set(imported);
        const vistosAgora = new Set();

        for (const bookmark of toImport) {
            // segunda barreira: a análise já filtra, mas se a lista mudar entre
            // o render e o clique, isto impede duas linhas iguais na mesma leva
            if (bookmark.chave && vistosAgora.has(bookmark.chave)) continue;
            if (bookmark.chave) vistosAgora.add(bookmark.chave);

            const { error } = await supabaseClient.from('offers').insert([{
                name: bookmark.name,
                link: bookmark.url,
                user_id: userId,
                created_at: new Date().toISOString(),
                is_archived: false,
            }]);
            if (!error) { successCount++; newImported.add(bookmark.url); }
        }

        setImported(newImported);
        setImporting(false);
        const aviso = jaExistiam > 0 ? ` · ${jaExistiam} ignorada(s) por já existir` : '';
        showToast && showToast(`${successCount} oferta(s) importada(s)${aviso}`, 'success');
        if (onImport) onImport();
        onClose();
    };

    const temLista = !loading && !error && analise.length > 0;

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

                    {!loading && !error && analise.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Bookmark size={28} className="text-slate-600" />
                            <p className="text-slate-500 text-sm">Nenhum bookmark encontrado na pasta "ofertas"</p>
                        </div>
                    )}

                    {temLista && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs text-slate-500">
                                    {analise.length} favorito(s) · <span className="text-emerald-400 font-medium">{novos.length} novo(s)</span>
                                    {jaExistiam > 0 && <> · <span className="text-slate-400">{jaExistiam} já no tracker</span></>}
                                </span>
                                {novos.length > 0 && (
                                    <button
                                        onClick={toggleAll}
                                        className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center gap-1.5"
                                    >
                                        {selectedUrls.size === novos.length
                                            ? <><Square size={12} /> Desmarcar tudo</>
                                            : <><CheckSquare size={12} /> Selecionar todos os novos</>
                                        }
                                    </button>
                                )}
                            </div>

                            {novos.length === 0 && (
                                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
                                    <Check size={15} className="mt-0.5 flex-shrink-0 text-emerald-400" />
                                    <p className="text-xs leading-relaxed text-slate-300">
                                        Nada novo pra importar — todos os favoritos desta pasta já estão no tracker.
                                    </p>
                                </div>
                            )}

                            {analise.map((item, i) => {
                                const isSelected = selectedUrls.has(item.url);
                                const alreadyImported = imported.has(item.url);
                                const bloqueado = !item.novo;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => toggle(item)}
                                        disabled={bloqueado || alreadyImported}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                                            bloqueado
                                                ? 'border-white/[0.04] bg-white/[0.01] opacity-50 cursor-not-allowed'
                                                : alreadyImported
                                                    ? 'border-emerald-500/20 bg-emerald-500/5 opacity-60 cursor-default'
                                                    : isSelected
                                                        ? 'border-blue-500/30 bg-blue-500/8'
                                                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                                        }`}
                                    >
                                        <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                                            bloqueado
                                                ? 'border-white/10 bg-transparent'
                                                : (isSelected || alreadyImported)
                                                    ? 'bg-blue-500 border-blue-500'
                                                    : 'border-white/20'
                                        }`}>
                                            {!bloqueado && (isSelected || alreadyImported) && <Check size={11} className="text-white" strokeWidth={3} />}
                                            {bloqueado && <Copy size={10} className="text-slate-500" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm text-slate-200 truncate font-medium">{item.name}</p>
                                                {item.jaCadastrado && (
                                                    <span className="flex-shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                                                        já no tracker{item.jaCadastrado.is_archived ? ' (arquivada)' : ''}
                                                    </span>
                                                )}
                                                {!item.jaCadastrado && item.repetido && (
                                                    <span className="flex-shrink-0 rounded-md bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                                                        repetido na pasta
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-600 truncate mt-0.5">
                                                {item.jaCadastrado ? `= ${item.jaCadastrado.name}` : item.url}
                                            </p>
                                        </div>
                                        <a
                                            href={item.url}
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
                {temLista && (
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
