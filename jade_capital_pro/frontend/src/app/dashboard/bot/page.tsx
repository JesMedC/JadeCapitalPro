"use client";

import React from 'react';
import { Bell, CircleDot, Trash2, Settings2, Save, Power, Clock, CheckCircle, XCircle, Activity, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
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
    status: string;
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
    bot_carousel_sec: number;
    bot_rsi_up: number;
    bot_rsi_down: number;
    bot_stoch_up: number;
    bot_stoch_down: number;
    bot_entry_rsi_up: number;
    bot_entry_rsi_down: number;
    bot_entry_stoch_up: number;
    bot_entry_stoch_down: number;
};

type CurrencyStrength = {
    currency: string;
    score: number;
    raw: number;
};

type StrengthPair = {
    pair: string;
    direction: string;
    strength: string;
    type: string;
};

type StrengthData = {
    strength: CurrencyStrength[];
    best_pairs: StrengthPair[];
    timestamp: string;
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

const AlertCountdown = ({ alert, onFinish }: { alert: AlertRow, onFinish: () => void }) => {
    const [timeLeft, setTimeLeft] = React.useState<number>(0);

    React.useEffect(() => {
        const calculate = () => {
            const now = Date.now();
            const created = alert.created_at ? new Date(alert.created_at).getTime() : now;
            const diff = Math.floor((created + 300000 - now) / 1000);
            if (diff <= 0) {
                setTimeLeft(0);
                onFinish();
                return false;
            }
            setTimeLeft(diff);
            return true;
        };

        calculate();
        const interval = setInterval(() => {
            if (!calculate()) clearInterval(interval);
        }, 1000);
        return () => clearInterval(interval);
    }, [alert.created_at, onFinish]);

    if (timeLeft <= 0) return null;

    const min = Math.floor(timeLeft / 60);
    const sec = timeLeft % 60;

    return (
        <div className="flex items-center gap-1.5 text-primary text-[10px] font-black bg-primary/10 px-2 py-1 rounded-lg border border-primary/20">
            <Clock size={12} className="animate-pulse" />
            {min}:{sec.toString().padStart(2, '0')}
        </div>
    );
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
        bot_carousel_sec: 10,
        bot_rsi_up: 80,
        bot_rsi_down: 20,
        bot_stoch_up: 80,
        bot_stoch_down: 20,
        bot_entry_rsi_up: 90,
        bot_entry_rsi_down: 10,
        bot_entry_stoch_up: 90,
        bot_entry_stoch_down: 10,
    });
    const [fullConfig, setFullConfig] = React.useState<any>(null);
    const [scannerRunning, setScannerRunning] = React.useState(false);
    const [evaluations, setEvaluations] = React.useState<Record<number, 'win' | 'loss' | 'waiting'>>({});
    const [strengthData, setStrengthData] = React.useState<StrengthData | null>(null);

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

    const fetchScannerStatus = async () => {
        try {
            const res = await api.get('/bot/scanner/status');
            setScannerRunning(!!res.data?.running);
        } catch (err) {
            console.error('Error fetching scanner status:', err);
        }
    };

    const toggleScanner = async () => {
        try {
            if (scannerRunning) {
                await api.post('/bot/scanner/stop');
                pushToast({ type: 'success', title: 'Scanner', message: 'Scanner detenido correctamente.' });
            } else {
                await api.post('/bot/scanner/start');
                pushToast({ type: 'success', title: 'Scanner', message: 'Scanner iniciado correctamente.' });
            }
            fetchScannerStatus();
        } catch (err) {
            pushToast({ type: 'error', title: 'Scanner', message: 'Error al cambiar estado del scanner.' });
        }
    };

    const fetchBotConfig = async () => {
        const fetchWithRetry = async (retries = 3, delay = 1000) => {
            for (let i = 0; i < retries; i++) {
                try {
                    return await api.get('/admin/config');
                } catch (err: any) {
                    if (i === retries - 1) throw err;
                    await new Promise(r => setTimeout(r, delay * (i + 1)));
                }
            }
        };

        try {
            const res = await fetchWithRetry();
            if (!res) return;
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
                bot_carousel_sec: data.bot_carousel_sec || 10,
                bot_rsi_up: data.bot_rsi_up || 80,
                bot_rsi_down: data.bot_rsi_down || 20,
                bot_stoch_up: data.bot_stoch_up || 80,
                bot_stoch_down: data.bot_stoch_down || 20,
                bot_entry_rsi_up: data.bot_entry_rsi_up || 90,
                bot_entry_rsi_down: data.bot_entry_rsi_down || 10,
                bot_entry_stoch_up: data.bot_entry_stoch_up || 90,
                bot_entry_stoch_down: data.bot_entry_stoch_down || 10,
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

        // Populate evaluations from DB status
        const newEvals: any = {};
        rows.forEach((a: any) => {
            if (a.status === 'win' || a.status === 'loss') {
                newEvals[a.id] = a.status;
            }
        });
        setEvaluations((prev) => ({ ...prev, ...newEvals }));
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

    const fetchStrength = async () => {
        try {
            const res = await api.get('/bot/currency-strength');
            setStrengthData(res.data);
        } catch (err) {
            console.warn('Strength fetch fail:', err);
        }
    };

    React.useEffect(() => {
        fetchPairs().catch((err) => pushToast({ type: 'error', title: 'Pares', message: getApiErrorMessage(err) }));
        fetchBotConfig().catch(() => { });
        fetchAlerts().catch(() => { });
        fetchScannerStatus().catch(() => { });
        fetchStrength().catch(() => { });
    }, []);

    React.useEffect(() => {
        const id = window.setInterval(() => {
            if (scannerRunning) {
                fetchAlerts().catch(() => { });
            }
        }, 5_000);

        const sid = window.setInterval(() => {
            fetchStrength().catch(() => { });
        }, 60_000);

        return () => {
            window.clearInterval(id);
            window.clearInterval(sid);
        };
    }, [scannerRunning]);

    React.useEffect(() => {
        if (!pairs.length || !scannerRunning) return;
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
        }, (config.bot_carousel_sec || 10) * 1000);
        return () => window.clearInterval(id);
    }, [pairs.length, badPairs, pairs, scannerRunning]);

    React.useEffect(() => {
        if (!pairs.length) return;
        const next = pairs[idx];
        if (next) setInstrument(next);
    }, [idx, pairs]);

    const evaluateAlert = async (alert: AlertRow) => {
        if (!alert.created_at || evaluations[alert.id]) return;

        const fetchWithRetry = async (retries = 3, delay = 1000) => {
            for (let i = 0; i < retries; i++) {
                try {
                    return await api.get(`/bot/market/candles?instrument=${alert.instrument}&expiry_time=1m&limit=30`);
                } catch (err: any) {
                    if (i === retries - 1) throw err;
                    await new Promise(r => setTimeout(r, delay * (i + 1)));
                }
            }
        };

        try {
            const res = await fetchWithRetry();
            if (!res) return;
            const candles = res.data?.candles || [];
            if (!candles.length) return;

            const alertTime = new Date(alert.created_at).getTime();
            const targetTime = alertTime + 5 * 60 * 1000;
            const targetCandle = candles.find((c: any) => new Date(c.time).getTime() >= targetTime);
            if (!targetCandle) return;

            const finalPrice = targetCandle.close;
            const dir = alert.direction.toLowerCase();
            const isCall = dir.includes('call') || dir.includes('compra') || dir.includes('up');

            let result: 'win' | 'loss' = (isCall ? (finalPrice > alert.price) : (finalPrice < alert.price)) ? 'win' : 'loss';
            setEvaluations(prev => ({ ...prev, [alert.id]: result }));
        } catch (err) {
            // Handle Network Error or transient issues with a silent log if caught
            console.warn('Silent fail/Network issue in evaluateAlert:', err);
        }
    };

    const alertsForPair = React.useMemo(() => {
        return alerts.filter((a) => a.instrument === instrument).slice(0, 20);
    }, [alerts, instrument]);

    const latestAlerts = React.useMemo(() => alerts.slice(0, 12), [alerts]);
    const hasAlerts = alerts.length > 0;

    const renderStrengthPanel = () => {
        if (!strengthData) return null;
        return (
            <div className="mb-6 grid grid-cols-1 xl:grid-cols-4 gap-4">
                <div className="xl:col-span-3 bg-[#0B0E11] border border-white/5 rounded-[24px] p-5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                    <div className="flex items-center justify-between mb-6 relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-xl">
                                <Activity className="text-primary" size={18} />
                            </div>
                            <div>
                                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Market Intelligence</h3>
                                <p className="text-xs font-black text-white uppercase tracking-wider">Currency Heatmap Index</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-lg">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[9px] font-bold uppercase tracking-widest text-white/60">Live Feed</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 relative z-10">
                        {strengthData.strength.map((s) => (
                            <div key={s.currency} className="flex flex-col items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all group/item">
                                <span className="text-xs font-black text-white/80 group-hover/item:text-primary transition-colors">{s.currency}</span>
                                <div className="w-full h-20 bg-white/5 rounded-xl relative overflow-hidden flex flex-col justify-end p-1">
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${s.score * 10}%` }}
                                        className={`w-full rounded-lg transition-all duration-700 ${s.score > 7 ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]' :
                                            s.score > 4 ? 'bg-gradient-to-t from-primary/80 to-primary shadow-[0_0_15px_rgba(6,182,212,0.3)]' :
                                                'bg-gradient-to-t from-rose-600/60 to-rose-400/60'
                                            }`}
                                    />
                                </div>
                                <div className="text-[10px] font-black text-white tabular-nums">{s.score.toFixed(1)}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-[#0B0E11] border border-white/5 rounded-[24px] p-5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
                    <div className="flex items-center gap-3 mb-6 relative z-10">
                        <div className="p-2 bg-emerald-500/10 rounded-xl">
                            <TrendingUp className="text-emerald-500" size={18} />
                        </div>
                        <div>
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Alpha Signals</h3>
                            <p className="text-xs font-black text-white uppercase tracking-wider">Top Pair Arbitrage</p>
                        </div>
                    </div>
                    <div className="space-y-3 relative z-10">
                        {strengthData.best_pairs.map((bp) => (
                            <div key={bp.pair} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between group hover:border-emerald-500/30 transition-all cursor-pointer">
                                <div>
                                    <div className="text-xs font-black text-white group-hover:text-emerald-400 transition-colors tracking-tight">{bp.pair}</div>
                                    <div className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{bp.type} • {bp.strength}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-1">{bp.direction}</div>
                                    <div className="px-1.5 py-0.5 bg-emerald-500/10 rounded text-[7px] font-black text-emerald-500 border border-emerald-500/20 uppercase">Premium</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#080A0C] p-4 text-white font-sans antialiased">
            {/* Premium Header / Command Bar */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-6 px-4 py-4 bg-[#0B0E11]/60 backdrop-blur-xl border border-white/5 rounded-[32px] shadow-2xl">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 group px-4 py-2 bg-gradient-to-r from-emerald-500/10 to-transparent rounded-2xl border border-emerald-500/20">
                        <div className="relative">
                            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center font-black text-black shadow-[0_0_20px_rgba(16,185,129,0.4)] group-hover:scale-110 transition-transform cursor-pointer">
                                J
                            </div>
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#0B0E11] animate-pulse" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tighter uppercase italic leading-none text-white">Jade <span className="text-emerald-500 not-italic">Capital</span></h1>
                            <p className="text-[8px] font-bold text-emerald-500/60 uppercase tracking-[0.3em] mt-1">Trading Technologies</p>
                        </div>
                    </div>

                    <div className="h-10 w-[1px] bg-white/5 hidden lg:block" />

                    <div className="hidden xl:flex items-center gap-8">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Active Intelligence</p>
                                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                            </div>
                            <p className="text-sm font-black text-white tabular-nums">{pairs.length} <span className="text-[10px] text-white/40 font-bold uppercase ml-1">Pair Scanner</span></p>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Alpha Sentiment</p>
                                <motion.span
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                    className="w-1 h-1 rounded-full bg-primary"
                                />
                            </div>
                            <p className="text-sm font-black text-primary uppercase">Risk-On Mode</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end mr-4 hidden sm:block">
                        <div className="text-[9px] font-black text-white/40 uppercase tracking-widest">Global Status</div>
                        <div className="text-[10px] font-black text-emerald-500 uppercase flex items-center gap-1.5">
                            <CheckCircle size={10} /> Nodes Synced
                        </div>
                    </div>

                    <button
                        onClick={toggleScanner}
                        className={`group flex items-center gap-3 px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all border shadow-lg ${scannerRunning
                            ? 'bg-emerald-500 text-black border-emerald-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                            : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                            }`}
                    >
                        <Power size={14} className={scannerRunning ? 'animate-pulse' : ''} />
                        {scannerRunning ? 'Scanner Online' : 'Start Scanner'}
                    </button>

                    <button
                        onClick={() => setShowConfig(!showConfig)}
                        className={`p-3 border rounded-2xl transition-all shadow-lg ${showConfig ? 'bg-primary text-black border-primary' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                    >
                        <Settings2 size={20} />
                    </button>
                </div>
            </div>

            {renderStrengthPanel()}

            {/* Dashboard Workspace */}
            <div className="flex flex-col lg:flex-row gap-6 flex-1">
                {/* Visual Analysis Group (Left) */}
                <div className="flex-1 flex flex-col gap-6">
                    {/* Full Width Main Viewport */}
                    <div className="w-full">
                        <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl relative h-[650px] flex flex-col">
                            <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
                                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-3">
                                    <span className="text-sm font-black text-white">{instrument}</span>
                                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase tracking-tighter">M5 Scanner Active</span>
                                </div>
                            </div>
                            <div className="flex-1 min-h-0">
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
                        </div>
                    </div>

                    {/* Bot Strategy Controls (Permanent Card) */}
                    <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-6 shadow-xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                        <div className="flex items-center justify-between mb-6 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-xl">
                                    <Settings2 size={18} className="text-primary" />
                                </div>
                                <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Strategy Command Center</h3>
                            </div>
                            <button onClick={saveBotConfig} className="flex items-center gap-2 px-4 py-1.5 bg-primary text-black rounded-xl font-black text-[10px] uppercase hover:scale-105 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                                <Save size={14} /> Commit Changes
                            </button>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
                            {[
                                { l: 'RSI Period', k: 'bot_rsi_period' },
                                { l: 'EMA Filter', k: 'bot_ema_filter' },
                                { l: 'EMA Fast', k: 'bot_ema_fast' },
                                { l: 'EMA Slow', k: 'bot_ema_slow' },
                                { l: 'Stoch K', k: 'bot_stoch_k' },
                                { l: 'Stoch D', k: 'bot_stoch_d' },
                                { l: 'Entry RSI Call', k: 'bot_entry_rsi_down' },
                                { l: 'Entry RSI Put', k: 'bot_entry_rsi_up' },
                            ].map(f => (
                                <div key={f.k} className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-white/30 uppercase tracking-widest block">{f.l}</label>
                                    <input
                                        type="number"
                                        value={(config as any)[f.k]}
                                        onChange={e => setConfig({ ...config, [f.k]: parseInt(e.target.value) })}
                                        className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-2.5 text-xs font-black text-white focus:border-primary/50 focus:bg-white/[0.05] outline-none transition-all"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 flex items-center justify-between pt-6 border-t border-white/5">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-3 bg-white/[0.02] p-2.5 rounded-2xl border border-white/5">
                                    <input type="checkbox" checked={config.bot_sideways_filter} onChange={e => setConfig({ ...config, bot_sideways_filter: e.target.checked })} className="w-4 h-4 rounded bg-black border-white/20 text-primary focus:ring-primary" />
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-white tracking-widest leading-none mb-1">Volatility Filter</p>
                                        <p className="text-[8px] text-white/40 uppercase font-bold italic">Prevents execution in flat zones</p>
                                    </div>
                                </div>
                            </div>
                            <div className="text-[9px] font-bold text-white/20 uppercase tracking-widest italic">Manual Override Controls Enabled</div>
                        </div>
                    </div>
                </div>

                {/* Operations & Logs (Right Sidebar) */}
                <div className="w-full lg:w-[400px] flex flex-col gap-6">
                    {/* Market Universe */}
                    <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] overflow-hidden flex flex-col h-[350px]">
                        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Market Universe</h3>
                            <span className="text-[8px] font-black bg-white/5 px-2 py-0.5 rounded-full text-white/40">{pairs.length} ACTIVE</span>
                        </div>
                        <div className="flex-1 overflow-y-auto scrollbar-hide py-2">
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
                                        className={`w-full group px-6 py-3 flex items-center justify-between transition-all border-l-2 ${active ? 'bg-primary/5 border-primary' : 'border-transparent hover:bg-white/[0.02]'}`}
                                    >
                                        <div className="flex flex-col items-start leading-none gap-1">
                                            <span className={`text-[13px] font-black transition-colors ${active ? 'text-primary' : 'text-white/60 group-hover:text-white'}`}>{p}</span>
                                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{bad ? 'No Data' : 'Live Stream'}</span>
                                        </div>
                                        {active && (
                                            <motion.div layoutId="activeDot" className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Execution Logs - ACTIVE SIGNALS */}
                    <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] flex flex-col overflow-hidden h-[450px]">
                        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                            <div className="flex items-center gap-2">
                                <Bell size={14} className="text-emerald-500 animate-pulse" />
                                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500">Live Signals</h3>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {alerts.filter(a => {
                                const now = Date.now();
                                const created = a.created_at ? new Date(a.created_at).getTime() : now;
                                return (now - created) < 300000; // 5 mins
                            }).length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center opacity-20 py-10">
                                    <Activity size={32} className="mb-4" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest italic">Scanning Market...</p>
                                </div>
                            ) : (
                                alerts.filter(a => {
                                    const now = Date.now();
                                    const created = a.created_at ? new Date(a.created_at).getTime() : now;
                                    return (now - created) < 300000;
                                }).map(renderAlertCard)
                            )}
                        </div>
                    </div>

                    {/* Execution Logs - VENCIDAS / HISTORY */}
                    <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] flex flex-col overflow-hidden h-[350px] opacity-70 hover:opacity-100 transition-opacity">
                        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                            <div className="flex items-center gap-2">
                                <Clock size={14} className="text-white/30" />
                                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Signals History (Vencidas)</h3>
                            </div>
                            <button onClick={purgeOld} className="p-1.5 hover:bg-white/5 rounded-lg text-white/30 transition-all hover:text-rose-500"><Trash2 size={14} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-black/20">
                            {alerts.filter(a => {
                                const now = Date.now();
                                const created = a.created_at ? new Date(a.created_at).getTime() : now;
                                return (now - created) >= 300000;
                            }).length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center opacity-10 py-10">
                                    <p className="text-[8px] font-bold uppercase tracking-[0.2em]">Archive Empty</p>
                                </div>
                            ) : (
                                alerts.filter(a => {
                                    const now = Date.now();
                                    const created = a.created_at ? new Date(a.created_at).getTime() : now;
                                    return (now - created) >= 300000;
                                }).map(renderAlertCard)
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    function renderAlertCard(a: AlertRow) {
        const t = String(a.alert_type || '').toLowerCase();
        const isEntry = t === 'entry';
        const isConfirmed = t === 'confirmed';
        const dt = a.created_at ? new Date(a.created_at) : null;
        const evaluation = evaluations[a.id];
        const isCall = a.direction.toLowerCase().includes('call') || a.direction.toLowerCase().includes('compra') || a.direction.toLowerCase().includes('up');

        return (
            <motion.div
                key={a.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => {
                    const i = pairs.indexOf(a.instrument);
                    if (i >= 0) setIdx(i);
                    setInstrument(a.instrument);
                    pauseUntilRef.current = Date.now() + 30_000;
                }}
                className="group relative p-3 rounded-2xl bg-white/[0.01] border border-white/5 hover:border-white/10 transition-all cursor-pointer overflow-hidden"
            >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${isCall ? 'bg-emerald-500' : 'bg-rose-500'} opacity-40`} />
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-white tabular-nums tracking-tight">{a.instrument}</span>
                        <div className={`text-[7px] font-black px-1.5 py-0.5 rounded uppercase ${isEntry ? 'bg-emerald-500 text-black' :
                            isConfirmed ? 'bg-primary text-black' :
                                'bg-white/10 text-white/50'
                            }`}>
                            {isEntry ? 'EXECUTING' : isConfirmed ? 'CONFIRMED' : 'LOGGING'}
                        </div>
                    </div>
                    <span className="text-[8px] font-bold text-white/20 tabular-nums uppercase">{dt ? timeAgo(dt) : ''}</span>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className={`text-[9px] font-black uppercase ${isCall ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {isCall ? 'CALL' : 'PUT'} • {Number(a.price).toFixed(5)}
                        </span>
                    </div>
                    {evaluation ? (
                        <div className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${evaluation === 'win' ? 'text-emerald-500 bg-emerald-500/10' : 'text-rose-500 bg-rose-500/10'
                            }`}>
                            {evaluation === 'win' ? '✓ PROFT' : '✗ LOSS'}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                            <span className="text-[8px] font-black text-primary/60 uppercase">Watching</span>
                        </div>
                    )}
                </div>
            </motion.div>
        );
    }
}
