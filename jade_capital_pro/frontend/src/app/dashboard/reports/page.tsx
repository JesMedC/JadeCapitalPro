"use client";

import React, { useState, useEffect } from 'react';
import {
    FileText,
    Download,
    Calendar,
    Filter,
    ArrowDownCircle,
    ArrowUpCircle,
    Loader2,
    Search,
    ChevronRight,
    ExternalLink
} from 'lucide-react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useToastStore } from '@/lib/toastStore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ReportsPage() {
    const pushToast = useToastStore((s) => s.push);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('trades'); // 'trades' or 'banking'
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<any>(null);
    const [data, setData] = useState<any[]>([]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const accRes = await api.get('/trading/accounts');
            setAccounts(accRes.data);
            if (accRes.data.length > 0) {
                const firstAcc = accRes.data[0];
                setSelectedAccount(firstAcc);
                fetchReport(firstAcc.id, 'trades');
            }
        } catch (err) {
            pushToast({ type: 'error', title: 'Reportes', message: getApiErrorMessage(err, 'No se pudieron cargar las cuentas.') });
        } finally {
            setLoading(false);
        }
    };

    const fetchReport = async (accountId: number, type: string) => {
        setLoading(true);
        try {
            if (type === 'trades') {
                const res = await api.get(`/trading/trades/${accountId}`);
                const sorted = [...(res.data.binary || []), ...(res.data.forex || [])].sort((a, b) =>
                    new Date(b.open_date).getTime() - new Date(a.open_date).getTime()
                );
                setData(sorted);
            } else {
                const res = await api.get(`/trading/transactions/${accountId}`);
                const sorted = res.data.sort((a: any, b: any) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                );
                setData(sorted);
            }
        } catch (err) {
            pushToast({ type: 'error', title: 'Reportes', message: getApiErrorMessage(err, 'No se pudo cargar el reporte.') });
        } finally {
            setLoading(false);
        }
    };

    const downloadText = (filename: string, content: string, mime: string) => {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const exportCSV = () => {
        if (!selectedAccount) return;

        const rows: string[][] = [];
        if (tab === 'trades') {
            rows.push(['id', 'instrument', 'direction', 'investment', 'status', 'pnl', 'open_date', 'close_date']);
            for (const t of data) {
                const pnl = t.pnl !== undefined ? t.pnl : (t.status === 'win' ? t.investment * t.payout_pct : t.status === 'loss' ? -t.investment : 0);
                rows.push([
                    String(t.id ?? ''),
                    String(t.instrument ?? ''),
                    String(t.direction ?? ''),
                    String(t.investment ?? ''),
                    String(t.status ?? ''),
                    String(pnl ?? ''),
                    String(t.open_date ?? ''),
                    String(t.close_date ?? ''),
                ]);
            }
        } else {
            rows.push(['id', 'type', 'amount', 'date', 'notes']);
            for (const tx of data) {
                rows.push([
                    String(tx.id ?? ''),
                    String(tx.type ?? ''),
                    String(tx.amount ?? ''),
                    String(tx.date ?? ''),
                    String(tx.notes ?? ''),
                ]);
            }
        }

        const escape = (s: string) => {
            if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replaceAll('"', '""')}"`;
            return s;
        };
        const csv = rows.map((r) => r.map((c) => escape(String(c ?? ''))).join(',')).join('\n');
        downloadText(
            `reporte_${selectedAccount.name}_${tab}_${new Date().toISOString().slice(0, 10)}.csv`,
            csv,
            'text/csv;charset=utf-8'
        );
        pushToast({ type: 'success', title: 'Exportar', message: 'CSV descargado.' });
    };

    const exportPDF = () => {
        if (!selectedAccount) return;

        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(14);
        doc.text(`Jade Capital Pro - Reporte (${tab})`, 14, 14);
        doc.setFontSize(10);
        doc.text(`Cuenta: ${selectedAccount.name} (${selectedAccount.market_type})`, 14, 20);
        doc.text(`Fecha: ${new Date().toLocaleString()}`, 14, 26);

        if (tab === 'trades') {
            autoTable(doc, {
                startY: 32,
                head: [['ID', 'Instrumento', 'Dir', 'Inversion', 'Status', 'PnL', 'Open', 'Close']],
                body: data.map((t) => {
                    const pnl = t.pnl !== undefined ? t.pnl : (t.status === 'win' ? t.investment * t.payout_pct : t.status === 'loss' ? -t.investment : 0);
                    return [
                        String(t.id ?? ''),
                        String(t.instrument ?? ''),
                        String(t.direction ?? ''),
                        String(t.investment ?? ''),
                        String(t.status ?? ''),
                        String(pnl ?? ''),
                        t.open_date ? new Date(t.open_date).toLocaleString() : '',
                        t.close_date ? new Date(t.close_date).toLocaleString() : '',
                    ];
                }),
                styles: { fontSize: 8 },
            });
        } else {
            autoTable(doc, {
                startY: 32,
                head: [['ID', 'Tipo', 'Monto', 'Fecha', 'Notas']],
                body: data.map((tx) => [
                    String(tx.id ?? ''),
                    String(tx.type ?? ''),
                    String(tx.amount ?? ''),
                    tx.date ? new Date(tx.date).toLocaleString() : '',
                    String(tx.notes ?? ''),
                ]),
                styles: { fontSize: 9 },
            });
        }

        doc.save(`reporte_${selectedAccount.name}_${tab}_${new Date().toISOString().slice(0, 10)}.pdf`);
        pushToast({ type: 'success', title: 'Exportar', message: 'PDF descargado.' });
    };

    return (
        <div className="space-y-10 pb-10">
            {/* Terminal Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 pb-8 border-b border-white/5">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
                        <span className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <FileText className="text-emerald-500" size={24} />
                        </span>
                        Neural Audit Protocol
                    </h1>
                    <p className="text-white/40 font-bold tracking-[0.2em] text-[10px] uppercase ml-14">
                        Master Ledger • Transaction Discovery System
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <button
                        onClick={exportPDF}
                        className="h-12 flex items-center gap-3 px-6 bg-white text-black rounded-2xl font-black text-[11px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
                    >
                        <Download size={16} />
                        Export PDF
                    </button>
                    <button
                        onClick={exportCSV}
                        className="h-12 flex items-center gap-3 px-6 bg-[#0B0E11] border border-white/5 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-white/5 transition-all"
                    >
                        <Download size={16} />
                        CSV Export
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex bg-[#0B0E11] p-1.5 rounded-[22px] border border-white/5 w-fit">
                <button
                    onClick={() => { setTab('trades'); fetchReport(selectedAccount.id, 'trades'); }}
                    className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'trades' ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'text-white/40 hover:text-white'}`}
                >
                    Operational
                </button>
                <button
                    onClick={() => { setTab('banking'); fetchReport(selectedAccount.id, 'banking'); }}
                    className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'banking' ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'text-white/40 hover:text-white'}`}
                >
                    Financials
                </button>
            </div>

            {loading ? (
                <div className="h-[50vh] flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin text-emerald-500 w-10 h-10" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Reconstructing Ledger...</p>
                </div>
            ) : (
                <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl relative">
                    <div className="p-8 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 bg-[#0E1216]">
                        <div className="flex items-center gap-3">
                            <Calendar size={18} className="text-emerald-500" />
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[.2em]">Live Sequential Index</span>
                        </div>

                        <div className="flex items-center gap-4 bg-black/40 px-6 py-3 rounded-2xl border border-white/5 group focus-within:border-emerald-500/30 transition-all">
                            <Filter size={14} className="text-white/20 group-focus-within:text-emerald-500" />
                            <select
                                className="bg-transparent text-[11px] font-black text-white uppercase outline-none cursor-pointer min-w-[140px]"
                                value={selectedAccount?.id || ''}
                                onChange={(e) => {
                                    const acc = accounts.find(a => a.id === parseInt(e.target.value));
                                    setSelectedAccount(acc);
                                    fetchReport(acc.id, tab);
                                }}
                            >
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id} className="bg-[#0B0E11]">{acc.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white/[0.02] border-b border-white/5">
                                    <th className="px-10 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Node / Asset</th>
                                    <th className="px-10 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Timestamp</th>
                                    <th className="px-10 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Vector</th>
                                    <th className="px-10 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Allocated</th>
                                    <th className="px-10 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Net Realized</th>
                                    <th className="px-10 py-6 text-right text-[9px] font-black uppercase tracking-[.2em] text-white/30">Audit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {data.map((item, i) => (
                                    <tr key={i} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-10 py-6">
                                            <div className="flex flex-col">
                                                <span className="font-black text-white uppercase tracking-tight group-hover:text-emerald-500 transition-colors">
                                                    {item.instrument || (item.id ? `#${item.id}` : '-')}
                                                </span>
                                                <span className="text-[9px] text-white/20 font-black uppercase mt-0.5">{selectedAccount.market_type}</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-6">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-white/80">
                                                    {new Date(item.open_date || item.date).toLocaleDateString()}
                                                </span>
                                                <span className="text-[10px] text-white/30 font-medium">
                                                    {new Date(item.open_date || item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-6">
                                            <span className={`text-[9px] font-black px-3 py-1.5 rounded-lg border uppercase tracking-[.15em] ${(item.direction === 'BUY' || item.direction === 'CALL' || item.type === 'deposit')
                                                ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/10' : 'bg-rose-500/5 text-rose-500 border-rose-500/10'
                                                }`}>
                                                {item.direction || item.type}
                                            </span>
                                        </td>
                                        <td className="px-10 py-6">
                                            <span className="font-black text-white/90 text-sm italic">${(item.investment || item.amount).toLocaleString()}</span>
                                        </td>
                                        <td className="px-10 py-6">
                                            <div className="flex items-center gap-2">
                                                {item.status === 'win' ? (
                                                    <span className="text-emerald-500 font-black text-sm uppercase italic drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                                                        +$ {(item.investment * item.payout_pct).toLocaleString()}
                                                    </span>
                                                ) : item.status === 'loss' ? (
                                                    <span className="text-rose-500 font-black text-sm uppercase italic drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]">
                                                        -$ {item.investment.toLocaleString()}
                                                    </span>
                                                ) : item.status === 'open' ? (
                                                    <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                        <span className="text-white/40 text-[9px] font-black uppercase tracking-widest">Active</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-white/20 font-black text-[10px] uppercase italic tracking-widest">Processed</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-10 py-6 text-right">
                                            <button className="p-3 bg-white/[0.03] border border-white/5 rounded-xl text-white/20 hover:text-emerald-500 hover:border-emerald-500/30 transition-all">
                                                <ExternalLink size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {data.length === 0 && (
                        <div className="py-32 text-center">
                            <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-[32px] flex items-center justify-center text-white/10 mx-auto mb-6">
                                <FileText size={40} />
                            </div>
                            <p className="font-black uppercase tracking-[.4em] text-[10px] text-white/20">Zero Records Recovered for this Node</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
