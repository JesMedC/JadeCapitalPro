"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Trash2, UserPlus, Pencil, X } from 'lucide-react';
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
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-tighter italic decoration-teal-500 underline underline-offset-8">
                        Configuracion
                    </h1>
                    <p className="text-zinc-500 mt-4 font-bold tracking-widest text-xs uppercase">
                        Instrumentos, tiempos, proyeccion y usuarios
                    </p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => setTab('trading')}
                        className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${tab === 'trading' ? 'bg-teal-500 text-black' : 'bg-zinc-950 border border-white/10 text-white'}`}
                    >
                        Trading
                    </button>
                    <button
                        onClick={() => setTab('users')}
                        className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${tab === 'users' ? 'bg-teal-500 text-black' : 'bg-zinc-950 border border-white/10 text-white'}`}
                    >
                        Usuarios
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="h-[300px] flex items-center justify-center">
                    <Loader2 className="animate-spin text-teal-500 w-12 h-12" />
                </div>
            ) : tab === 'trading' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-7 space-y-6">
                        <div className="bg-zinc-950 border border-white/5 rounded-[40px] p-10">
                            <div className="flex items-center justify-between gap-6 mb-8">
                                <h3 className="text-xl font-bold">Instrumentos permitidos</h3>
                                <button
                                    onClick={saveConfig}
                                    disabled={saving}
                                    className="bg-white text-black px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-teal-500 transition-all disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                    Guardar
                                </button>
                            </div>

                            <div className="flex gap-3">
                                <input
                                    value={newInstrument}
                                    onChange={(e) => setNewInstrument(e.target.value)}
                                    className="flex-1 bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none"
                                    placeholder="Ej: EUR/USD, XAU/USD, BTC/USDT"
                                />
                                <button
                                    onClick={addInstrument}
                                    className="bg-teal-500 text-black px-5 rounded-2xl font-black"
                                >
                                    <Plus size={18} />
                                </button>
                            </div>

                            <div className="mt-6 flex flex-wrap gap-2">
                                {config.instruments.map((ins) => (
                                    <span key={ins} className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-sm font-bold">
                                        {ins}
                                        <button
                                            onClick={() => setConfig((c) => ({ ...c, instruments: c.instruments.filter((x) => x !== ins) }))}
                                            className="text-zinc-500 hover:text-white"
                                            aria-label={`Eliminar ${ins}`}
                                        >
                                            <X size={14} />
                                        </button>
                                    </span>
                                ))}
                                {config.instruments.length === 0 ? (
                                    <div className="text-zinc-600 text-sm font-bold">No hay instrumentos configurados.</div>
                                ) : null}
                            </div>
                        </div>

                        <div className="bg-zinc-950 border border-white/5 rounded-[40px] p-10">
                            <h3 className="text-xl font-bold mb-8">Tiempos permitidos (binarias)</h3>

                            <div className="flex gap-3">
                                <input
                                    value={newExpiry}
                                    onChange={(e) => setNewExpiry(e.target.value)}
                                    className="flex-1 bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none"
                                    placeholder="Ej: 1m, 5m, 15m"
                                />
                                <button
                                    onClick={addExpiry}
                                    className="bg-teal-500 text-black px-5 rounded-2xl font-black"
                                >
                                    <Plus size={18} />
                                </button>
                            </div>

                            <div className="mt-6 flex flex-wrap gap-2">
                                {config.expiry_times.map((t) => (
                                    <span key={t} className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-sm font-bold">
                                        {t}
                                        <button
                                            onClick={() => setConfig((c) => ({ ...c, expiry_times: c.expiry_times.filter((x) => x !== t) }))}
                                            className="text-zinc-500 hover:text-white"
                                            aria-label={`Eliminar ${t}`}
                                        >
                                            <X size={14} />
                                        </button>
                                    </span>
                                ))}
                                {config.expiry_times.length === 0 ? (
                                    <div className="text-zinc-600 text-sm font-bold">No hay tiempos configurados.</div>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-5 space-y-6">
                        <div className="bg-gradient-to-br from-zinc-900 to-black border border-white/10 rounded-[40px] p-10">
                            <h3 className="text-xl font-bold mb-8">Proyeccion diaria (%)</h3>
                            <p className="text-sm text-zinc-500 font-semibold mb-6">
                                Este porcentaje se usa para graficos comparativos (curva vs objetivo).
                            </p>

                            <input
                                type="number"
                                step="0.01"
                                value={config.daily_projection_pct}
                                onChange={(e) => setConfig((c) => ({ ...c, daily_projection_pct: Number(e.target.value) }))}
                                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-black outline-none"
                                placeholder="Ej: 2.5"
                            />

                            <div className="mt-10">
                                <h3 className="text-xl font-bold mb-4">Payout por defecto (binarias)</h3>
                                <p className="text-sm text-zinc-500 font-semibold mb-6">Se usa al abrir operaciones si no se especifica.</p>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={config.payout_pct_default}
                                    onChange={(e) => setConfig((c) => ({ ...c, payout_pct_default: Number(e.target.value) }))}
                                    className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-black outline-none"
                                    placeholder="0.85"
                                />
                            </div>

                            <div className="mt-10">
                                <h3 className="text-xl font-bold mb-4">Inversion sugerida (% del balance)</h3>
                                <p className="text-sm text-zinc-500 font-semibold mb-6">Se usa para sugerir el monto entero en operaciones.</p>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={config.investment_pct_default}
                                    onChange={(e) => setConfig((c) => ({ ...c, investment_pct_default: Number(e.target.value) }))}
                                    className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-black outline-none"
                                    placeholder="2"
                                />
                            </div>

                            <div className="mt-10">
                                <h3 className="text-xl font-bold mb-4">Opciones de payout (dropdown)</h3>
                                <p className="text-sm text-zinc-500 font-semibold mb-6">Ingresa porcentajes permitidos (ej: 75, 80, 85) y se mostraran como lista.</p>

                                <div className="flex gap-3">
                                    <input
                                        value={newPayoutPct}
                                        onChange={(e) => setNewPayoutPct(e.target.value)}
                                        className="flex-1 bg-black border border-white/10 rounded-2xl p-4 text-white font-black outline-none"
                                        placeholder="Ej: 85"
                                    />
                                    <button
                                        type="button"
                                        onClick={addPayoutOption}
                                        className="px-5 rounded-2xl bg-white/10 border border-white/10 text-white font-black hover:bg-white/15"
                                    >
                                        <Plus size={18} />
                                    </button>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    {(config.payout_options || []).map((p) => (
                                        <span key={String(p)} className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-white text-xs font-black">
                                            {Math.round(Number(p) * 100)}%
                                            <button
                                                type="button"
                                                onClick={() => removePayoutOption(Number(p))}
                                                className="text-zinc-400 hover:text-white"
                                                aria-label="remove"
                                            >
                                                <X size={14} />
                                            </button>
                                        </span>
                                    ))}
                                    {!config.payout_options?.length ? (
                                        <div className="text-xs font-bold text-zinc-600">Sin opciones configuradas.</div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="mt-10 space-y-4">
                                <h3 className="text-xl font-bold">Notificaciones</h3>

                                <div className="bg-black/40 border border-white/10 rounded-2xl p-4">
                                    <div className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">Canales</div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['portal', 'telegram', 'whatsapp'].map((ch) => (
                                            <label key={ch} className="flex items-center gap-3 text-sm font-bold text-zinc-300">
                                                <input
                                                    type="checkbox"
                                                    checked={config.notify_channels.includes(ch)}
                                                    onChange={(e) => {
                                                        setConfig((c) => {
                                                            const next = new Set(c.notify_channels);
                                                            if (e.target.checked) next.add(ch);
                                                            else next.delete(ch);
                                                            return { ...c, notify_channels: Array.from(next) };
                                                        });
                                                    }}
                                                />
                                                {ch}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Telegram Chat ID</label>
                                    <input
                                        value={config.notify_telegram_chat_id}
                                        onChange={(e) => setConfig((c) => ({ ...c, notify_telegram_chat_id: e.target.value }))}
                                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none"
                                        placeholder="-1001234567890"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Telegram Bot Token (solo si vas a cambiarlo)</label>
                                    <input
                                        type="password"
                                        value={config.notify_telegram_bot_token}
                                        onChange={(e) => setConfig((c) => ({ ...c, notify_telegram_bot_token: e.target.value }))}
                                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none"
                                        placeholder="123:ABC..."
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-black text-zinc-500 uppercase block mb-2">WhatsApp Instance (opcional)</label>
                                    <input
                                        value={config.notify_whatsapp_instance}
                                        onChange={(e) => setConfig((c) => ({ ...c, notify_whatsapp_instance: e.target.value }))}
                                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none"
                                        placeholder="ID de sesion / instancia"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Numeros WhatsApp a notificar</label>
                                    <textarea
                                        value={config.notify_whatsapp_numbers.join('\n')}
                                        onChange={(e) => setConfig((c) => ({ ...c, notify_whatsapp_numbers: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) }))}
                                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none h-28 resize-none"
                                        placeholder="+56911111111\n+56922222222"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={saveConfig}
                                disabled={saving}
                                className="mt-6 w-full bg-teal-500 text-black px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-teal-400 transition-all disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold">Usuarios</h3>
                        <button
                            onClick={openCreateUser}
                            className="bg-teal-500 text-black px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-teal-400 transition-all"
                        >
                            <UserPlus size={16} />
                            Nuevo
                        </button>
                    </div>

                    <div className="bg-zinc-950 border border-white/5 rounded-[40px] overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-white/[0.02] text-zinc-500 text-[10px] uppercase font-black tracking-widest">
                                <tr>
                                    <th className="px-10 py-6">Usuario</th>
                                    <th className="px-10 py-6">Email</th>
                                    <th className="px-10 py-6">Rol</th>
                                    <th className="px-10 py-6">Activo</th>
                                    <th className="px-10 py-6 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {users.map((u) => (
                                    <tr key={u.id} className="text-sm">
                                        <td className="px-10 py-6 font-black text-white">{u.username}</td>
                                        <td className="px-10 py-6 text-zinc-400 font-semibold">{u.email}</td>
                                        <td className="px-10 py-6 text-zinc-300 font-black uppercase">{u.role}</td>
                                        <td className="px-10 py-6">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${u.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-300'}`}>
                                                {u.is_active ? 'activo' : 'inactivo'}
                                            </span>
                                        </td>
                                        <td className="px-10 py-6 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => openEditUser(u)}
                                                    className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                                                    aria-label="Editar"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    onClick={() => deleteUser(u)}
                                                    className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 hover:bg-rose-500/20 transition-colors"
                                                    aria-label="Eliminar"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-10 py-16 text-center text-zinc-600 font-bold">
                                            No hay usuarios.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showUserModal ? (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setShowUserModal(false)} />
                    <div className="relative z-10 w-full max-w-lg bg-zinc-900 border border-white/10 rounded-[32px] p-8">
                        <button
                            onClick={() => setShowUserModal(false)}
                            className="absolute top-5 right-5 text-zinc-500 hover:text-white"
                        >
                            <X size={18} />
                        </button>

                        <h3 className="text-2xl font-black mb-6">
                            {userMode === 'create' ? 'Nuevo usuario' : `Editar: ${editingUser?.username}`}
                        </h3>

                        <form onSubmit={submitUser} className="space-y-4">
                            <div>
                                <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Username</label>
                                <input
                                    value={userForm.username}
                                    onChange={(e) => setUserForm((s) => ({ ...s, username: e.target.value }))}
                                    disabled={userMode === 'edit'}
                                    className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none disabled:opacity-50"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Email</label>
                                <input
                                    type="email"
                                    value={userForm.email}
                                    onChange={(e) => setUserForm((s) => ({ ...s, email: e.target.value }))}
                                    className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Password {userMode === 'edit' ? '(opcional)' : ''}</label>
                                <input
                                    type="password"
                                    value={userForm.password}
                                    onChange={(e) => setUserForm((s) => ({ ...s, password: e.target.value }))}
                                    className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Rol</label>
                                    <select
                                        value={userForm.role}
                                        onChange={(e) => setUserForm((s) => ({ ...s, role: e.target.value as Role }))}
                                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-black outline-none"
                                    >
                                        <option value="admin">admin</option>
                                        <option value="operador">operador</option>
                                        <option value="visor">visor</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-black text-zinc-500 uppercase block mb-2">Activo</label>
                                    <select
                                        value={userForm.is_active ? 'yes' : 'no'}
                                        onChange={(e) => setUserForm((s) => ({ ...s, is_active: e.target.value === 'yes' }))}
                                        className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-black outline-none"
                                    >
                                        <option value="yes">si</option>
                                        <option value="no">no</option>
                                    </select>
                                </div>
                            </div>

                            <div className="bg-black/40 border border-white/10 rounded-2xl p-4">
                                <div className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">Permisos (checklist)</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {PERMISSIONS.map((p) => (
                                        <label key={p.id} className="flex items-center gap-3 text-sm font-bold text-zinc-300">
                                            <input
                                                type="checkbox"
                                                checked={userForm.permissions.includes(p.id)}
                                                onChange={(e) => {
                                                    setUserForm((s) => {
                                                        const next = new Set(s.permissions);
                                                        if (e.target.checked) next.add(p.id);
                                                        else next.delete(p.id);
                                                        return { ...s, permissions: Array.from(next) };
                                                    });
                                                }}
                                            />
                                            {p.label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <button
                                disabled={saving || !canSubmitUser}
                                className="mt-4 w-full bg-teal-500 text-black px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-teal-400 transition-all disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                Guardar
                            </button>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
