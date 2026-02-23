"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Loader2, Plus, Trash2, Pencil, X, Image as ImageIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useToastStore } from '@/lib/toastStore';

type Step = {
    title: string;
    description: string;
    image?: string | null;
};

type Strategy = {
    id: number;
    name: string;
    description: string;
    rules: string;
    is_active: boolean;
    created_at: string;
};

const parseSteps = (rules: string): Step[] => {
    try {
        const obj = JSON.parse(rules);
        const steps = Array.isArray(obj?.steps) ? obj.steps : [];
        return steps
            .filter((s: any) => s && typeof s.title === 'string')
            .map((s: any) => ({ title: s.title, description: s.description || '', image: s.image || null }))
            .slice(0, 10);
    } catch {
        return [];
    }
};

export default function StrategyPage() {
    const pushToast = useToastStore((s) => s.push);
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [showView, setShowView] = useState(false);
    const [viewing, setViewing] = useState<Strategy | null>(null);
    const [mode, setMode] = useState<'create' | 'edit'>('create');
    const [editing, setEditing] = useState<Strategy | null>(null);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isActive, setIsActive] = useState(true);

    const [steps, setSteps] = useState<Step[]>([{ title: '', description: '', image: null }]);
    const [activeStep, setActiveStep] = useState(0);

    const canSave = useMemo(() => {
        if (!name.trim()) return false;
        if (steps.length < 1 || steps.length > 10) return false;
        return steps.every((s) => s.title.trim() && s.description.trim());
    }, [name, steps]);

    const fetchStrategies = async () => {
        setLoading(true);
        try {
            const res = await api.get('/trading/strategies');
            setStrategies(res.data || []);
        } catch (err) {
            pushToast({ type: 'error', title: 'Estrategias', message: getApiErrorMessage(err, 'No se pudieron cargar las estrategias.') });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStrategies();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openCreate = () => {
        setMode('create');
        setEditing(null);
        setName('');
        setDescription('');
        setIsActive(true);
        setSteps([{ title: '', description: '', image: null }]);
        setActiveStep(0);
        setShowModal(true);
    };

    const openEdit = (s: Strategy) => {
        setMode('edit');
        setEditing(s);
        setName(s.name);
        setDescription(s.description || '');
        setIsActive(!!s.is_active);
        const parsed = parseSteps(s.rules);
        setSteps(parsed.length ? parsed : [{ title: '', description: '', image: null }]);
        setActiveStep(0);
        setShowModal(true);
    };

    const openView = (s: Strategy) => {
        setViewing(s);
        setShowView(true);
    };

    const removeStrategy = async (id: number) => {
        if (!confirm('Eliminar esta estrategia?')) return;
        try {
            await api.delete(`/trading/strategies/${id}`);
            pushToast({ type: 'success', title: 'Estrategia', message: 'Estrategia eliminada.' });
            fetchStrategies();
        } catch (err) {
            pushToast({ type: 'error', title: 'Estrategia', message: getApiErrorMessage(err, 'No se pudo eliminar.') });
        }
    };

    const uploadStepImage = async (file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post('/trading/strategies/step-image', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data?.filename as string;
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave) return;

        setSaving(true);
        try {
            if (mode === 'create') {
                await api.post('/trading/strategies/json', {
                    name: name.trim(),
                    description: description.trim(),
                    is_active: isActive,
                    steps,
                });
                pushToast({ type: 'success', title: 'Estrategia', message: 'Estrategia creada.' });
            } else {
                if (!editing) return;
                await api.patch(`/trading/strategies/${editing.id}`, {
                    name: name.trim(),
                    description: description.trim(),
                    is_active: isActive,
                    steps,
                });
                pushToast({ type: 'success', title: 'Estrategia', message: 'Estrategia actualizada.' });
            }
            setShowModal(false);
            fetchStrategies();
        } catch (err) {
            pushToast({ type: 'error', title: 'Estrategia', message: getApiErrorMessage(err, 'No se pudo guardar.') });
        } finally {
            setSaving(false);
        }
    };

    const baseMedia = typeof window !== 'undefined' ? `http://${window.location.hostname}:8080/media/strategy/` : 'http://127.0.0.1:8080/media/strategy/';

    return (
        <div className="space-y-10 pb-10">
            {/* Terminal Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 pb-8 border-b border-white/5">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
                        <span className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <BrainCircuit className="text-emerald-500" size={24} />
                        </span>
                        Neural Strategy Matrix
                    </h1>
                    <p className="text-white/40 font-bold tracking-[0.2em] text-[10px] uppercase ml-14">
                        Logical Framework • Step-by-Step Execution Protocols
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="h-12 flex items-center gap-3 px-8 bg-emerald-500 text-black rounded-2xl font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                >
                    <Plus size={16} />
                    Deploy New Protocol
                </button>
            </div>

            {loading ? (
                <div className="h-[50vh] flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin text-emerald-500 w-10 h-10" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Reconstructing Strategy Nodes...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {strategies.map((s) => {
                        const stepsCount = parseSteps(s.rules).length;
                        return (
                            <motion.div
                                key={s.id}
                                whileHover={{ y: -8 }}
                                className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 group hover:border-emerald-500/20 transition-all duration-300 shadow-2xl relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[60px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

                                <div className="flex justify-between items-start mb-8">
                                    <div className="p-4 bg-white/[0.03] text-emerald-500 rounded-2xl border border-white/5 transition-all group-hover:bg-emerald-500/10 group-hover:scale-110">
                                        <BrainCircuit size={24} />
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => openEdit(s)} className="p-2 text-white/20 hover:text-white transition-colors" aria-label="Editar">
                                            <Pencil size={18} />
                                        </button>
                                        <button onClick={() => removeStrategy(s.id)} className="p-2 text-white/20 hover:text-rose-500 transition-colors" aria-label="Eliminar">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>

                                <h3 className="text-xl font-black text-white uppercase tracking-tight italic group-hover:text-emerald-500 transition-colors mb-2">{s.name}</h3>
                                <p className="text-[11px] text-white/30 font-bold uppercase tracking-widest leading-relaxed mb-8 line-clamp-3">{s.description}</p>

                                <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Complexity</span>
                                        <span className="text-xs font-black text-white uppercase tracking-widest">{stepsCount} Logical Steps</span>
                                    </div>
                                    <button
                                        onClick={() => openView(s)}
                                        className="h-10 px-6 rounded-xl bg-white/[0.03] border border-white/5 text-[9px] font-black uppercase tracking-widest text-white hover:bg-emerald-500 hover:text-black hover:border-emerald-500 transition-all"
                                    >
                                        Examine
                                    </button>
                                </div>

                                <div className="absolute bottom-4 left-8">
                                    <div className={`flex items-center gap-2 px-2 py-1 rounded-full border ${s.is_active ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500' : 'bg-white/5 border-white/10 text-white/20'}`}>
                                        <div className={`w-1 h-1 rounded-full ${s.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
                                        <span className="text-[8px] font-black uppercase tracking-widest">{s.is_active ? 'Online' : 'Standby'}</span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            <AnimatePresence>
                {showModal ? (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowModal(false)}
                            className="absolute inset-0 bg-black/90 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}
                            className="bg-[#0B0E11] border border-white/10 rounded-[40px] w-full max-w-5xl shadow-[0_0_80px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden"
                        >
                            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-[#0E1216]">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
                                        <Plus size={24} />
                                    </div>
                                    <h2 className="text-xl font-black text-white uppercase italic tracking-tight">{mode === 'create' ? 'Initialize New Strategy Node' : 'Update Protocol Logic'}</h2>
                                </div>
                                <button onClick={() => setShowModal(false)} className="p-3 hover:bg-white/5 rounded-2xl text-white/30 hover:text-white transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-12 gap-0">
                                <div className="lg:col-span-5 p-10 border-r border-white/5 space-y-8 bg-[#0B0E11]">
                                    <div>
                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-[.2em] block mb-3">Protocol Identity</label>
                                        <input
                                            value={name} onChange={(e) => setName(e.target.value)} required
                                            placeholder="E.g. NEURAL_FIBONACCI_V1"
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl h-16 px-6 text-white font-black uppercase tracking-widest focus:border-emerald-500/30 transition-all outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-[.2em] block mb-3">Logical Intent</label>
                                        <textarea
                                            value={description} onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Define the primary objective of this protocol..."
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl p-6 text-white font-bold text-sm outline-none h-32 resize-none focus:border-emerald-500/30 transition-all"
                                        />
                                    </div>

                                    <div className="p-6 bg-white/[0.02] border border-white/5 rounded-[24px]">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="text-[9px] font-black uppercase tracking-[.2em] text-white/20">Step Sequence</div>
                                            <div className="text-[10px] font-black text-emerald-500">{steps.length} / 10</div>
                                        </div>
                                        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                                            {steps.map((s, idx) => (
                                                <button
                                                    type="button" key={idx}
                                                    onClick={() => setActiveStep(idx)}
                                                    className={`w-full h-14 px-5 rounded-xl border flex items-center justify-between transition-all ${idx === activeStep ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-black/20 border-white/5 text-white/40'}`}
                                                >
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Paso {idx + 1}: {s.title || 'Untitled'}</span>
                                                    {s.image && <ImageIcon size={14} />}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="mt-6 flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (steps.length >= 10) return;
                                                    setSteps((prev) => [...prev, { title: '', description: '', image: null }]);
                                                    setActiveStep(steps.length);
                                                }}
                                                className="flex-1 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white transition-all shadow-xl"
                                            >
                                                + New Step
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (steps.length <= 1) return;
                                                    setSteps((prev) => prev.filter((_, i) => i !== activeStep));
                                                    setActiveStep((i) => Math.max(0, i - 1));
                                                }}
                                                className="h-12 w-12 flex items-center justify-center bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 hover:bg-rose-500/20 transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="lg:col-span-7 p-10 space-y-8 bg-[#0E1216]">
                                    <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden group">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex items-center gap-3">
                                                <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 border border-emerald-500/20">
                                                    <Pencil size={18} />
                                                </div>
                                                <h3 className="text-sm font-black text-white uppercase tracking-widest">Editing Fragment {activeStep + 1}</h3>
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => setActiveStep((i) => Math.max(0, i - 1))} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white disabled:opacity-20 transition-all" disabled={activeStep === 0}>←</button>
                                                <button type="button" onClick={() => setActiveStep((i) => Math.min(steps.length - 1, i + 1))} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white disabled:opacity-20 transition-all" disabled={activeStep === steps.length - 1}>→</button>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <div>
                                                <label className="text-[9px] font-black text-white/20 uppercase tracking-[.2em] block mb-3">Fragment Title</label>
                                                <input
                                                    value={steps[activeStep]?.title || ''}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setSteps((prev) => prev.map((s, i) => (i === activeStep ? { ...s, title: v } : s)));
                                                    }}
                                                    className="w-full bg-black/40 border border-white/5 rounded-2xl h-14 px-6 text-white font-black uppercase tracking-widest outline-none focus:border-emerald-500/30 transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-black text-white/20 uppercase tracking-[.2em] block mb-3">Execution Details</label>
                                                <textarea
                                                    value={steps[activeStep]?.description || ''}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setSteps((prev) => prev.map((s, i) => (i === activeStep ? { ...s, description: v } : s)));
                                                    }}
                                                    className="w-full bg-black/40 border border-white/5 rounded-2xl p-6 text-white font-medium text-sm outline-none h-48 resize-none focus:border-emerald-500/30 transition-all"
                                                />
                                            </div>

                                            <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                                                <div className="text-[9px] font-black uppercase tracking-[.2em] text-white/20 mb-4">Neural Vision Attachment</div>
                                                <div className="flex items-center justify-between">
                                                    <input
                                                        type="file" accept="image/*"
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            try {
                                                                setSaving(true);
                                                                const filename = await uploadStepImage(file);
                                                                setSteps((prev) => prev.map((s, i) => (i === activeStep ? { ...s, image: filename } : s)));
                                                                pushToast({ type: 'success', title: 'Cyber-Sense', message: 'Vision fragment uploaded.' });
                                                            } catch (err) {
                                                                pushToast({ type: 'error', title: 'Cyber-Sense', message: 'Upload failed.' });
                                                            } finally {
                                                                setSaving(false);
                                                                e.target.value = '';
                                                            }
                                                        }}
                                                        className="text-[10px] text-white/30 font-black file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-white/5 file:text-white hover:file:bg-white/10 cursor-pointer"
                                                    />
                                                    {steps[activeStep]?.image && (
                                                        <a href={`${baseMedia}${steps[activeStep].image}`} target="_blank" rel="noreferrer" className="text-[10px] font-black uppercase text-emerald-500 underline underline-offset-4">View Vision</a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6 pt-4">
                                        <div className="flex-1 flex items-center justify-between px-6 py-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Broadcasting Status</span>
                                            <div className="flex items-center gap-4">
                                                <span className="text-[10px] font-black text-white uppercase">{isActive ? 'Active Node' : 'Suspended'}</span>
                                                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-5 h-5 rounded border-white/10 bg-black text-emerald-500 focus:ring-emerald-500/20 cursor-pointer" />
                                            </div>
                                        </div>
                                        <button
                                            disabled={saving || !canSave}
                                            className="h-16 px-12 bg-emerald-500 text-black font-black uppercase text-[11px] tracking-widest rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:scale-105 transition-all disabled:opacity-30 disabled:hover:scale-100 flex items-center gap-3"
                                        >
                                            {saving && <Loader2 className="animate-spin" size={16} />}
                                            Commit Protocol
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                ) : null}
            </AnimatePresence>

            <AnimatePresence>
                {showView && viewing ? (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowView(false)}
                            className="absolute inset-0 bg-black/90 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}
                            className="bg-[#0B0E11] border border-white/10 rounded-[40px] w-full max-w-3xl shadow-[0_0_80px_rgba(0,0,0,0.5)] relative z-10 overflow-hidden"
                        >
                            <div className="p-10 bg-[#0E1216] border-b border-white/5 relative">
                                <button onClick={() => setShowView(false)} className="absolute top-8 right-8 p-3 hover:bg-white/5 rounded-2xl text-white/30 hover:text-white transition-all">
                                    <X size={20} />
                                </button>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                                            <BrainCircuit size={20} />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-[.3em] text-white/30 italic">Strategy Document Visualization</span>
                                    </div>
                                    <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">{viewing.name}</h2>
                                    <div className="text-[11px] font-black uppercase text-white/40 tracking-widest leading-relaxed max-w-xl">{viewing.description}</div>
                                </div>
                            </div>

                            <div className="p-10 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar bg-[#0B0E11]">
                                {parseSteps(viewing.rules).map((st, idx) => (
                                    <div key={idx} className="bg-white/[0.02] border border-white/5 rounded-[32px] p-8 group hover:border-emerald-500/10 transition-all duration-300">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="text-[9px] font-black uppercase tracking-[.3em] text-emerald-500 border-b border-emerald-500/20 pb-1">Operational Stage {idx + 1}</div>
                                            {st.image && (
                                                <a href={`${baseMedia}${st.image}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[9px] font-black uppercase text-white/30 hover:text-emerald-500 transition-colors">
                                                    <ImageIcon size={14} /> Fragment Vision
                                                </a>
                                            )}
                                        </div>
                                        <div className="text-xl font-black text-white uppercase italic tracking-tight mb-3 group-hover:text-emerald-500 transition-colors">{st.title}</div>
                                        <div className="text-[12px] font-bold text-white/50 tracking-wide leading-relaxed whitespace-pre-wrap">{st.description}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-8 border-t border-white/5 flex justify-end bg-[#0B0E11]">
                                <button
                                    onClick={() => { setShowView(false); openEdit(viewing); }}
                                    className="h-12 px-8 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
                                >
                                    Refine Logic
                                </button>
                            </div>
                        </motion.div>
                    </div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
