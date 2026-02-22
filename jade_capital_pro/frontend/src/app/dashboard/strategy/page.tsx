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
        <div className="space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight">Manual de Estrategias</h1>
                    <p className="text-zinc-500 mt-1">Crea estrategias paso a paso (1 a 10 pasos) con foto opcional.</p>
                </div>
                <button
                    onClick={openCreate}
                    className="bg-teal-500 text-black px-6 py-3 rounded-2xl font-black text-sm hover:bg-teal-400 transition-all flex items-center gap-2"
                >
                    <Plus size={18} />
                    Nueva
                </button>
            </div>

            {loading ? (
                <div className="h-[300px] flex items-center justify-center">
                    <Loader2 className="animate-spin text-teal-500 w-12 h-12" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {strategies.map((s) => {
                        const stepsCount = parseSteps(s.rules).length;
                        return (
                            <div key={s.id} className="bg-zinc-950 border border-white/5 rounded-3xl p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-3 bg-teal-500/10 text-teal-400 rounded-2xl">
                                        <BrainCircuit size={24} />
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => openView(s)} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-white hover:bg-white/10 transition-colors">
                                            Ver
                                        </button>
                                        <button onClick={() => openEdit(s)} className="p-2 text-zinc-500 hover:text-white transition-colors" aria-label="Editar">
                                            <Pencil size={18} />
                                        </button>
                                        <button onClick={() => removeStrategy(s.id)} className="p-2 text-zinc-500 hover:text-rose-400 transition-colors" aria-label="Eliminar">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                                <h3 className="text-xl font-bold mb-1 uppercase tracking-tight">{s.name}</h3>
                                <p className="text-sm text-zinc-500 mb-6 line-clamp-3">{s.description}</p>
                                <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-zinc-500">
                                    <span>{stepsCount} pasos</span>
                                    <span className={s.is_active ? 'text-emerald-400' : 'text-zinc-500'}>{s.is_active ? 'activa' : 'pausada'}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <AnimatePresence>
                {showModal ? (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowModal(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.98, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.98, opacity: 0 }}
                            className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-4xl p-8 relative z-10"
                        >
                            <button onClick={() => setShowModal(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white">
                                <X size={20} />
                            </button>

                            <h2 className="text-2xl font-black mb-6">{mode === 'create' ? 'Nueva estrategia' : 'Editar estrategia'}</h2>

                            <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                <div className="lg:col-span-5 space-y-4">
                                    <div>
                                        <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Nombre</label>
                                        <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Descripcion</label>
                                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none h-28 resize-none" />
                                    </div>
                                    <div className="flex items-center justify-between bg-black/40 border border-white/10 rounded-2xl p-4">
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-widest text-zinc-500">Estado</div>
                                            <div className="text-sm font-bold text-white">{isActive ? 'Activa' : 'Pausada'}</div>
                                        </div>
                                        <label className="text-sm font-black text-zinc-300 flex items-center gap-3">
                                            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                                            Activa
                                        </label>
                                    </div>

                                    <div className="bg-black/40 border border-white/10 rounded-2xl p-4">
                                        <div className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">Pasos</div>
                                        <div className="space-y-2">
                                            {steps.map((s, idx) => (
                                                <button
                                                    type="button"
                                                    key={idx}
                                                    onClick={() => setActiveStep(idx)}
                                                    className={`w-full text-left px-4 py-3 rounded-xl border ${idx === activeStep ? 'border-teal-500/40 bg-teal-500/10 text-teal-200' : 'border-white/10 bg-white/5 text-zinc-300'} transition-colors`}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-[10px] font-black uppercase tracking-widest opacity-70">Paso {idx + 1}</div>
                                                            <div className="text-sm font-black truncate">{s.title || '(sin titulo)'}</div>
                                                        </div>
                                                        {s.image ? <ImageIcon size={16} className="opacity-70" /> : null}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="mt-4 flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (steps.length >= 10) return;
                                                    setSteps((prev) => [...prev, { title: '', description: '', image: null }]);
                                                    setActiveStep(steps.length);
                                                }}
                                                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest"
                                            >
                                                + Agregar paso
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (steps.length <= 1) return;
                                                    setSteps((prev) => prev.filter((_, i) => i !== activeStep));
                                                    setActiveStep((i) => Math.max(0, i - 1));
                                                }}
                                                className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest text-rose-200"
                                            >
                                                Eliminar paso
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="lg:col-span-7 space-y-4">
                                    <div className="bg-zinc-950 border border-white/10 rounded-3xl p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <div className="text-xs font-black uppercase tracking-widest text-zinc-500">Edicion</div>
                                                <div className="text-lg font-black">Paso {activeStep + 1} de {steps.length}</div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => setActiveStep((i) => Math.max(0, i - 1))} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest" disabled={activeStep === 0}>Anterior</button>
                                                <button type="button" onClick={() => setActiveStep((i) => Math.min(steps.length - 1, i + 1))} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest" disabled={activeStep === steps.length - 1}>Siguiente</button>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Titulo</label>
                                                <input
                                                    value={steps[activeStep]?.title || ''}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setSteps((prev) => prev.map((s, i) => (i === activeStep ? { ...s, title: v } : s)));
                                                    }}
                                                    className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Descripcion</label>
                                                <textarea
                                                    value={steps[activeStep]?.description || ''}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setSteps((prev) => prev.map((s, i) => (i === activeStep ? { ...s, description: v } : s)));
                                                    }}
                                                    className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none h-40 resize-none"
                                                />
                                            </div>

                                            <div className="bg-black/40 border border-white/10 rounded-2xl p-4">
                                                <div className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">Foto (opcional)</div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            try {
                                                                setSaving(true);
                                                                const filename = await uploadStepImage(file);
                                                                setSteps((prev) => prev.map((s, i) => (i === activeStep ? { ...s, image: filename } : s)));
                                                                pushToast({ type: 'success', title: 'Imagen', message: 'Imagen subida.' });
                                                            } catch (err) {
                                                                pushToast({ type: 'error', title: 'Imagen', message: getApiErrorMessage(err, 'No se pudo subir la imagen.') });
                                                            } finally {
                                                                setSaving(false);
                                                                e.target.value = '';
                                                            }
                                                        }}
                                                        className="text-sm text-zinc-300"
                                                    />
                                                    {steps[activeStep]?.image ? (
                                                        <a
                                                            className="text-xs font-black uppercase tracking-widest text-teal-300 underline"
                                                            href={`${baseMedia}${steps[activeStep].image}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            Ver
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs font-black uppercase tracking-widest text-zinc-600">Sin imagen</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        disabled={saving || !canSave}
                                        className="w-full bg-teal-500 hover:bg-teal-400 text-black font-black py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={16} /> : null}
                                        Guardar
                                    </button>
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
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowView(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.98, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.98, opacity: 0 }}
                            className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-3xl p-8 relative z-10"
                        >
                            <button onClick={() => setShowView(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white">
                                <X size={20} />
                            </button>

                            <div className="flex items-start justify-between gap-6 mb-6">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-widest text-zinc-500">Estrategia</div>
                                    <div className="text-2xl font-black">{viewing.name}</div>
                                    <div className="text-sm text-zinc-400 font-semibold mt-2">{viewing.description}</div>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowView(false);
                                        openEdit(viewing);
                                    }}
                                    className="px-4 py-3 rounded-2xl bg-teal-500 text-black text-xs font-black uppercase tracking-widest"
                                >
                                    Editar
                                </button>
                            </div>

                            <div className="space-y-4">
                                {parseSteps(viewing.rules).map((st, idx) => (
                                    <div key={idx} className="bg-black/40 border border-white/10 rounded-2xl p-5">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Paso {idx + 1}</div>
                                        <div className="text-lg font-black mt-1">{st.title}</div>
                                        <div className="text-sm text-zinc-300 font-semibold mt-2 whitespace-pre-wrap">{st.description}</div>
                                        {st.image ? (
                                            <a className="inline-block mt-4 text-xs font-black uppercase tracking-widest text-teal-300 underline" href={`${baseMedia}${st.image}`} target="_blank" rel="noreferrer">
                                                Ver imagen
                                            </a>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
