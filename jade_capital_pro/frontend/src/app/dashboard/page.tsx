"use client";

import React from 'react';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    Activity,
    ArrowUpRight,
    Users,
    BarChart,
    Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import api from '@/lib/api';
import EquityCurveChart, { type EquityPoint } from '@/components/EquityCurveChart';
import { useToastStore } from '@/lib/toastStore';
import { getApiErrorMessage } from '@/lib/apiError';
import {
    aggregateBySecond,
    balanceAt,
    buildLedgerEvents,
    computeOffsetFromCurrentBalance,
    dailyEquitySeriesForMonth,
    getSessionWindow,
    projectionSeriesForMonth,
    sessionNameForDate,
    binaryNetResult,
    forexNetResult,
    toSec,
} from '@/lib/ledger';

const StatCard = ({ title, value, change, icon: Icon, trend }: any) => (
    <motion.div
        whileHover={{ y: -4 }}
        className="bg-zinc-950 border border-white/5 p-6 rounded-3xl"
    >
        <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-zinc-900 rounded-2xl border border-white/5">
                <Icon className="w-6 h-6 text-teal-400" />
            </div>
            <div className={`flex items-center gap-1 text-xs font-bold ${trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
                {trend === 'up' ? <ArrowUpRight size={14} /> : <TrendingDown size={14} />}
                {change}
            </div>
        </div>
        <p className="text-zinc-500 text-sm font-medium">{title}</p>
        <h3 className="text-2xl font-bold mt-1">{value}</h3>
    </motion.div>
);

export default function DashboardPage() {
    const pushToast = useToastStore((s) => s.push);
    const [loading, setLoading] = React.useState(true);
    const [accounts, setAccounts] = React.useState<any[]>([]);
    const [selectedAccountId, setSelectedAccountId] = React.useState<number | null>(null);
    const selectedAccount = React.useMemo(
        () => accounts.find((a) => a.id === selectedAccountId) || null,
        [accounts, selectedAccountId]
    );

    const [dailyReal, setDailyReal] = React.useState<EquityPoint[]>([]);
    const [dailyProjected, setDailyProjected] = React.useState<EquityPoint[]>([]);
    const [dailyProjectionPct, setDailyProjectionPct] = React.useState<number>(0);

    const [recentTrades, setRecentTrades] = React.useState<any[]>([]);

    const [sessionInfo, setSessionInfo] = React.useState<{ name: string; pnl: number; pct: number } | null>(null);
    const [monthInfo, setMonthInfo] = React.useState<{ pnl: number; pct: number; start: number; end: number } | null>(null);
    const [winInfo, setWinInfo] = React.useState<{ wins: number; losses: number; winRate: number } | null>(null);

    const lastSessionBandByKey = React.useRef<Record<string, 'none' | 'up' | 'down'>>({});

    const loadAccountsAndConfig = async () => {
        const [accRes, cfgRes] = await Promise.all([
            api.get('/trading/accounts'),
            api.get('/trading/config'),
        ]);
        setAccounts(accRes.data || []);
        setDailyProjectionPct(Number(cfgRes.data?.daily_projection_pct || 0));
        if (!selectedAccountId && accRes.data?.length) {
            setSelectedAccountId(accRes.data[0].id);
        }
    };

    const loadAccountDashboard = async (accountId: number) => {
        const acc = (accounts || []).find((a) => a.id === accountId);
        if (!acc) return;

        const [tradesRes, txRes] = await Promise.all([
            api.get(`/trading/trades/${accountId}`),
            api.get(`/trading/transactions/${accountId}`),
        ]);

        const binaryTrades = tradesRes.data?.binary || [];
        const forexTrades = tradesRes.data?.forex || [];
        const txs = txRes.data || [];

        const allTrades = [...binaryTrades, ...forexTrades];
        const last5 = [...allTrades]
            .sort((a, b) => {
                const ta = new Date(a.close_date || a.open_date).getTime();
                const tb = new Date(b.close_date || b.open_date).getTime();
                return tb - ta;
            })
            .slice(0, 5);
        setRecentTrades(last5);

        const events = buildLedgerEvents({ binaryTrades, forexTrades, transactions: txs });
        const agg = aggregateBySecond(events);
        const offset = computeOffsetFromCurrentBalance(agg, Number(acc.balance || 0));

        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();

        const monthStart = new Date(y, m, 1, 0, 0, 0);
        const monthStartBal = balanceAt(agg, offset, toSec(monthStart) - 1);
        const monthDaily = dailyEquitySeriesForMonth(agg, offset, y, m);
        const monthProj = projectionSeriesForMonth({ year: y, month0: m, startBalance: monthStartBal, dailyPct: dailyProjectionPct });
        setDailyReal(monthDaily);
        setDailyProjected(monthProj);

        const monthEndBal = monthDaily.length ? monthDaily[monthDaily.length - 1].value : Number(acc.balance || 0);
        const monthPnl = Number((monthEndBal - monthStartBal).toFixed(2));
        const monthPct = monthStartBal ? Number(((monthPnl / monthStartBal) * 100).toFixed(2)) : 0;
        setMonthInfo({ pnl: monthPnl, pct: monthPct, start: monthStartBal, end: monthEndBal });

        const closed = allTrades.filter((t: any) => String(t.status || '').toLowerCase() !== 'open');
        const wins = closed.filter((t: any) => String(t.status || '').toLowerCase() === 'win').length;
        const losses = closed.filter((t: any) => String(t.status || '').toLowerCase() === 'loss').length;
        const winRate = wins + losses ? Number(((wins / (wins + losses)) * 100).toFixed(1)) : 0;
        setWinInfo({ wins, losses, winRate });

                const session = getSessionWindow(now);
                const sessionKey = `${accountId}:${session.start.toISOString()}`;
                let sessionStartBal = balanceAt(agg, offset, toSec(session.start) - 1);
                if (sessionStartBal <= 0) {
                    // Fallback: if no capital existed at session start (e.g. deposit later),
                    // use balance right after the first event inside the session.
                    const firstInSession = agg.find((p) => p.t >= toSec(session.start) && p.t < toSec(session.end));
                    if (firstInSession) {
                        sessionStartBal = balanceAt(agg, offset, firstInSession.t);
                    }
                }
                const sessionPnl = Number(
                    (
                        (binaryTrades || [])
                            .filter((t: any) => t.close_date && new Date(t.close_date) >= session.start && new Date(t.close_date) < session.end)
                            .reduce((acc2: number, t: any) => acc2 + binaryNetResult(t), 0) +
                        (forexTrades || [])
                            .filter((t: any) => t.close_date && new Date(t.close_date) >= session.start && new Date(t.close_date) < session.end)
                            .reduce((acc2: number, t: any) => acc2 + forexNetResult(t), 0)
                    ).toFixed(2)
                );
                const denom = sessionStartBal > 0 ? sessionStartBal : Number(acc.balance || 0) || 1;
                const sessionPct = Number(((sessionPnl / denom) * 100).toFixed(2));
                setSessionInfo({ name: session.name, pnl: sessionPnl, pct: sessionPct });

        const band: 'none' | 'up' | 'down' = sessionPct >= 5 ? 'up' : sessionPct <= -5 ? 'down' : 'none';
        const prevBand = lastSessionBandByKey.current[sessionKey] ?? 'none';
        if (band === 'none') {
            lastSessionBandByKey.current[sessionKey] = 'none';
        } else if (band !== prevBand) {
            lastSessionBandByKey.current[sessionKey] = band;
            pushToast({
                type: band === 'up' ? 'success' : 'error',
                title: 'Alerta de sesion',
                message: `Sesion ${session.name}: ${sessionPct >= 0 ? '+' : ''}${sessionPct}%`,
                timeoutMs: 9000,
            });
        }
    };

    React.useEffect(() => {
        setLoading(true);
        loadAccountsAndConfig()
            .catch((err) => pushToast({ type: 'error', title: 'Dashboard', message: getApiErrorMessage(err) }))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    React.useEffect(() => {
        if (!selectedAccountId) return;
        setLoading(true);
        loadAccountDashboard(selectedAccountId)
            .catch((err) => pushToast({ type: 'error', title: 'Dashboard', message: getApiErrorMessage(err) }))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAccountId, dailyProjectionPct, accounts.length]);

    React.useEffect(() => {
        if (!selectedAccountId) return;
        const id = window.setInterval(() => {
            loadAccountDashboard(selectedAccountId).catch(() => {
                // silent
            });
        }, 30_000);
        return () => window.clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAccountId, dailyProjectionPct, accounts.length]);

    return (
        <div className="space-y-8">
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight">Bienvenido, Jade</h1>
                    <p className="text-zinc-500 mt-1">Aquí tienes el resumen de tus operaciones hoy.</p>
                </div>
                <div className="flex gap-3">
                    <div className="bg-zinc-950 border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-white">
                        <select
                            className="bg-transparent outline-none"
                            value={selectedAccountId || ''}
                            onChange={(e) => setSelectedAccountId(Number(e.target.value))}
                        >
                            {(accounts || []).map((a) => (
                                <option key={a.id} value={a.id}>{a.name} ({a.market_type})</option>
                            ))}
                        </select>
                    </div>
                    <Link href="/dashboard/balance" className="bg-white text-black px-6 py-3 rounded-2xl font-bold text-sm hover:bg-zinc-200 transition-colors">
                        Nuevo Depósito
                    </Link>
                    <Link href="/dashboard/bot" className="bg-zinc-900 border border-white/10 text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-colors">
                        Ver Bot
                    </Link>
                </div>
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Balance"
                    value={selectedAccount ? `$${Number(selectedAccount.balance || 0).toLocaleString()}` : '--'}
                    change={monthInfo ? `${monthInfo.pct >= 0 ? '+' : ''}${monthInfo.pct}% (mes)` : '--'}
                    icon={DollarSign}
                    trend={monthInfo && monthInfo.pct >= 0 ? 'up' : 'down'}
                />
                <StatCard
                    title="Progreso Mes"
                    value={monthInfo ? `${monthInfo.pct >= 0 ? '+' : ''}${monthInfo.pct}%` : '--'}
                    change={monthInfo ? `${monthInfo.pnl >= 0 ? '+' : ''}$${Math.abs(monthInfo.pnl).toLocaleString()}` : '--'}
                    icon={Activity}
                    trend={monthInfo && monthInfo.pnl >= 0 ? 'up' : 'down'}
                />
                <StatCard
                    title="Win Rate"
                    value={winInfo ? `${winInfo.winRate}%` : '--'}
                    change={winInfo ? `${winInfo.wins}/${winInfo.losses}` : '--'}
                    icon={TrendingUp}
                    trend={winInfo && winInfo.winRate >= 50 ? 'up' : 'down'}
                />
                <StatCard
                    title="Sesion"
                    value={sessionInfo ? `${sessionInfo.pct >= 0 ? '+' : ''}${sessionInfo.pct}%` : '--'}
                    change={sessionInfo ? `${sessionInfo.pnl >= 0 ? '+' : ''}$${Math.abs(sessionInfo.pnl).toLocaleString()} (${sessionInfo.name})` : '--'}
                    icon={Clock}
                    trend={sessionInfo && sessionInfo.pct >= 0 ? 'up' : 'down'}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Performance Chart Placeholder */}
                <div className="lg:col-span-2 bg-zinc-950 border border-white/5 rounded-3xl p-8 h-[400px] relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <BarChart size={18} className="text-teal-400" />
                            <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Rendimiento Pro</span>
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Objetivo diario: {dailyProjectionPct}%</div>
                    </div>

                    {dailyReal.length ? (
                        <EquityCurveChart
                            points={dailyReal}
                            projectionPoints={dailyProjected}
                        />
                    ) : (
                        <div className="h-[330px] flex items-center justify-center text-zinc-600 font-bold">
                            Sin datos suficientes para graficar.
                        </div>
                    )}
                </div>

                {/* Recent Activity */}
                <div className="bg-zinc-950 border border-white/5 rounded-3xl p-8 flex flex-col">
                    <h3 className="text-lg font-bold mb-6">Actividad Reciente</h3>
                    <div className="space-y-6 flex-1">
                        {(recentTrades || []).map((t: any) => {
                            const status = String(t.status || '').toLowerCase();
                            const isWin = status === 'win';
                            const isLoss = status === 'loss';
                            const pnl = t.payout_pct !== undefined ? binaryNetResult(t) : forexNetResult(t);
                            const dt = new Date(t.close_date || t.open_date);
                            const sessionLabel = sessionNameForDate(new Date(t.open_date));
                            return (
                                <div key={`${t.id}-${t.open_date}`} className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isWin ? 'bg-emerald-500/10 text-emerald-500' : isLoss ? 'text-rose-500 bg-rose-500/10' : 'text-white/70 bg-white/5'}`}>
                                            {isWin ? <TrendingUp size={18} /> : isLoss ? <TrendingDown size={18} /> : <Activity size={18} />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm">{t.instrument} - {status.toUpperCase()}</p>
                                            <p className="text-xs text-zinc-500">Sesion {sessionLabel} • {dt.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <p className={`font-bold ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {status === 'open' ? '--' : `${pnl >= 0 ? '+' : '-'}$${Math.abs(Number(pnl || 0)).toLocaleString()}`}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                    <button className="mt-8 text-sm font-bold text-teal-400 hover:text-teal-300">Ver historial completo</button>
                </div>
            </div>
        </div>
    );
}
