"use client";

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useToastStore } from '@/lib/toastStore';

const iconFor = (type: string) => {
    if (type === 'success') return CheckCircle2;
    if (type === 'error') return AlertTriangle;
    return Info;
};

const styleFor = (type: string) => {
    if (type === 'success') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
    if (type === 'error') return 'border-rose-500/20 bg-rose-500/10 text-rose-200';
    return 'border-teal-500/20 bg-teal-500/10 text-teal-100';
};

export default function ToastStack() {
    const toasts = useToastStore((s) => s.toasts);
    const remove = useToastStore((s) => s.remove);

    return (
        <div className="fixed top-24 right-6 z-[200] w-[min(420px,calc(100vw-3rem))] space-y-3">
            <AnimatePresence initial={false}>
                {toasts.map((t) => {
                    const Icon = iconFor(t.type);
                    return (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, y: -10, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.98 }}
                            transition={{ duration: 0.18 }}
                            className={`backdrop-blur-xl border rounded-2xl p-4 shadow-2xl ${styleFor(t.type)}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5">
                                    <Icon size={18} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    {t.title ? (
                                        <div className="text-xs font-black uppercase tracking-widest opacity-90">{t.title}</div>
                                    ) : null}
                                    <div className="text-sm font-semibold leading-snug break-words">{t.message}</div>
                                </div>
                                <button
                                    onClick={() => remove(t.id)}
                                    className="text-white/60 hover:text-white transition-colors rounded-lg p-1"
                                    aria-label="Cerrar"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
