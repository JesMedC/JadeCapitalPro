"use client";

import React, { useState, useEffect } from 'react';
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    Activity,
    Clock,
    Target,
    Loader2,
    Calendar,
    ChevronDown
} from 'lucide-react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import TwoLineChart from '@/components/TwoLineChart';
import { getApiErrorMessage } from '@/lib/apiError';
import { useToastStore } from '@/lib/toastStore';
import {
    aggregateBySecond,
    buildLedgerEvents,
    computeOffsetFromCurrentBalance,
    dailyEquitySeriesForMonth,
    dailyEquitySeriesForLast4Weeks,
    daysInMonth,
    toSec,
    binaryNetResult,
    forexNetResult,
    balanceAt,
    computeFullProjection,
} from '@/lib/ledger';

export default function MetricsPage() {
    const pushToast = useToastStore((s) => s.push);
    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<any>(null);
    const [equityThis, setEquityThis] = useState<Array<{ time: number; value: number }>>([]);
    const [equityPrev, setEquityPrev] = useState<Array<{ time: number; value: number }>>([]);
    const [pnlThis, setPnlThis] = useState<Array<{ time: number; value: number }>>([]);
    const [pnlPrev, setPnlPrev] = useState<Array<{ time: number; value: number }>>([]);
    const [projectionPct, setProjectionPct] = useState<number>(0);
    const [stats, setStats] = useState<any>({
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        totalPnl: 0,
        avgWin: 0,
        avgLoss: 0,
        pnlCompare: 0,
        wrCompare: 0
    });
    const [wrEvolution, setWrEvolution] = useState<Array<{ time: number; value: number }>>([]);
    const [equityProjection, setEquityProjection] = useState<Array<{ time: number; value: number }>>([]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const [accRes, cfgRes] = await Promise.all([
                api.get('/trading/accounts'),
                api.get('/trading/config'),
            ]);
            setAccounts(accRes.data);
            setProjectionPct(Number(cfgRes.data?.daily_projection_pct || 0));
            if (accRes.data.length > 0) {
                const firstAcc = accRes.data[0];
                setSelectedAccount(firstAcc);
                fetchStats(firstAcc);
            }
        } catch (err) {
            pushToast({ type: 'error', title: 'Metricas', message: getApiErrorMessage(err, 'No se pudieron cargar las cuentas.') });
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async (acc: any) => {
        try {
            const [tradesRes, txRes] = await Promise.all([
                api.get(`/trading/trades/${acc.id}`),
                api.get(`/trading/transactions/${acc.id}`),
            ]);

            const binaryTrades = tradesRes.data?.binary || [];
            const forexTrades = tradesRes.data?.forex || [];
            const allTrades = [...binaryTrades, ...forexTrades];
            const closedTrades = allTrades.filter((t: any) => String(t.status || '').toLowerCase() !== 'open');

            const transactions = txRes.data || [];
            const events = buildLedgerEvents({ binaryTrades, forexTrades, transactions });
            const agg = aggregateBySecond(events);
            const offset = computeOffsetFromCurrentBalance(agg, Number(acc.balance || 0));

            const now = new Date();
            const fourWeeksAgo = new Date();
            fourWeeksAgo.setDate(now.getDate() - 28);
            const eightWeeksAgo = new Date();
            eightWeeksAgo.setDate(now.getDate() - 56);

            const thisSeries = dailyEquitySeriesForLast4Weeks(agg, offset, now);
            const prevSeriesRaw = dailyEquitySeriesForLast4Weeks(agg, offset, fourWeeksAgo);

            const prevMapped = thisSeries.map((p, i) => ({
                time: p.time,
                value: prevSeriesRaw[i]?.value || offset
            }));

            setEquityThis(thisSeries);
            setEquityPrev(prevMapped);

            const getPnlForPeriod = (start: Date, end: Date) => {
                let total = 0;
                for (const t of closedTrades) {
                    const dt = new Date(t.close_date);
                    if (dt >= start && dt <= end) {
                        total += (t.type === 'forex' ? forexNetResult(t) : binaryNetResult(t));
                    }
                }
                return total;
            };

            const getWinRateForPeriod = (start: Date, end: Date) => {
                const periodTrades = closedTrades.filter(t => {
                    const dt = new Date(t.close_date);
                    return dt >= start && dt <= end;
                });
                if (periodTrades.length === 0) return 0;
                const wins = periodTrades.filter(t => t.status === 'win').length;
                return (wins / periodTrades.length) * 100;
            };

            const pnlCurrent4 = getPnlForPeriod(fourWeeksAgo, now);
            const pnlPrev4 = getPnlForPeriod(eightWeeksAgo, fourWeeksAgo);
            const wrCurrent4 = getWinRateForPeriod(fourWeeksAgo, now);
            const wrPrev4 = getWinRateForPeriod(eightWeeksAgo, fourWeeksAgo);

            const getPointsForPnl = (start: Date, count: number, times: number[]) => {
                const pts = [];
                for (let i = 0; i < count; i++) {
                    const d = new Date(start);
                    d.setDate(d.getDate() + i);
                    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
                    const dEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
                    pts.push({ time: times[i], value: Number(getPnlForPeriod(dStart, dEnd).toFixed(2)) });
                }
                return pts;
            };

            const currentTimes = thisSeries.map(s => s.time);
            setPnlThis(getPointsForPnl(fourWeeksAgo, 28, currentTimes));
            setPnlPrev(getPointsForPnl(eightWeeksAgo, 28, currentTimes));

            if (closedTrades.length === 0) {
                setStats({ totalTrades: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgWin: 0, avgLoss: 0, pnlCompare: 0, wrCompare: 0 });
                return;
            }

            const wins = closedTrades.filter((t: any) => t.status === 'win').length;
            const losses = closedTrades.filter((t: any) => t.status === 'loss').length;
            const totalPnl = closedTrades.reduce(
                (acc2: number, t: any) => acc2 + (t.pnl || (t.status === 'win' ? t.investment * t.payout_pct : t.status === 'loss' ? -t.investment : 0)),
                0
            );

            setStats({
                totalTrades: closedTrades.length,
                winRate: ((wins / (wins + losses || 1)) * 100).toFixed(1),
                profitFactor: (wins / (losses || 1)).toFixed(2),
                totalPnl: totalPnl.toLocaleString(),
                avgWin: wins > 0 ? (totalPnl / wins).toFixed(2) : 0,
                avgLoss: losses > 0 ? (totalPnl / losses).toFixed(2) : 0,
                pnlCompare: (pnlCurrent4 - pnlPrev4).toFixed(2),
                wrCompare: (wrCurrent4 - wrPrev4).toFixed(1)
            });

            const sortedTrades = [...closedTrades].sort((a, b) => new Date(a.close_date).getTime() - new Date(b.close_date).getTime());
            const wrPoints: any[] = [];
            let cumulativeWins = 0;
            for (let i = 0; i < sortedTrades.length; i++) {
                if (sortedTrades[i].status === 'win') cumulativeWins++;
                wrPoints.push({
                    time: toSec(sortedTrades[i].close_date),
                    value: Number(((cumulativeWins / (i + 1)) * 100).toFixed(2))
                });
            }
            setWrEvolution(wrPoints);

            const proj = computeFullProjection(agg, offset);
            setEquityProjection(proj);
        } catch (err) {
            pushToast({ type: 'error', title: 'Métricas', message: getApiErrorMessage(err, 'No se pudieron calcular las métricas.') });
        }
    };

    return (
        <div className="space-y-10 pb-10">
            {/* Terminal Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 pb-8 border-b border-white/5">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
                        <span className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <BarChart3 className="text-emerald-500" size={24} />
                        </span>
                        Neural Performance Audit
                    </h1>
                    <p className="text-white/40 font-bold tracking-[0.2em] text-[10px] uppercase ml-14">
                        Advanced Analytics • Data Visualization Suite
                    </p>
                </div>

                <div className="flex items-center gap-4 bg-[#0B0E11] border border-white/5 p-1 rounded-2xl shadow-xl">
                    <div className="px-3 py-2 text-[10px] font-black uppercase text-white/30 border-r border-white/5">Source</div>
                    <select
                        className="bg-transparent text-sm font-black text-white px-4 py-2 outline-none cursor-pointer min-w-[180px]"
                        value={selectedAccount?.id || ''}
                        onChange={(e) => {
                            const acc = accounts.find(a => a.id === parseInt(e.target.value));
                            setSelectedAccount(acc);
                            fetchStats(acc);
                        }}
                    >
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id} className="bg-[#0B0E11] text-white">{acc.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="h-[60vh] flex flex-col items-center justify-center gap-6">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full border-t-2 border-emerald-500 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Activity className="text-emerald-500 animate-pulse" size={20} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 animate-pulse">Synchronizing Neural Patterns</p>
                </div>
            ) : (
                <>
                    {/* Primary Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <StatCard title="Total Network PnL" value={`$${stats.totalPnl}`} icon={TrendingUp} color="emerald" trend={stats.pnlCompare} />
                        <StatCard title="Overall Accuracy" value={`${stats.winRate}%`} icon={Target} color="emerald" trend={stats.wrCompare} />
                        <StatCard title="Profit Factor" value={stats.profitFactor} icon={Activity} color="white" />
                        <StatCard title="Total Cycles" value={stats.totalTrades} icon={Clock} color="zinc" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Win Rate Evolution */}
                        <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                            <div className="relative z-10 flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-1">Accuracy Evolution</h3>
                                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Cumulative success rate over time</p>
                                </div>
                                <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                                    <Target className="text-emerald-500" size={18} />
                                </div>
                            </div>
                            <div className="h-[300px]">
                                <TwoLineChart
                                    a={{ name: 'Accuracy %', color: '#10b981', points: wrEvolution }}
                                    type="histogram"
                                    height={280}
                                />
                            </div>
                        </div>

                        {/* Compound Benchmark */}
                        <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                            <div className="relative z-10 flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-1">Objective Benchmark</h3>
                                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Performance vs compound target</p>
                                </div>
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                    <span className="text-[9px] font-black text-emerald-500 uppercase">Target 1%/Day</span>
                                </div>
                            </div>
                            <div className="h-[300px]">
                                <TwoLineChart
                                    a={{ name: 'Target Baseline', color: '#2dd4bf', points: equityProjection }}
                                    b={{ name: 'Actual Realized', color: '#64748b', points: equityThis }}
                                    type="histogram"
                                    height={280}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Equity Comparison */}
                        <div className="lg:col-span-2 bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl overflow-hidden group">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-emerald-500">
                                        <Activity size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-1">Network Equity Pulse</h3>
                                        <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Last 4 Weeks vs Previous Period</p>
                                    </div>
                                </div>
                            </div>

                            <div className="h-[320px]">
                                <TwoLineChart
                                    a={{ name: 'Current Cycle', color: '#10b981', points: equityThis }}
                                    b={{ name: 'Prior Cycle', color: '#475569', points: equityPrev }}
                                    type="histogram"
                                    height={300}
                                />
                            </div>
                        </div>

                        {/* PnL Distribution */}
                        <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl overflow-hidden group">
                            <div className="mb-8">
                                <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] mb-1">PnL Delta Distribution</h3>
                                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Daily volatility comparison</p>
                            </div>
                            <div className="h-[320px]">
                                <TwoLineChart
                                    a={{ name: 'Current Cycle', color: '#10b981', points: pnlThis }}
                                    b={{ name: 'Prior Cycle', color: '#475569', points: pnlPrev }}
                                    type="histogram"
                                    height={300}
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

const StatCard = ({ title, value, icon: Icon, color, trend }: any) => {
    const colorClass =
        color === 'emerald' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]' :
            color === 'white' ? 'bg-white/5 text-white border-white/10' :
                'bg-white/2 text-white/40 border-white/5';

    return (
        <motion.div
            whileHover={{ y: -4 }}
            className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 transition-all duration-300 relative overflow-hidden group shadow-2xl"
        >
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                    <div className={`p-3 rounded-xl border transition-all duration-300 group-hover:scale-110 ${colorClass}`}>
                        <Icon size={20} />
                    </div>
                    {trend !== undefined && (
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${Number(trend) >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                            {Number(trend) >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {Number(trend) >= 0 ? '+' : ''}{trend}{title.includes('PnL') ? '$' : '%'}
                        </div>
                    )}
                </div>
                <p className="text-[9px] text-white/30 font-black uppercase tracking-[0.2em] mb-1">{title}</p>
                <h3 className="text-2xl font-black text-white tracking-tighter italic group-hover:text-emerald-500 transition-colors uppercase">{value}</h3>
            </div>

            <div className={`absolute -right-4 -bottom-4 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity ${Number(trend) >= 0 ? 'text-emerald-500' : 'text-white'}`}>
                <Icon size={120} />
            </div>
        </motion.div>
    );
};
