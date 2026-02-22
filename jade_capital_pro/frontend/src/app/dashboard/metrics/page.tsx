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
import api from '@/lib/api';
import TwoLineChart from '@/components/TwoLineChart';
import { getApiErrorMessage } from '@/lib/apiError';
import { useToastStore } from '@/lib/toastStore';
import {
    aggregateBySecond,
    buildLedgerEvents,
    computeOffsetFromCurrentBalance,
    dailyEquitySeriesForMonth,
    daysInMonth,
    toSec,
    binaryNetResult,
    forexNetResult,
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
        avgLoss: 0
    });

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
            const y = now.getFullYear();
            const m = now.getMonth();
            const prev = new Date(y, m - 1, 1);
            const yPrev = prev.getFullYear();
            const mPrev = prev.getMonth();

            const thisDaily = dailyEquitySeriesForMonth(agg, offset, y, m);
            const prevDailyRaw = dailyEquitySeriesForMonth(agg, offset, yPrev, mPrev);

            const prevValues = prevDailyRaw.map((p) => p.value);
            const prevMapped: Array<{ time: number; value: number }> = [];
            for (let i = 0; i < thisDaily.length; i++) {
                if (i >= prevValues.length) break;
                prevMapped.push({ time: thisDaily[i].time, value: prevValues[i] });
            }

            setEquityThis(thisDaily);
            setEquityPrev(prevMapped);

            const daysThis = daysInMonth(y, m);
            const daysPrev = daysInMonth(yPrev, mPrev);

            const pnlForMonth = (year: number, month0: number, times: number[]) => {
                const n = daysInMonth(year, month0);
                const totals = new Array(n).fill(0);
                for (const t of binaryTrades) {
                    if (!t.close_date) continue;
                    const dt = new Date(t.close_date);
                    if (dt.getFullYear() !== year || dt.getMonth() !== month0) continue;
                    totals[dt.getDate() - 1] += binaryNetResult(t);
                }
                for (const t of forexTrades) {
                    if (!t.close_date) continue;
                    const dt = new Date(t.close_date);
                    if (dt.getFullYear() !== year || dt.getMonth() !== month0) continue;
                    totals[dt.getDate() - 1] += forexNetResult(t);
                }
                const points: Array<{ time: number; value: number }> = [];
                for (let i = 0; i < Math.min(times.length, totals.length); i++) {
                    points.push({ time: times[i], value: Number(totals[i].toFixed(2)) });
                }
                return points;
            };

            const thisTimes = Array.from({ length: daysThis }, (_, i) => toSec(new Date(y, m, i + 1, 12, 0, 0)));
            const prevTimes = Array.from({ length: Math.min(daysThis, daysPrev) }, (_, i) => thisTimes[i]);

            setPnlThis(pnlForMonth(y, m, thisTimes));
            setPnlPrev(pnlForMonth(yPrev, mPrev, prevTimes));

            if (closedTrades.length === 0) {
                setStats({ totalTrades: 0, winRate: 0, profitFactor: 0, totalPnl: 0, avgWin: 0, avgLoss: 0 });
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
            });
        } catch (err) {
            pushToast({ type: 'error', title: 'Metricas', message: getApiErrorMessage(err, 'No se pudieron calcular las metricas.') });
        }
    };

    const StatCard = ({ title, value, icon: Icon, color }: any) => {
        const colorClass =
            color === 'teal'
                ? 'bg-teal-500/10 text-teal-400'
                : color === 'emerald'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : color === 'white'
                        ? 'bg-white/10 text-white'
                        : 'bg-zinc-500/10 text-zinc-300';

        return (
            <div className="bg-zinc-950 border border-white/5 rounded-[40px] p-8">
                <div className="flex justify-between items-start mb-6">
                    <div className={`p-4 rounded-2xl ${colorClass}`}>
                        <Icon size={24} />
                    </div>
                </div>
                <p className="text-zinc-500 text-xs font-black uppercase tracking-widest mb-1">{title}</p>
                <h3 className="text-3xl font-black italic tracking-tighter">{value}</h3>
            </div>
        );
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-tighter italic italic decoration-teal-500 underline underline-offset-8">Performance Analytics</h1>
                    <p className="text-zinc-500 mt-4 font-bold tracking-widest text-xs uppercase">Rendimiento Técnico y Métricas de Carteras</p>
                </div>

                <div className="flex items-center gap-3 bg-zinc-950 border border-white/5 p-2 rounded-2xl">
                    <select
                        className="bg-transparent text-sm font-black text-white px-4 py-2 outline-none cursor-pointer"
                        value={selectedAccount?.id || ''}
                        onChange={(e) => {
                            const acc = accounts.find(a => a.id === parseInt(e.target.value));
                            setSelectedAccount(acc);
                            fetchStats(acc);
                        }}
                    >
                        {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                    </select>
                    <ChevronDown size={16} className="text-zinc-500 mr-2" />
                </div>
            </div>

            {loading ? (
                <div className="h-[400px] flex items-center justify-center">
                    <Loader2 className="animate-spin text-teal-500 w-12 h-12" />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <StatCard title="Total PnL" value={`$${stats.totalPnl}`} icon={TrendingUp} color="teal" />
                        <StatCard title="Win Rate" value={`${stats.winRate}%`} icon={Target} color="emerald" />
                        <StatCard title="Profit Factor" value={stats.profitFactor} icon={Activity} color="white" />
                        <StatCard title="Total Trades" value={stats.totalTrades} icon={Clock} color="zinc" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 bg-zinc-950 border border-white/5 rounded-[40px] p-10 h-[450px] relative overflow-hidden">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                                    <span className="text-xs font-black uppercase tracking-widest text-zinc-500">Equidad diaria (Mes actual vs anterior)</span>
                                </div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                    Objetivo diario: {projectionPct}%
                                </div>
                            </div>

                            <TwoLineChart
                                a={{ name: 'Mes actual', color: '#14b8a6', points: equityThis }}
                                b={{ name: 'Mes anterior', color: 'rgba(255,255,255,0.35)', points: equityPrev }}
                            />

                            <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-teal-500/5 blur-[80px] rounded-full" />
                        </div>

                        <div className="bg-gradient-to-br from-zinc-900 to-black border border-white/10 rounded-[40px] p-10">
                            <h3 className="text-xl font-bold mb-6 uppercase italic underline decoration-teal-500 underline-offset-4">PnL diario (01-31)</h3>
                            <TwoLineChart
                                a={{ name: 'Mes actual', color: '#22c55e', points: pnlThis }}
                                b={{ name: 'Mes anterior', color: 'rgba(255,255,255,0.35)', points: pnlPrev }}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
