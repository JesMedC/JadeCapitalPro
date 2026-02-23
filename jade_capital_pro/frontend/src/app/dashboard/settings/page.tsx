"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Trash2, UserPlus, Pencil, X, Target, Clock, BarChart3, Bell, Wallet, Percent, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useToastStore } from '@/lib/toastStore';

type Role = 'admin' | 'operador' | 'visor';

type Config = {
    instruments: string[];
    expiry_times: string[];
    daily_projection_pct: number;
    payout_pct_default: number;

    investment_pct_default: number;
    payout_options: number[];

    notify_channels: string[];
    notify_telegram_chat_id: string;
    notify_telegram_bot_token: string;
    notify_whatsapp_instance: string;
    notify_whatsapp_numbers: string[];
};

type UserRow = {
    id: number;
    username: string;
    email: string;
    role: Role;
    is_active: boolean;
    permissions: string[];
};

const PERMISSIONS: Array<{ id: string; label: string }> = [
    { id: 'dashboard:view', label: 'Ver dashboard' },
    { id: 'trading:accounts', label: 'Cuentas (ver/crear)' },
    { id: 'trading:banking', label: 'Depositos/retiros' },
    { id: 'trading:trades', label: 'Operaciones (abrir/cerrar)' },
    { id: 'reports:export', label: 'Exportar reportes' },
    { id: 'metrics:view', label: 'Ver metricas' },
    { id: 'strategy:manage', label: 'Gestionar estrategias' },
    { id: 'library:manage', label: 'Gestionar libreria' },
    { id: 'bot:scanner', label: 'Scanner Jade Bot' },
    { id: 'admin:config', label: 'Configurar sistema' },
    { id: 'admin:users', label: 'Administrar usuarios' },
];

