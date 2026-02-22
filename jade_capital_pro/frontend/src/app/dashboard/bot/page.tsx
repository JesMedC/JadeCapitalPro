"use client";

import React from 'react';
import { Bell, CircleDot, Trash2, Settings2, Save } from 'lucide-react';
import api from '@/lib/api';
import TradingChart from '@/components/TradingChart';
import { getApiErrorMessage } from '@/lib/apiError';
import { useToastStore } from '@/lib/toastStore';

type AlertRow = {
    id: number;
    instrument: string;
    direction: string;
    alert_type?: string;
    price: number;
    created_at?: string;
    meta_json?: string;
};

type BotConfig = {
    bot_stoch_k: number;
    bot_stoch_d: number;
    bot_stoch_slowing: number;
    bot_rsi_period: number;
    bot_ema_fast: number;
    bot_ema_slow: number;
    bot_ema_filter: number;
    bot_swing_depth: number;
    bot_elliott_w3_ext: number;
    bot_elliott_w4_limit: number;
    bot_fib_margin: number;
    bot_cooldown_mins: number;
    bot_sideways_filter: boolean;
};

const timeAgo = (d: Date) => {
    const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    return `${days}d`;
};

export default function JadeBotPage() {
    const pushToast = useToastStore((s) => s.push);

    const [pairs, setPairs] = React.useState<string[]>([]);
    const [idx, setIdx] = React.useState(0);
    const [instrument, setInstrument] = React.useState('');
    const [alerts, setAlerts] = React.useState<AlertRow[]>([]);
    const [badPairs, setBadPairs] = React.useState<Record<string, boolean>>({});
    const [showConfig, setShowConfig] = React.useState(false);
    const [config, setConfig] = React.useState<BotConfig>({
        bot_stoch_k: 5,
        bot_stoch_d: 3,
        bot_stoch_slowing: 3,
        bot_rsi_period: 14,
        bot_ema_fast: 50,
        bot_ema_slow: 100,
        bot_ema_filter: 200,
        bot_swing_depth: 4,
        bot_elliott_w3_ext: 1.618,
        bot_elliott_w4_limit: 0.382,
        bot_fib_margin: 0.05,
        bot_cooldown_mins: 15,
        bot_sideways_filter: true,
    });
    const [fullConfig, setFullConfig] = React.useState<any>(null);

    const pauseUntilRef = React.useRef(0);

    const fetchPairs = async () => {
        const res = await api.get('/trading/config');
        const ins = (res.data?.instruments || []) as string[];
        setPairs(ins);
        if (!instrument && ins.length) {
            setInstrument(ins[0]);
            setIdx(0);
        }
    };

    const fetchBotConfig = async () => {
        try {
            const res = await api.get('/admin/config');
            const data = res.data;
            setFullConfig(data);
            setConfig({
                bot_stoch_k: data.bot_stoch_k || 5,
                bot_stoch_d: data.bot_stoch_d || 3,
                bot_stoch_slowing: data.bot_stoch_slowing || 3,
                bot_rsi_period: data.bot_rsi_period || 14,
                bot_ema_fast: data.bot_ema_fast || 50,
                bot_ema_slow: data.bot_ema_slow || 100,
                bot_ema_filter: data.bot_ema_filter || 200,
                bot_swing_depth: data.bot_swing_depth || 4,
                bot_elliott_w3_ext: data.bot_elliott_w3_ext || 1.618,
                bot_elliott_w4_limit: data.bot_elliott_w4_limit || 0.382,
                bot_fib_margin: data.bot_fib_margin || 0.05,
                bot_cooldown_mins: data.bot_cooldown_mins || 15,
                bot_sideways_filter: data.bot_sideways_filter ?? true,
            });
        } catch (err) {
            console.error('No se pudo cargar la config del bot', err);
        }
    };

    const saveBotConfig = async () => {
        if (!fullConfig) return;
        try {
            const payload = {
                ...fullConfig,
                ...config,
            };
            await api.put('/admin/config', payload);
            pushToast({ type: 'success', title: 'Configuración', message: 'Parámetros del bot actualizados.' });
            setShowConfig(false);
        } catch (err) {
            pushToast({ type: 'error', title: 'Configuración', message: getApiErrorMessage(err, 'No se pudo guardar.') });
        }
    };

    const fetchAlerts = async () => {
        const res = await api.get('/bot/alerts?limit=200');
        const rows = (res.data || []) as AlertRow[];
        const filtered = rows.filter((a) => {
            const t = String(a?.alert_type || '').toLowerCase();
            return t === 'near' || t === 'entry' || t === 'confirmed' || t === 'system';
        });
        setAlerts(filtered);
    };

    const purgeOld = async () => {
        if (!confirm('Eliminar alertas antiguas? Mantendra las ultimas 200.')) return;
        try {
            await api.post('/bot/alerts/purge?keep=200');
            await fetchAlerts();
        } catch (err) {
            pushToast({ type: 'error', title: 'Alertas', message: getApiErrorMessage(err, 'No se pudo limpiar.') });
        }
    };

    React.useEffect(() => {
        fetchPairs().catch((err) => pushToast({ type: 'error', title: 'Pares', message: getApiErrorMessage(err) }));
        fetchBotConfig().catch(() => { });
        fetchAlerts().catch(() => { });
    }, []);

    React.useEffect(() => {
        const id = window.setInterval(() => {
            fetchAlerts().catch(() => { });
        }, 5_000);
        return () => window.clearInterval(id);
    }, []);

    React.useEffect(() => {
        if (!pairs.length) return;
        const id = window.setInterval(() => {
            if (Date.now() < pauseUntilRef.current) return;
            setIdx((prev) => {
                let next = (prev + 1) % pairs.length;
                for (let i = 0; i < pairs.length; i++) {
                    const candidate = pairs[next];
                    if (!badPairs[candidate]) break;
                    next = (next + 1) % pairs.length;
                }
                return next;
            });
        }, 5_000);
        return () => window.clearInterval(id);
    }, [pairs.length, badPairs, pairs]);

    React.useEffect(() => {
        if (!pairs.length) return;
        const next = pairs[idx];
        if (next) setInstrument(next);
    }, [idx, pairs]);

    const alertsForPair = React.useMemo(() => {
        return alerts.filter((a) => a.instrument === instrument).slice(0, 20);
    }, [alerts, instrument]);

    const latestAlerts = React.useMemo(() => alerts.slice(0, 12), [alerts]);
    const hasAlerts = alerts.length > 0;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-9 bg-white rounded-3xl overflow-hidden border border-slate-200 min-w-0">
                <TradingChart
                    instrument={instrument}
                    variant="dark"
                    timeframe="5m"
                    onDataStatus={({ instrument: ins, ok }) => {
                        if (!ins) return;
                        if (!ok) {
                            setBadPairs((m) => ({ ...m, [ins]: true }));
                        }
                    }}
                />
            </div>

            <div className="lg:col-span-3 flex flex-col gap-6">
                <div className="bg-white rounded-3xl overflow-hidden border border-slate-200 min-w-0">
                    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <div className="text-[11px] font-black uppercase tracking-widest text-slate-600">Watchlist</div>
                        <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">Carousel 5s</div>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto">
                        {pairs.map((p, i) => {
                            const active = p === instrument;
                            const bad = !!badPairs[p];
                            return (
                                <button
                                    key={p}
                                    onClick={() => {
                                        setIdx(i);
                                        setInstrument(p);
                                        pauseUntilRef.current = Date.now() + 30_000;
                                    }}
                                    className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 flex items-center justify-between gap-3 ${active ? 'bg-slate-50' : ''}`}
                                    title={bad ? 'Sin datos' : ''}
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-black text-slate-900 truncate">{p}</div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            {bad ? 'no data' : 'm5'}
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        <CircleDot size={16} className={`${active ? 'text-emerald-600' : 'text-slate-300'}`} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white rounded-3xl overflow-hidden border border-slate-200 min-w-0">
                    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Bell size={16} className="text-slate-500" />
                            <div className="text-[11px] font-black uppercase tracking-widest text-slate-600">Alertas</div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={purgeOld} className="text-slate-400 hover:text-slate-900" title="Limpiar"><Trash2 size={16} /></button>
                            <button onClick={() => setShowConfig(!showConfig)} className={`hover:text-slate-900 ${showConfig ? 'text-emerald-600' : 'text-slate-400'}`} title="Configurar"><Settings2 size={16} /></button>
                        </div>
                    </div>

                    {showConfig ? (
                        <div className="p-4 space-y-4 border-b border-slate-100 bg-slate-50/50">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Stoch K</label>
                                    <input type="number" value={config.bot_stoch_k} onChange={e => setConfig({ ...config, bot_stoch_k: parseInt(e.target.value) })} className="w-full text-sm font-black p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Stoch D</label>
                                    <input type="number" value={config.bot_stoch_d} onChange={e => setConfig({ ...config, bot_stoch_d: parseInt(e.target.value) })} className="w-full text-sm font-black p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">RSI Per.</label>
                                    <input type="number" value={config.bot_rsi_period} onChange={e => setConfig({ ...config, bot_rsi_period: parseInt(e.target.value) })} className="w-full text-sm font-black p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">EMA Fast</label>
                                    <input type="number" value={config.bot_ema_fast} onChange={e => setConfig({ ...config, bot_ema_fast: parseInt(e.target.value) })} className="w-full text-sm font-black p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">EMA Slow</label>
                                    <input type="number" value={config.bot_ema_slow} onChange={e => setConfig({ ...config, bot_ema_slow: parseInt(e.target.value) })} className="w-full text-sm font-black p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">EMA Filter</label>
                                    <input type="number" value={config.bot_ema_filter} onChange={e => setConfig({ ...config, bot_ema_filter: parseInt(e.target.value) })} className="w-full text-sm font-black p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Swing Depth</label>
                                    <input type="number" value={config.bot_swing_depth} onChange={e => setConfig({ ...config, bot_swing_depth: parseInt(e.target.value) })} className="w-full text-sm font-black p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">W3 Ext.</label>
                                    <input type="number" step="0.1" value={config.bot_elliott_w3_ext} onChange={e => setConfig({ ...config, bot_elliott_w3_ext: parseFloat(e.target.value) })} className="w-full text-sm font-black p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">W4 Limit</label>
                                    <input type="number" step="0.1" value={config.bot_elliott_w4_limit} onChange={e => setConfig({ ...config, bot_elliott_w4_limit: parseFloat(e.target.value) })} className="w-full text-sm font-black p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Fib Margin</label>
                                    <input type="number" step="0.01" value={config.bot_fib_margin} onChange={e => setConfig({ ...config, bot_fib_margin: parseFloat(e.target.value) })} className="w-full text-sm font-black p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Cooldown (m)</label>
                                    <input type="number" value={config.bot_cooldown_mins} onChange={e => setConfig({ ...config, bot_cooldown_mins: parseInt(e.target.value) })} className="w-full text-sm font-black p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                                </div>
                                <div className="flex items-center gap-2 pt-4">
                                    <input type="checkbox" checked={config.bot_sideways_filter} onChange={e => setConfig({ ...config, bot_sideways_filter: e.target.checked })} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300" />
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sideways Filter</label>
                                </div>
                            </div>
                            <button onClick={saveBotConfig} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 rounded-xl flex items-center justify-center gap-2 transition-all">
                                <Save size={16} /> GUARDAR
                            </button>
                        </div>
                    ) : null}

                    <div className="max-h-[400px] overflow-y-auto">
                        {!hasAlerts ? (
                            <div className="py-10 text-center text-slate-400 font-bold text-sm">Sin alertas recientes.</div>
                        ) : (
                            latestAlerts.map((a) => {
                                const t = String(a.alert_type || '').toLowerCase();
                                const stage = t === 'near' ? 'CERCA' : t === 'confirmed' ? 'CONFIRMADO' : t === 'entry' ? 'ENTRAR' : t.toUpperCase();
                                const dt = a.created_at ? new Date(a.created_at) : null;
                                return (
                                    <button
                                        key={a.id}
                                        onClick={() => {
                                            const i = pairs.indexOf(a.instrument);
                                            if (i >= 0) setIdx(i);
                                            setInstrument(a.instrument);
                                            pauseUntilRef.current = Date.now() + 30_000;
                                        }}
                                        className="w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-black text-slate-900 truncate">{a.instrument}</div>
                                                <div className="text-[11px] font-bold text-slate-600">
                                                    {a.direction} • {stage} • {Number(a.price).toFixed(5)}
                                                </div>
                                            </div>
                                            <div className="text-[11px] font-black text-slate-500 shrink-0">{dt ? timeAgo(dt) : ''}</div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
