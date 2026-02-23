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
    Clock,
    LayoutDashboard
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import api from '@/lib/api';
import TwoLineChart from '@/components/TwoLineChart';
import SessionShareCard from '@/components/SessionShareCard';
import { useToastStore } from '@/lib/toastStore';
import { getApiErrorMessage } from '@/lib/apiError';
import {
    aggregateBySecond,
    balanceAt,
    buildLedgerEvents,
    computeOffsetFromCurrentBalance,
    dailyEquitySeriesForMonth,
    getSessionWindow,
    sessionNameForDate,
    binaryNetResult,
    forexNetResult,
    toSec,
    computeFullProjection,
    computeDailyReal,
} from '@/lib/ledger';

const StatCard = ({ title, value, change, icon: Icon, trend }: any) => (
    <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        className="bg-card border border-border p-8 rounded-[40px] transition-all duration-300 relative overflow-hidden group shadow-sm hover:shadow-xl hover:shadow-primary/5"
    >
        <div className="relative z-10">
            <div className="flex justify-between items-start mb-6">
                <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary group-hover:scale-110 transition-transform duration-300">
                    <Icon className="w-6 h-6" />
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${trend === 'up' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    {trend === 'up' ? <ArrowUpRight size={12} /> : <TrendingDown size={12} />}
                    {change}
                </div>
            </div>

            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">{title}</p>
            <div className="flex items-center gap-2">
                <h3 className="text-3xl font-black text-foreground tracking-tighter">{value}</h3>
                {trend === 'up' ? (
                    <TrendingUp className="text-emerald-500 w-6 h-6" />
                ) : (
                    <TrendingDown className="text-rose-500 w-6 h-6" />
                )}
            </div>
        </div>

        {/* Subtle background decoration */}
        <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
            <Icon size={120} />
        </div>
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

    const [dailyReal, setDailyReal] = React.useState<any[]>([]);
    const [fullProjected, setFullProjected] = React.useState<any[]>([]);
    const [dailyPnl, setDailyPnl] = React.useState<any[]>([]);
    const [dailyProjectionPct, setDailyProjectionPct] = React.useState<number>(0);

    const [recentTrades, setRecentTrades] = React.useState<any[]>([]);

    const [sessionInfo, setSessionInfo] = React.useState<{ name: string; pnl: number; pct: number; wins: number; losses: number; winRate: number } | null>(null);
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
        const fullProj = computeFullProjection(agg, offset, dailyProjectionPct);
        const fullReal = computeDailyReal(agg, offset);
        const monthDaily = dailyEquitySeriesForMonth(agg, offset, y, m);

        setDailyReal(fullReal);
        setFullProjected(fullProj);

        // Calculate Daily PnL for histogram
        const pnlPts = monthDaily.map((p, i) => {
            const prev = i === 0 ? monthStartBal : monthDaily[i - 1].value;
            return { time: p.time, value: Number((p.value - prev).toFixed(2)) };
        });
        setDailyPnl(pnlPts);

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

        const sessionTrades = closed.filter(t => new Date(t.close_date) >= session.start && new Date(t.close_date) < session.end);
        const sWins = sessionTrades.filter(t => t.status === 'win').length;
        const sLosses = sessionTrades.filter(t => t.status === 'loss').length;
        const sWR = sWins + sLosses ? Number(((sWins / (sWins + sLosses)) * 100).toFixed(1)) : 0;

        setSessionInfo({ name: session.name, pnl: sessionPnl, pct: sessionPct, wins: sWins, losses: sLosses, winRate: sWR });

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
        <div className="space-y-10">
            {/* Page header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 pb-8 border-b border-white/5">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
                        <span className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <LayoutDashboard className="text-emerald-500" size={24} />
                        </span>
                        Master Command Summary
                    </h1>
                    <p className="text-white/40 font-bold tracking-[0.2em] text-[10px] uppercase ml-14">
                        Secure Neural Interface • Node 0.20-PRO
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <div className="bg-[#0B0E11] border border-white/5 rounded-2xl p-1 transition-all flex items-center shadow-lg">
                        <div className="px-3 py-2 text-[10px] font-black uppercase text-white/30 border-r border-white/5">Account</div>
                        <select
                            className="bg-transparent border-none outline-none px-4 py-2 text-sm font-black text-white cursor-pointer min-w-[200px]"
                            value={selectedAccountId || ''}
                            onChange={(e) => setSelectedAccountId(Number(e.target.value))}
                        >
                            {(accounts || []).map((a) => (
                                <option key={a.id} value={a.id}>{a.name} ({a.market_type})</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link href="/dashboard/balance" className="group h-12 flex items-center gap-3 px-6 bg-emerald-500 text-black rounded-2xl font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                            <DollarSign size={16} /> Fund Account
                        </Link>
                        <Link href="/dashboard/bot" className="h-12 flex items-center gap-3 px-6 bg-white/[0.03] border border-white/5 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-white/10 transition-all">
                            <Activity size={16} className="text-emerald-500" /> Jade Bot
                        </Link>
                    </div>
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Real Capital"
                    value={selectedAccount ? `$${Number(selectedAccount.balance || 0).toLocaleString()}` : '--'}
                    change={monthInfo ? `${monthInfo.pct >= 0 ? '+' : ''}${monthInfo.pct}% MTD` : '--'}
                    icon={DollarSign}
                    trend={monthInfo && monthInfo.pct >= 0 ? 'up' : 'down'}
                />
                <StatCard
                    title="Neural Profit"
                    value={monthInfo ? `${monthInfo.pct >= 0 ? '+' : ''}${monthInfo.pct}%` : '--'}
                    change={monthInfo ? `${monthInfo.pnl >= 0 ? '+' : ''}$${Math.abs(monthInfo.pnl).toLocaleString()}` : '--'}
                    icon={Activity}
                    trend={monthInfo && monthInfo.pnl >= 0 ? 'up' : 'down'}
                />
                <StatCard
                    title="Win Accuracy"
                    value={winInfo ? `${winInfo.winRate}%` : '--'}
                    change={winInfo ? `${winInfo.wins}W / ${winInfo.losses}L` : '--'}
                    icon={TrendingUp}
                    trend={winInfo && winInfo.winRate >= 50 ? 'up' : 'down'}
                />
                <StatCard
                    title="Current Session"
                    value={sessionInfo ? `${sessionInfo.pct >= 0 ? '+' : ''}${sessionInfo.pct}%` : '--'}
                    change={sessionInfo ? `${sessionInfo.pnl >= 0 ? '+' : ''}$${Math.abs(sessionInfo.pnl).toLocaleString()} (${sessionInfo.name})` : '--'}
                    icon={Clock}
                    trend={sessionInfo && sessionInfo.pct >= 0 ? 'up' : 'down'}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Performance Analytics */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Growth Projection */}
                    <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] pointer-events-none" />
                        <div className="flex items-center justify-between mb-8 relative z-10">
                            <div>
                                <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-1">Compound Intelligence</h3>
                                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Growth vs {dailyProjectionPct}% Baseline Target</p>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] border border-white/5 rounded-xl">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] font-black text-white/60 uppercase">Real-Time Sync</span>
                            </div>
                        </div>

                        <div className="h-[350px]">
                            {fullProjected.length ? (
                                <TwoLineChart
                                    a={{ name: `Target ${dailyProjectionPct}%`, color: '#10b981', points: fullProjected }}
                                    b={{ name: 'Actual Performance', color: '#64748b', points: dailyReal }}
                                    type="histogram"
                                    height={300}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center text-white/20 font-black italic text-xs uppercase tracking-widest">
                                    Simulating Compound Scenarios...
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Volatility Analysis */}
                    <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl overflow-hidden relative group">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-1">Consistency Pulse</h3>
                                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">MTD Daily PnL Distribution</p>
                            </div>
                        </div>

                        <div className="h-[350px]">
                            <TwoLineChart
                                a={{ name: 'Daily Pulse', color: '#10b981', points: dailyPnl }}
                                type="histogram"
                                height={300}
                            />
                        </div>
                    </div>
                </div>

                {/* Right Action Stack */}
                <div className="lg:col-span-1 space-y-8">
                    {sessionInfo && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-700">
                            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-4 ml-4">Neural Performance Share</h3>
                            <SessionShareCard
                                wins={sessionInfo.wins}
                                losses={sessionInfo.losses}
                                winRate={sessionInfo.winRate}
                                pnl={sessionInfo.pnl}
                                sessionName={sessionInfo.name}
                            />
                        </div>
                    )}

                    <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl flex flex-col min-h-[500px]">
                        <div className="mb-8 flex items-center justify-between">
                            <div>
                                <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-1">Execution Logs</h3>
                                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Latest Network Activity</p>
                            </div>
                            <Link href="/dashboard/reports" className="p-2 hover:bg-white/5 rounded-xl text-white/30 transition-all hover:text-emerald-500">
                                <ArrowUpRight size={18} />
                            </Link>
                        </div>

                        <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2">
                            {(recentTrades || []).map((t: any) => {
                                const status = String(t.status || '').toLowerCase();
                                const isWin = status === 'win';
                                const isLoss = status === 'loss';
                                const pnl = t.payout_pct !== undefined ? binaryNetResult(t) : forexNetResult(t);
                                const dt = new Date(t.close_date || t.open_date);
                                const sessionLabel = sessionNameForDate(new Date(t.open_date));
                                return (
                                    <div
                                        key={`${t.id}-${t.open_date}`}
                                        className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-emerald-500/20 transition-all cursor-default group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isWin ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : isLoss ? 'text-rose-500 bg-rose-500/10 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]' : 'text-white/40 bg-white/5 border border-white/5'}`}>
                                                {isWin ? <ArrowUpRight size={18} /> : isLoss ? <TrendingDown size={18} /> : <Activity size={18} />}
                                            </div>
                                            <div>
                                                <p className="font-black text-xs text-white tracking-tight group-hover:text-emerald-500 transition-colors">{t.instrument}</p>
                                                <p className="text-[9px] text-white/20 font-black uppercase tracking-widest">{sessionLabel} • {dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-black tracking-tighter text-sm ${status === 'open' ? 'text-white' : pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                {status === 'open' ? 'OPEN' : `${pnl >= 0 ? '+' : '-'}$${Math.abs(Number(pnl || 0)).toLocaleString()}`}
                                            </p>
                                            <p className="text-[8px] font-black uppercase tracking-tighter text-white/20 leading-none mt-1">{status}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <Link href="/dashboard/reports" className="mt-8 group flex items-center justify-center gap-3 py-4 bg-white/[0.03] border border-white/5 rounded-2xl hover:bg-emerald-500/10 hover:border-emerald-500/20 transition-all text-xs font-black uppercase tracking-[0.2em] text-white/30 hover:text-emerald-500">
                            Full Terminal Logs
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