export default function SettingsPage() {
    const pushToast = useToastStore((s) => s.push);

    const [tab, setTab] = useState<'trading' | 'users'>('trading');
    const [configTab, setConfigTab] = useState<'instruments' | 'times' | 'projection' | 'investment' | 'notifications'>('instruments');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [config, setConfig] = useState<Config>({
        instruments: [],
        expiry_times: [],
        daily_projection_pct: 0,
        payout_pct_default: 0.85,

        investment_pct_default: 2,
        payout_options: [0.75, 0.8, 0.85, 0.9],

        notify_channels: ['portal'],
        notify_telegram_chat_id: '',
        notify_telegram_bot_token: '',
        notify_whatsapp_instance: '',
        notify_whatsapp_numbers: [],
    });

    const [users, setUsers] = useState<UserRow[]>([]);

    const [newInstrument, setNewInstrument] = useState('');
    const [newExpiry, setNewExpiry] = useState('');
    const [newPayoutPct, setNewPayoutPct] = useState('');

    const [showUserModal, setShowUserModal] = useState(false);
    const [userMode, setUserMode] = useState<'create' | 'edit'>('create');
    const [editingUser, setEditingUser] = useState<UserRow | null>(null);

    const [userForm, setUserForm] = useState({
        username: '',
        email: '',
        password: '',
        role: 'visor' as Role,
        is_active: true,
        permissions: [] as string[],
    });

    const canSubmitUser = useMemo(() => {
        if (userMode === 'create') return userForm.username.trim() && userForm.email.trim() && userForm.password;
        return userForm.email.trim();
    }, [userMode, userForm]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [cfg, usr] = await Promise.all([
                api.get('/admin/config'),
                api.get('/admin/users'),
            ]);
            setConfig({
                instruments: cfg.data?.instruments || [],
                expiry_times: cfg.data?.expiry_times || [],
                daily_projection_pct: Number(cfg.data?.daily_projection_pct || 0),
                payout_pct_default: Number(cfg.data?.payout_pct_default ?? 0.85),

                investment_pct_default: Number(cfg.data?.investment_pct_default ?? 2),
                payout_options:
                    (cfg.data?.payout_options && cfg.data.payout_options.length
                        ? cfg.data.payout_options
                        : [0.75, 0.76, 0.77, 0.78, 0.79, 0.8, 0.81, 0.82, 0.83, 0.84, 0.85, 0.86, 0.87, 0.88, 0.89, 0.9, 0.91, 0.92, 0.93, 0.94]),

                notify_channels: cfg.data?.notify_channels || ['portal'],
                notify_telegram_chat_id: cfg.data?.notify_telegram_chat_id || '',
                notify_telegram_bot_token: '',
                notify_whatsapp_instance: cfg.data?.notify_whatsapp_instance || '',
                notify_whatsapp_numbers: cfg.data?.notify_whatsapp_numbers || [],
            });
            setUsers(usr.data);
        } catch (err) {
            pushToast({ type: 'error', title: 'Configuracion', message: getApiErrorMessage(err) });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const addInstrument = () => {
        const v = newInstrument.trim();
        if (!v) return;
        setConfig((c) => ({
            ...c,
            instruments: Array.from(new Set([...c.instruments, v])),
        }));
        setNewInstrument('');
    };

    const addExpiry = () => {
        const v = newExpiry.trim();
        if (!v) return;
        setConfig((c) => ({
            ...c,
            expiry_times: Array.from(new Set([...c.expiry_times, v])),
        }));
        setNewExpiry('');
    };

    const addPayoutOption = () => {
        const raw = newPayoutPct.trim().replace('%', '');
        if (!raw) return;
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        const dec = n > 1 ? n / 100 : n;
        if (!(dec > 0 && dec < 2)) return;

        setConfig((c) => {
            const next = Array.from(new Set([...(c.payout_options || []), Number(dec.toFixed(4))]));
            next.sort((a, b) => a - b);
            return { ...c, payout_options: next };
        });
        setNewPayoutPct('');
    };

    const removePayoutOption = (v: number) => {
        setConfig((c) => ({ ...c, payout_options: (c.payout_options || []).filter((x) => Number(x) !== Number(v)) }));
    };

    const saveConfig = async () => {
        setSaving(true);
        try {
            const payload: any = {
                instruments: config.instruments,
                expiry_times: config.expiry_times,
                daily_projection_pct: config.daily_projection_pct,
                payout_pct_default: config.payout_pct_default,

                investment_pct_default: config.investment_pct_default,
                payout_options: config.payout_options,

                notify_channels: config.notify_channels,
                notify_telegram_chat_id: config.notify_telegram_chat_id || null,
                notify_whatsapp_instance: config.notify_whatsapp_instance || null,
                notify_whatsapp_numbers: config.notify_whatsapp_numbers,
            };
            if (config.notify_telegram_bot_token.trim()) {
                payload.notify_telegram_bot_token = config.notify_telegram_bot_token.trim();
            }

            const res = await api.put('/admin/config', payload);
            setConfig((c) => ({
                ...c,
                instruments: res.data?.instruments || [],
                expiry_times: res.data?.expiry_times || [],
                daily_projection_pct: Number(res.data?.daily_projection_pct || 0),
                payout_pct_default: Number(res.data?.payout_pct_default ?? 0.85),

                investment_pct_default: Number(res.data?.investment_pct_default ?? 2),
                payout_options: res.data?.payout_options || [0.75, 0.8, 0.85, 0.9],
                notify_channels: res.data?.notify_channels || ['portal'],
                notify_telegram_chat_id: res.data?.notify_telegram_chat_id || '',
                notify_whatsapp_instance: res.data?.notify_whatsapp_instance || '',
                notify_whatsapp_numbers: res.data?.notify_whatsapp_numbers || [],
                notify_telegram_bot_token: '',
            }));
            pushToast({ type: 'success', title: 'Configuracion', message: 'Cambios guardados.' });
        } catch (err) {
            pushToast({ type: 'error', title: 'Configuracion', message: getApiErrorMessage(err, 'No se pudo guardar.') });
        } finally {
            setSaving(false);
        }
    };

    const testNotifications = async () => {
        try {
            await api.post('/bot/notify/test');
            pushToast({ type: 'info', title: 'Notificaciones', message: 'Prueba enviada a canales activos.' });
        } catch (err) {
            pushToast({ type: 'error', title: 'Error', message: 'No se pudo enviar la prueba.' });
        }
    };

    const openCreateUser = () => {
        setUserMode('create');
        setEditingUser(null);
        setUserForm({ username: '', email: '', password: '', role: 'visor', is_active: true, permissions: [] });
        setShowUserModal(true);
    };

    const openEditUser = (u: UserRow) => {
        setUserMode('edit');
        setEditingUser(u);
        setUserForm({ username: u.username, email: u.email, password: '', role: u.role, is_active: u.is_active, permissions: u.permissions || [] });
        setShowUserModal(true);
    };

    const submitUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmitUser) return;

        setSaving(true);
        try {
            if (userMode === 'create') {
                await api.post('/admin/users', {
                    username: userForm.username.trim(),
                    email: userForm.email.trim(),
                    password: userForm.password,
                    role: userForm.role,
                    is_active: userForm.is_active,
                    permissions: userForm.permissions,
                });
                pushToast({ type: 'success', title: 'Usuarios', message: 'Usuario creado.' });
            } else {
                if (!editingUser) return;
                await api.patch(`/admin/users/${editingUser.id}`, {
                    email: userForm.email.trim(),
                    password: userForm.password ? userForm.password : undefined,
                    role: userForm.role,
                    is_active: userForm.is_active,
                    permissions: userForm.permissions,
                });
                pushToast({ type: 'success', title: 'Usuarios', message: 'Usuario actualizado.' });
            }

            setShowUserModal(false);
            await fetchAll();
        } catch (err) {
            pushToast({ type: 'error', title: 'Usuarios', message: getApiErrorMessage(err, 'No se pudo guardar el usuario.') });
        } finally {
            setSaving(false);
        }
    };

    const deleteUser = async (u: UserRow) => {
        if (!confirm(`Eliminar usuario ${u.username}?`)) return;
        setSaving(true);
        try {
            await api.delete(`/admin/users/${u.id}`);
            pushToast({ type: 'success', title: 'Usuarios', message: 'Usuario eliminado.' });
            await fetchAll();
        } catch (err) {
            pushToast({ type: 'error', title: 'Usuarios', message: getApiErrorMessage(err, 'No se pudo eliminar.') });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-10 pb-10">
            {/* Terminal Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 pb-8 border-b border-white/5">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
                        <span className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <Settings className="text-emerald-500 animate-[spin_8s_linear_infinite]" size={24} />
                        </span>
                        Neural Core Engine
                    </h1>
                    <p className="text-white/40 font-bold tracking-[0.2em] text-[10px] uppercase ml-14">
                        System Configuration • Security & Permissions
                    </p>
                </div>

                <div className="flex bg-[#0B0E11] p-1.5 rounded-[22px] border border-white/5">
                    <button
                        onClick={() => setTab('trading')}
                        className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'trading' ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'text-white/40 hover:text-white'}`}
                    >
                        Operational
                    </button>
                    <button
                        onClick={() => setTab('users')}
                        className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'users' ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'text-white/40 hover:text-white'}`}
                    >
                        Personnel
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="h-[50vh] flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin text-emerald-500 w-10 h-10" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Syncing Parameters...</p>
                </div>
            ) : tab === 'trading' ? (
                <div className="space-y-8">
                    {/* Control Panel Section */}
                    <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-8 group">
                        <div className="flex items-center gap-5">
                            <div className="p-4 bg-emerald-500/10 rounded-2xl text-emerald-500 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                                <Settings size={28} className="animate-[spin_10s_linear_infinite]" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white uppercase italic tracking-tight">Mainframe Proxy</h3>
                                <p className="text-[10px] text-white/30 font-bold uppercase tracking-[.2em] mt-1">Select logic module for override</p>
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto">
                            <div className="relative w-full md:w-80 group/select">
                                <select
                                    value={configTab}
                                    onChange={(e) => setConfigTab(e.target.value as any)}
                                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-[11px] font-black uppercase tracking-widest text-white outline-none focus:border-emerald-500/50 appearance-none cursor-pointer transition-all"
                                >
                                    <option value="instruments">Allowed Asset Vectors</option>
                                    <option value="times">Temporal Intervals</option>
                                    <option value="projection">Projection & Payout</option>
                                    <option value="investment">Risk Allocation</option>
                                    <option value="notifications">Alert Transmissions</option>
                                </select>
                                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 group-hover/select:text-emerald-500 transition-colors">
                                    <Target size={14} />
                                </div>
                            </div>

                            <button
                                onClick={saveConfig}
                                disabled={saving}
                                className="w-full md:w-auto h-14 bg-white text-black px-10 rounded-2xl font-black text-[11px] uppercase tracking-[.2em] flex items-center justify-center gap-3 hover:scale-105 transition-all disabled:opacity-50 shadow-xl"
                            >
                                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                Commit Changes
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                        {configTab === 'instruments' && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                className="bg-[#0B0E11] border border-white/5 rounded-[40px] p-10 shadow-2xl"
                            >
                                <div className="flex items-center gap-4 mb-10">
                                    <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 border border-emerald-500/20">
                                        <BarChart3 size={20} />
                                    </div>
                                    <h3 className="text-xl font-black text-white uppercase italic">Supported Asset Indices</h3>
                                </div>

                                <div className="flex gap-4">
                                    <input
                                        value={newInstrument}
                                        onChange={(e) => setNewInstrument(e.target.value)}
                                        className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-black text-xs uppercase tracking-widest outline-none focus:border-emerald-500/50 transition-all"
                                        placeholder="INPUT ASSET SYMBOL (E.G. XAU/USD)"
                                    />
                                    <button
                                        onClick={addInstrument}
                                        className="bg-emerald-500 text-black px-8 rounded-2xl font-black hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>

                                <div className="mt-8 flex flex-wrap gap-3">
                                    {config.instruments.map((ins) => (
                                        <span key={ins} className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-white/[0.03] border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/70 hover:border-emerald-500/30 transition-all">
                                            {ins}
                                            <button
                                                onClick={() => setConfig((c) => ({ ...c, instruments: c.instruments.filter((x) => x !== ins) }))}
                                                className="text-white/20 hover:text-rose-500 transition-colors"
                                            >
                                                <X size={14} />
                                            </button>
                                        </span>
                                    ))}
                                    {config.instruments.length === 0 && (
                                        <div className="text-white/20 text-[10px] font-black uppercase tracking-widest italic">Node empty. Awaiting indices.</div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {configTab === 'times' && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                className="bg-[#0B0E11] border border-white/5 rounded-[40px] p-10 shadow-2xl"
                            >
                                <div className="flex items-center gap-4 mb-10">
                                    <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 border border-emerald-500/20">
                                        <Clock size={20} />
                                    </div>
                                    <h3 className="text-xl font-black text-white uppercase italic">Execution Window Intervals</h3>
                                </div>

                                <div className="flex gap-4">
                                    <input
                                        value={newExpiry}
                                        onChange={(e) => setNewExpiry(e.target.value)}
                                        className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-black text-xs uppercase tracking-widest outline-none focus:border-emerald-500/50 transition-all"
                                        placeholder="TEMPORAL RANGE (E.G. 1M, 5M)"
                                    />
                                    <button
                                        onClick={addExpiry}
                                        className="bg-emerald-500 text-black px-8 rounded-2xl font-black hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>

                                <div className="mt-8 flex flex-wrap gap-3">
                                    {config.expiry_times.map((t) => (
                                        <span key={t} className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-white/[0.03] border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/70 hover:border-emerald-500/30 transition-all">
                                            {t}
                                            <button
                                                onClick={() => setConfig((c) => ({ ...c, expiry_times: c.expiry_times.filter((x) => x !== t) }))}
                                                className="text-white/20 hover:text-rose-500 transition-colors"
                                            >
                                                <X size={14} />
                                            </button>
                                        </span>
                                    ))}
                                    {config.expiry_times.length === 0 && (
                                        <div className="text-white/20 text-[10px] font-black uppercase tracking-widest italic">Zero intervals defined.</div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {configTab === 'projection' && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                className="bg-[#0B0E11] border border-white/5 rounded-[40px] p-10 shadow-2xl"
                            >
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-16">
                                    <div className="space-y-12">
                                        <div>
                                            <div className="flex items-center gap-4 mb-8">
                                                <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 border border-emerald-500/20">
                                                    <Target size={20} />
                                                </div>
                                                <h3 className="text-xl font-black text-white uppercase italic">Daily Yield Target (%)</h3>
                                            </div>
                                            <input
                                                type="number" step="0.01"
                                                value={config.daily_projection_pct}
                                                onChange={(e) => setConfig((c) => ({ ...c, daily_projection_pct: Number(e.target.value) }))}
                                                className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-black text-xl italic outline-none focus:border-emerald-500/50 transition-all"
                                            />
                                            <p className="text-[9px] text-white/20 font-black uppercase tracking-[.2em] mt-4 ml-2">Benchmark reference for performance audit.</p>
                                        </div>

                                        <div className="pt-10 border-t border-white/5">
                                            <div className="flex items-center gap-4 mb-6">
                                                <Percent size={18} className="text-emerald-500" />
                                                <h4 className="text-sm font-black text-white uppercase tracking-widest">Master Payout Index</h4>
                                            </div>
                                            <input
                                                type="number" step="0.01"
                                                value={config.payout_pct_default}
                                                onChange={(e) => setConfig((c) => ({ ...c, payout_pct_default: Number(e.target.value) }))}
                                                className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-black text-xl italic outline-none focus:border-emerald-500/50 transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div className="xl:border-l xl:border-white/5 xl:pl-16 space-y-8">
                                        <div>
                                            <h3 className="text-xl font-black text-white uppercase italic mb-2">Payout Vectors</h3>
                                            <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-8">Allowed return percentages for session log.</p>

                                            <div className="flex gap-4">
                                                <input
                                                    value={newPayoutPct}
                                                    onChange={(e) => setNewPayoutPct(e.target.value)}
                                                    className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-black text-xs uppercase tracking-widest outline-none focus:border-emerald-500/50 transition-all"
                                                    placeholder="E.G. 85"
                                                />
                                                <button onClick={addPayoutOption} className="bg-white/5 border border-white/10 text-white px-6 rounded-2xl font-black hover:bg-white/10 transition-all">
                                                    <Plus size={20} />
                                                </button>
                                            </div>

                                            <div className="mt-8 flex flex-wrap gap-2">
                                                {(config.payout_options || []).map((p) => (
                                                    <span key={String(p)} className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-emerald-500/5 border border-emerald-500/20 text-emerald-500 text-[10px] font-black italic">
                                                        {Math.round(Number(p) * 100)}%
                                                        <button onClick={() => removePayoutOption(Number(p))} className="text-emerald-500/30 hover:text-emerald-500 transition-colors"><X size={14} /></button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {configTab === 'investment' && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                className="bg-[#0B0E11] border border-white/5 rounded-[40px] p-10 shadow-2xl"
                            >
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 border border-emerald-500/20">
                                        <Wallet size={20} />
                                    </div>
                                    <h3 className="text-xl font-black text-white uppercase italic">Standard Risk Allocation (%)</h3>
                                </div>
                                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-8 ml-14">Suggested allocation per individual operation.</p>
                                <input
                                    type="number" step="0.1"
                                    value={config.investment_pct_default}
                                    onChange={(e) => setConfig((c) => ({ ...c, investment_pct_default: Number(e.target.value) }))}
                                    className="w-full bg-black/40 border border-white/5 rounded-2xl p-6 text-white font-black text-2xl italic outline-none focus:border-emerald-500/50 transition-all"
                                />
                            </motion.div>
                        )}

                        {configTab === 'notifications' && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                className="bg-[#0B0E11] border border-white/5 rounded-[40px] p-10 shadow-2xl"
                            >
                                <div className="flex items-center gap-4 mb-10">
                                    <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 border border-emerald-500/20">
                                        <Bell size={20} />
                                    </div>
                                    <h3 className="text-xl font-black text-white uppercase italic">Alert Transmission Protocols</h3>
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-16">
                                    <div className="space-y-8">
                                        <div className="bg-black/20 border border-white/5 rounded-[32px] p-8">
                                            <div className="text-[10px] font-black uppercase tracking-[.3em] text-white/20 mb-8">Active Downlinks</div>
                                            <div className="space-y-4">
                                                {['portal', 'telegram', 'whatsapp'].map((ch) => (
                                                    <label key={ch} className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/5 cursor-pointer hover:bg-white/[0.04] transition-all group">
                                                        <span className="capitalize font-black text-[11px] tracking-widest text-white/60 group-hover:text-white">{ch} Proxy</span>
                                                        <input
                                                            type="checkbox"
                                                            checked={config.notify_channels.includes(ch)}
                                                            className="w-5 h-5 rounded-lg border-white/10 bg-black text-emerald-500 focus:ring-emerald-500 transition-all"
                                                            onChange={(e) => {
                                                                setConfig((c) => {
                                                                    const next = new Set(c.notify_channels);
                                                                    if (e.target.checked) next.add(ch);
                                                                    else next.delete(ch);
                                                                    return { ...c, notify_channels: Array.from(next) };
                                                                });
                                                            }}
                                                        />
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-2">Telegram Chat ID</label>
                                                <input
                                                    value={config.notify_telegram_chat_id}
                                                    onChange={(e) => setConfig((c) => ({ ...c, notify_telegram_chat_id: e.target.value }))}
                                                    className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-bold text-xs outline-none focus:border-emerald-500/50 transition-all"
                                                    placeholder="-1001234..."
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-2">Secure Bot Token</label>
                                                <input
                                                    type="password"
                                                    value={config.notify_telegram_bot_token}
                                                    onChange={(e) => setConfig((c) => ({ ...c, notify_telegram_bot_token: e.target.value }))}
                                                    className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-bold text-xs outline-none focus:border-emerald-500/50 transition-all"
                                                    placeholder="ENCRYPTED"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-2">WA CallMeBot API Key</label>
                                            <input
                                                value={config.notify_whatsapp_instance}
                                                onChange={(e) => setConfig((c) => ({ ...c, notify_whatsapp_instance: e.target.value }))}
                                                className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-bold text-xs outline-none focus:border-emerald-500/50 transition-all"
                                                placeholder="API_INSTANCE_KEY"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-2">Target Numbers (LF Separation)</label>
                                            <textarea
                                                value={config.notify_whatsapp_numbers.join('\n')}
                                                onChange={(e) => setConfig((c) => ({ ...c, notify_whatsapp_numbers: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) }))}
                                                className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-bold text-xs outline-none h-32 resize-none focus:border-emerald-500/50 transition-all"
                                                placeholder="+569..."
                                            />
                                        </div>

                                        <button
                                            onClick={testNotifications}
                                            className="w-full h-14 bg-white/[0.03] border border-white/5 rounded-2xl text-white font-black uppercase text-[10px] tracking-[.3em] hover:bg-white/[0.08] transition-all flex items-center justify-center gap-3 group"
                                        >
                                            <Bell size={16} className="text-emerald-500 group-hover:scale-110 transition-transform" />
                                            Initialize Test Signal
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-8">
                    <div className="flex justify-between items-center">
                        <div className="space-y-1">
                            <h3 className="text-xl font-black text-white uppercase italic">Active Operatives</h3>
                            <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Database of Authorized System Access</p>
                        </div>
                        <button
                            onClick={openCreateUser}
                            className="bg-emerald-500 text-black px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                        >
                            <UserPlus size={16} />
                            Deploy New Operative
                        </button>
                    </div>

                    <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl transition-all">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white/[0.02] border-b border-white/5">
                                    <th className="px-10 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Operative Email</th>
                                    <th className="px-10 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Access Level</th>
                                    <th className="px-10 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Authorization</th>
                                    <th className="px-10 py-6 text-right text-[9px] font-black uppercase tracking-[.2em] text-white/30">Protocol</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {users.map((u) => (
                                    <tr key={u.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-10 py-6">
                                            <div className="flex flex-col">
                                                <span className="font-black text-white uppercase tracking-tight group-hover:text-emerald-500 transition-colors">{u.username}</span>
                                                <span className="text-[9px] text-white/30 font-black uppercase mt-0.5">{u.email}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-6">
                                            <span className="px-4 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/60 font-black text-[10px] uppercase tracking-widest italic group-hover:border-emerald-500/20 group-hover:text-emerald-500 transition-all">
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="px-10 py-6">
                                            <span className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-[.2em] border ${u.is_active ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-rose-500/5 text-rose-500 border-rose-500/10'}`}>
                                                {u.is_active ? 'Authenticated' : 'Revoked'}
                                            </span>
                                        </td>
                                        <td className="px-10 py-6 text-right">
                                            <div className="flex justify-end gap-3">
                                                <button
                                                    onClick={() => openEditUser(u)}
                                                    className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-white/20 hover:text-white hover:border-white/20 transition-all"
                                                    aria-label="Modify"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => deleteUser(u)}
                                                    className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-500/40 hover:text-rose-500 hover:border-rose-500/30 transition-all"
                                                    aria-label="Terminate"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-10 py-24 text-center">
                                            <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white/10 mx-auto mb-6">
                                                <UserPlus size={32} />
                                            </div>
                                            <p className="font-black uppercase tracking-[.4em] text-[10px] text-white/20 italic">Zero personnel profiles recovered.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* User Access Modal */}
            <AnimatePresence>
                {showUserModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-[100] p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-2xl bg-[#0B0E11] border border-white/5 rounded-[40px] shadow-2xl overflow-hidden"
                        >
                            <div className="p-10 border-b border-white/5 flex items-center justify-between">
                                <div className="space-y-1">
                                    <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">
                                        {editingUser ? 'Override Access' : 'New Authorization'}
                                    </h3>
                                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.3em]">Configure Operative Parameters</p>
                                </div>
                                <button
                                    onClick={() => setShowUserModal(false)}
                                    className="p-3 bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <form onSubmit={submitUser} className="p-10 space-y-8 overflow-y-auto max-h-[80vh]">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-2">Codename / Username</label>
                                        <input
                                            value={userForm.username}
                                            onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                                            required
                                            disabled={userMode === 'edit'}
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-black text-xs uppercase tracking-widest outline-none focus:border-emerald-500/50 transition-all placeholder:text-white/10 disabled:opacity-50"
                                            placeholder="OPERATIVE_01"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-2">Email Address</label>
                                        <input
                                            type="email"
                                            value={userForm.email}
                                            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                                            required
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-black text-xs uppercase tracking-widest outline-none focus:border-emerald-500/50 transition-all placeholder:text-white/10"
                                            placeholder="EMAIL@JADE.CAPITAL"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-2">Clearance Level</label>
                                        <select
                                            value={userForm.role}
                                            onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-black text-xs uppercase tracking-widest outline-none focus:border-emerald-500/50 appearance-none transition-all cursor-pointer"
                                        >
                                            <option value="visor">Visor (Read Only)</option>
                                            <option value="operador">Operador (Trading)</option>
                                            <option value="admin">Administrator (Full)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-2">Account Status</label>
                                        <select
                                            value={userForm.is_active ? 'active' : 'revoked'}
                                            onChange={(e) => setUserForm({ ...userForm, is_active: e.target.value === 'active' })}
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-black text-xs uppercase tracking-widest outline-none focus:border-emerald-500/50 appearance-none transition-all cursor-pointer"
                                        >
                                            <option value="active">Active Protocol</option>
                                            <option value="revoked">Access Revoked</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-2">Secure Passkey {userMode === 'edit' && '(Leave blank to maintain)'}</label>
                                    <input
                                        type="password"
                                        value={userForm.password}
                                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                                        required={userMode === 'create'}
                                        className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 text-white font-black text-xs uppercase tracking-widest outline-none focus:border-emerald-500/50 transition-all placeholder:text-white/10"
                                        placeholder="••••••••••••"
                                    />
                                </div>

                                <div className="space-y-5 bg-white/[0.02] border border-white/5 rounded-[32px] p-8">
                                    <div className="text-[10px] font-black uppercase tracking-[.3em] text-white/20">Module Permissions</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {PERMISSIONS.map((p) => (
                                            <label key={p.id} className="flex items-center gap-3 group cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={userForm.permissions.includes(p.id)}
                                                    className="w-5 h-5 rounded-lg border-white/10 bg-black text-emerald-500 focus:ring-emerald-500 transition-all"
                                                    onChange={(e) => {
                                                        setUserForm((s) => {
                                                            const next = new Set(s.permissions);
                                                            if (e.target.checked) next.add(p.id);
                                                            else next.delete(p.id);
                                                            return { ...s, permissions: Array.from(next) };
                                                        });
                                                    }}
                                                />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white transition-colors">{p.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-6 flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowUserModal(false)}
                                        className="flex-1 h-16 bg-white/5 border border-white/10 rounded-2xl text-white font-black uppercase text-[10px] tracking-widest hover:bg-white/10 transition-all"
                                    >
                                        Abort
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving || !canSubmitUser}
                                        className="flex-[2] h-16 bg-emerald-500 text-black rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50 flex items-center justify-center gap-3"
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                        {userMode === 'create' ? 'Deploy Operative' : 'Commit Override'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
