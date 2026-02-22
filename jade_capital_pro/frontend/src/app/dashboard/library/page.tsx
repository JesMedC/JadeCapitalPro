"use client";

import React, { useState, useEffect } from 'react';
import {
    FileText,
    Upload,
    Search,
    Plus,
    Trash2,
    ExternalLink,
    FileSearch,
    BookOpen,
    Loader2,
    CheckCircle2
} from 'lucide-react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useToastStore } from '@/lib/toastStore';

export default function LibraryPage() {
    const pushToast = useToastStore((s) => s.push);
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [openDoc, setOpenDoc] = useState<any | null>(null);

    const fetchDocuments = async () => {
        try {
            const response = await api.get('/knowledge/list');
            setDocuments(response.data);
        } catch (err) {
            pushToast({
                type: 'error',
                title: 'Libreria',
                message: getApiErrorMessage(err, 'No se pudo cargar la libreria.'),
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            pushToast({ type: 'error', title: 'PDF', message: 'Solo se admiten archivos PDF.' });
            e.target.value = '';
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            await api.post('/knowledge/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            pushToast({ type: 'success', title: 'PDF', message: 'Documento subido e indexado.' });
            fetchDocuments();
        } catch (err) {
            pushToast({
                type: 'error',
                title: 'PDF',
                message: getApiErrorMessage(err, 'No se pudo subir el PDF.'),
            });
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const filteredDocs = documents.filter(doc =>
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.keywords?.some((kw: string) => kw.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const setEnabled = async (filename: string, enabled: boolean) => {
        try {
            await api.patch('/knowledge/enable', { filename, enabled });
            setDocuments((prev) => prev.map((d) => (d.filename === filename ? { ...d, enabled } : d)));
            pushToast({ type: 'success', title: 'Aprendizaje', message: enabled ? 'Incluido al aprendizaje.' : 'Excluido del aprendizaje.' });
        } catch (err) {
            pushToast({ type: 'error', title: 'Aprendizaje', message: getApiErrorMessage(err, 'No se pudo actualizar el documento.') });
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight">Base de Conocimiento</h1>
                    <p className="text-zinc-500 mt-1">Sube manuales y PDFs para alimentar la inteligencia de JADE BOT.</p>
                </div>

                <div className="flex gap-4">
                    <label className="cursor-pointer bg-teal-500 text-black px-6 py-3 rounded-2xl font-bold text-sm hover:bg-teal-400 transition-colors flex items-center gap-2">
                        {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                        {uploading ? 'SUBIENDO...' : 'SUBIR PDF'}
                        <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={uploading} />
                    </label>
                </div>
            </div>

            {/* Search & Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar en la librería o por palabras clave (Elliott, Fibonacci...)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-zinc-950 border border-white/5 rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-teal-500/50 outline-none transition-all"
                    />
                </div>
                <div className="bg-zinc-950 border border-white/5 p-4 rounded-2xl flex items-center justify-center gap-4">
                    <div className="text-center">
                        <p className="text-2xl font-black text-white">{documents.length}</p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Documentos</p>
                    </div>
                    <div className="w-px h-10 bg-white/5" />
                    <div className="text-center">
                        <p className="text-2xl font-black text-teal-500">{documents.reduce((acc, doc) => acc + (doc.keywords?.length || 0), 0)}</p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Conceptos IA</p>
                    </div>
                </div>
            </div>

            {/* Library Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    [1, 2, 3].map(i => (
                        <div key={i} className="bg-zinc-950/50 border border-white/5 h-48 rounded-3xl animate-pulse" />
                    ))
                ) : filteredDocs.length === 0 ? (
                    <div className="col-span-full py-20 text-center space-y-4">
                        <FileSearch size={48} className="mx-auto text-zinc-800" />
                        <p className="text-zinc-500 font-medium">No se encontraron documentos en tu librería.</p>
                    </div>
                ) : (
                    filteredDocs.map((doc, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-zinc-950 border border-white/5 p-6 rounded-3xl group hover:border-teal-500/30 transition-all"
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div className="p-3 bg-teal-500/10 text-teal-400 rounded-2xl">
                                    <FileText size={24} />
                                </div>
                                <button className="text-zinc-600 hover:text-red-500 transition-colors">
                                    <Trash2 size={18} />
                                </button>
                            </div>

                            <h3 className="font-bold text-lg truncate mb-1" title={doc.filename}>{doc.filename}</h3>
                            <p className="text-xs text-zinc-500 font-medium">{doc.pages} páginas • Indexado por IA</p>

                            <div className="mt-6 flex flex-wrap gap-2">
                                {doc.keywords?.map((kw: string, j: number) => (
                                    <span key={j} className="text-[9px] font-black uppercase tracking-tighter bg-white/5 text-teal-400/80 px-2 py-1 rounded-md border border-white/5">
                                        {kw}
                                    </span>
                                ))}
                            </div>

                            <div className="mt-6 flex items-center justify-between gap-3">
                                <button
                                    onClick={() => setOpenDoc(doc)}
                                    className="flex-1 py-3 rounded-xl bg-zinc-900 text-zinc-400 text-xs font-bold hover:bg-zinc-800 hover:text-white transition-all flex items-center justify-center gap-2"
                                >
                                    Ver PDF
                                    <ExternalLink size={14} />
                                </button>

                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                    <input
                                        type="checkbox"
                                        checked={doc.enabled !== false}
                                        onChange={(e) => setEnabled(doc.filename, e.target.checked)}
                                    />
                                    Aprender
                                </label>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* PDF Viewer */}
            {openDoc ? (
                <div className="fixed inset-0 z-[110] p-4 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setOpenDoc(null)} />
                    <div className="relative z-10 w-full max-w-5xl bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden">
                        <div className="p-4 border-b border-white/10 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <div className="text-xs font-black uppercase tracking-widest text-zinc-500">Documento</div>
                                <div className="text-sm font-bold truncate">{openDoc.filename}</div>
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                    <input
                                        type="checkbox"
                                        checked={openDoc.enabled !== false}
                                        onChange={(e) => {
                                            const enabled = e.target.checked;
                                            setOpenDoc((d: any) => ({ ...d, enabled }));
                                            setEnabled(openDoc.filename, enabled);
                                        }}
                                    />
                                    Incluir al aprendizaje
                                </label>
                                <button onClick={() => setOpenDoc(null)} className="text-zinc-500 hover:text-white font-black">Cerrar</button>
                            </div>
                        </div>
                        <div className="h-[80vh] bg-black">
                            <iframe
                                title={openDoc.filename}
                                className="w-full h-full"
                                src={`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:8080/media/knowledge/${encodeURIComponent(openDoc.filename)}`}
                            />
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Integration Banner */}
            <div className="bg-gradient-to-r from-teal-500/10 to-transparent border border-teal-500/20 rounded-3xl p-8 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-teal-500/20 rounded-2xl flex items-center justify-center text-teal-400 border border-teal-500/30">
                        <BookOpen size={32} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold">Inteligencia Documental</h3>
                        <p className="text-zinc-400 text-sm mt-1 max-w-md">
                            Tu JADE BOT está utilizando estos documentos para mejorar el análisis de patrones Elliott en tiempo real.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-emerald-500 font-bold bg-emerald-500/10 px-4 py-2 rounded-full">
                    <CheckCircle2 size={18} />
                    Sincronizado
                </div>
            </div>
        </div>
    );
}
