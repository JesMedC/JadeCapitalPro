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
        <div className="space-y-10 pb-10">
            {/* Page Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 pb-8 border-b border-white/5">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
                        <span className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <BookOpen className="text-emerald-500" size={24} />
                        </span>
                        Neural Knowledge Base
                    </h1>
                    <p className="text-white/40 font-bold tracking-[0.2em] text-[10px] uppercase ml-14">
                        Data Ingestion • Strategy Training Repository
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <label className="group relative cursor-pointer h-12 flex items-center gap-3 px-8 bg-emerald-500 text-black rounded-2xl font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        {uploading ? 'Processing...' : 'Upload Training PDF'}
                        <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={uploading} />
                    </label>
                </div>
            </div>

            {/* Interface Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-3 relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="Search repository or meta-tags (Elliott, Fibonacci, Waves...)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#0B0E11] border border-white/5 rounded-2xl h-16 pl-16 pr-6 focus:border-emerald-500/30 focus:shadow-[0_0_20px_rgba(16,185,129,0.05)] outline-none transition-all text-white font-medium"
                    />
                </div>

                <div className="bg-[#0B0E11] border border-white/5 p-2 rounded-2xl flex items-center justify-between shadow-2xl">
                    <div className="flex-1 text-center">
                        <p className="text-xl font-black text-white italic">{documents.length}</p>
                        <p className="text-[8px] text-white/30 font-black uppercase tracking-widest">Assets</p>
                    </div>
                    <div className="w-[1px] h-8 bg-white/5" />
                    <div className="flex-1 text-center font-bold">
                        <p className="text-xl font-black text-emerald-500 italic">{documents.reduce((acc, doc) => acc + (doc.keywords?.length || 0), 0)}</p>
                        <p className="text-[8px] text-white/30 font-black uppercase tracking-widest">Patterns</p>
                    </div>
                </div>
            </div>

            {/* Library Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {loading ? (
                    [1, 2, 3].map(i => (
                        <div key={i} className="bg-[#0B0E11] border border-white/5 h-[280px] rounded-[32px] animate-pulse" />
                    ))
                ) : filteredDocs.length === 0 ? (
                    <div className="col-span-full py-32 text-center space-y-6">
                        <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-3xl mx-auto flex items-center justify-center text-white/10">
                            <FileSearch size={40} />
                        </div>
                        <p className="text-white/20 font-black uppercase tracking-[.3em] text-xs">Repository Empty • Awaiting Neural Data</p>
                    </div>
                ) : (
                    filteredDocs.map((doc, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ y: -8 }}
                            className="bg-[#0B0E11] border border-white/5 p-8 rounded-[32px] group hover:border-emerald-500/20 transition-all duration-300 shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[60px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="flex justify-between items-start mb-8">
                                <div className="p-4 bg-white/[0.03] text-emerald-500 rounded-2xl border border-white/5 transition-all group-hover:bg-emerald-500/10 group-hover:scale-110">
                                    <FileText size={24} />
                                </div>
                                <button className="p-2 text-white/20 hover:text-rose-500 transition-colors">
                                    <Trash2 size={18} />
                                </button>
                            </div>

                            <h3 className="font-black text-lg truncate mb-1 text-white group-hover:text-emerald-500 transition-colors" title={doc.filename}>{doc.filename}</h3>
                            <p className="text-[10px] text-white/20 font-black uppercase tracking-widest">{doc.pages} Pages • Indexed by Jade Oracle</p>

                            <div className="mt-8 flex flex-wrap gap-2 min-h-[60px]">
                                {doc.keywords?.map((kw: string, j: number) => (
                                    <span key={j} className="text-[8px] font-black uppercase tracking-widest bg-emerald-500/5 text-emerald-500/60 px-2 py-1.5 rounded-lg border border-emerald-500/10">
                                        {kw}
                                    </span>
                                ))}
                            </div>

                            <div className="mt-8 flex items-center gap-4">
                                <button
                                    onClick={() => setOpenDoc(doc)}
                                    className="flex-1 h-12 rounded-2xl bg-white/[0.03] border border-white/5 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                                >
                                    Examine <ExternalLink size={14} className="text-emerald-500" />
                                </button>

                                <label className="flex items-center gap-3 px-4 h-12 rounded-2xl border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/5 transition-all">
                                    <input
                                        type="checkbox"
                                        checked={doc.enabled !== false}
                                        onChange={(e) => setEnabled(doc.filename, e.target.checked)}
                                        className="w-4 h-4 rounded border-white/10 bg-black text-emerald-500 focus:ring-emerald-500/20"
                                    />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Train</span>
                                </label>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Document Viewer Modal */}
            {openDoc ? (
                <div className="fixed inset-0 z-[110] p-4 flex items-center justify-center">
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-black/90 backdrop-blur-xl"
                        onClick={() => setOpenDoc(null)}
                    />
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="relative z-10 w-full max-w-6xl bg-[#0B0E11] border border-white/10 rounded-[32px] overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.5)]"
                    >
                        <div className="p-6 border-b border-white/5 flex items-center justify-between gap-6 bg-[#0E1216]">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                                    <FileText size={20} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30">System Asset</p>
                                    <h2 className="text-sm font-black truncate text-white">{openDoc.filename}</h2>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={openDoc.enabled !== false}
                                        onChange={(e) => {
                                            const enabled = e.target.checked;
                                            setOpenDoc((d: any) => ({ ...d, enabled }));
                                            setEnabled(openDoc.filename, enabled);
                                        }}
                                        className="w-4 h-4 rounded border-white/10 bg-black text-emerald-500 focus:ring-emerald-500/20"
                                    />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Active Training</span>
                                </label>
                                <button
                                    onClick={() => setOpenDoc(null)}
                                    className="p-3 hover:bg-white/5 rounded-2xl text-white/50 hover:text-white transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="h-[80vh] bg-black">
                            <iframe
                                title={openDoc.filename}
                                className="w-full h-full opacity-90"
                                src={`http://${typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'}:8080/media/knowledge/${encodeURIComponent(openDoc.filename)}`}
                            />
                        </div>
                    </motion.div>
                </div>
            ) : null}

            {/* Neural Sync Status */}
            <div className="bg-[#0B0E11] border border-emerald-500/10 rounded-[32px] p-8 relative overflow-hidden group shadow-2xl">
                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 blur-[80px] pointer-events-none" />
                <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                    <div className="flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
                        <div className="relative">
                            <div className="w-20 h-20 bg-emerald-500/5 rounded-3xl flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                                <BookOpen size={32} />
                            </div>
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-ping" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white italic uppercase tracking-tight">Intelligence Integration Pulse</h3>
                            <p className="text-white/30 text-xs mt-1 max-w-xl font-bold uppercase tracking-widest leading-relaxed">
                                JADE Oracle is continuously distilling these vectors into real-time pattern recognized Elliott Wave strategy parameters.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 text-emerald-500 font-black bg-emerald-500/10 px-8 py-4 rounded-2xl border border-emerald-500/20 uppercase text-[11px] tracking-[.2em] shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                        <CheckCircle2 size={18} />
                        Network Synchronized
                    </div>
                </div>
            </div>
        </div>
    );
}

const X = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);
