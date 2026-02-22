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
                const sorted = [...res.data.binary, ...res.data.forex].sort((a, b) =>
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
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-tighter italic decoration-teal-500 underline underline-offset-8">Reportes de Auditoría</h1>
                    <p className="text-zinc-500 mt-4 font-bold tracking-widest text-xs uppercase">Historial Maestro y Exportación de Sesiones</p>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={exportPDF}
                        className="bg-white text-black px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-teal-500 transition-all shadow-xl shadow-white/5"
                    >
                        <Download size={16} />
                        Exportar a PDF
                    </button>
                    <button
                        onClick={exportCSV}
                        className="bg-zinc-900 border border-white/10 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-zinc-800 transition-all"
                    >
                        <Download size={16} />
                        Exportar CSV
                    </button>
                </div>
            </div>

            <div className="flex bg-zinc-950 p-2 rounded-[30px] border border-white/5 w-fit">
                <button
                    onClick={() => { setTab('trades'); fetchReport(selectedAccount.id, 'trades'); }}
                    className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${tab === 'trades' ? 'bg-zinc-800 text-teal-400 shadow-xl' : 'text-zinc-500'}`}
                >
                    Operativa
                </button>
                <button
                    onClick={() => { setTab('banking'); fetchReport(selectedAccount.id, 'banking'); }}
                    className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${tab === 'banking' ? 'bg-zinc-800 text-teal-400 shadow-xl' : 'text-zinc-500'}`}
                >
                    Bancarios
                </button>
            </div>

            {loading ? (
                <div className="h-[400px] flex items-center justify-center">
                    <Loader2 className="animate-spin text-teal-500 w-12 h-12" />
                </div>
            ) : (
                <div className="bg-zinc-950 border border-white/5 rounded-[40px] overflow-hidden shadow-2xl">
                    <div className="p-8 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 bg-white/[0.02]">
                        <div className="flex items-center gap-4">
                            <Calendar size={20} className="text-teal-500" />
                            <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Últimos 30 días registrados</span>
                        </div>
                        <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-xl border border-white/5">
                            <Filter size={14} className="text-zinc-600" />
                            <select
                                className="bg-transparent text-xs font-bold text-zinc-400 outline-none cursor-pointer"
                                value={selectedAccount?.id || ''}
                                onChange={(e) => {
                                    const acc = accounts.find(a => a.id === parseInt(e.target.value));
                                    setSelectedAccount(acc);
                                    fetchReport(acc.id, tab);
                                }}
                            >
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <table className="w-full text-left">
                        <thead className="bg-white/[0.02] text-zinc-500 text-[10px] uppercase font-black tracking-widest">
                            <tr>
                                <th className="px-10 py-6">Instrumento / ID</th>
                                <th className="px-10 py-6">Fecha y Hora</th>
                                <th className="px-10 py-6">Tipo</th>
                                <th className="px-10 py-6">Inversión</th>
                                <th className="px-10 py-6">Resultado final</th>
                                <th className="px-10 py-6 text-right">Detalles</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {data.map((item, i) => (
                                <tr key={i} className="hover:bg-white/[0.01] transition-colors group">
                                    <td className="px-10 py-6">
                                        <div className="flex flex-col">
                                            <span className="font-black text-white uppercase tracking-tight">{item.instrument || (item.id ? `#${item.id}` : '-')}</span>
                                            <span className="text-[10px] text-zinc-600 font-bold uppercase">{selectedAccount.market_type}</span>
                                        </div>
                                    </td>
                                    <td className="px-10 py-6">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-zinc-400">
                                                {new Date(item.open_date || item.date).toLocaleDateString()}
                                            </span>
                                            <span className="text-xs text-zinc-600">
                                                {new Date(item.open_date || item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-10 py-6">
                                        <span className={`text-[10px] font-black px-3 py-1 rounded-md uppercase tracking-widest ${(item.direction === 'BUY' || item.direction === 'CALL' || item.type === 'deposit')
                                                ? 'bg-teal-500/10 text-teal-400' : 'bg-rose-500/10 text-rose-500'
                                            }`}>
                                            {item.direction || item.type}
                                        </span>
                                    </td>
                                    <td className="px-10 py-6">
                                        <span className="font-black text-white text-sm">${(item.investment || item.amount).toLocaleString()}</span>
                                    </td>
                                    <td className="px-10 py-6">
                                        <div className="flex items-center gap-2">
                                            {item.status === 'win' ? (
                                                <span className="text-emerald-500 font-black text-sm uppercase italic">+$ {(item.investment * item.payout_pct).toLocaleString()}</span>
                                            ) : item.status === 'loss' ? (
                                                <span className="text-rose-500 font-black text-sm uppercase italic">-$ {item.investment.toLocaleString()}</span>
                                            ) : (
                                                <span className="text-zinc-500 font-black text-sm uppercase italic">PROCESADO</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-10 py-6 text-right">
                                        <button className="text-zinc-600 hover:text-white transition-colors">
                                            <ExternalLink size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {data.length === 0 && (
                        <div className="py-32 text-center text-zinc-700">
                            <FileText size={48} className="mx-auto mb-6 opacity-20" />
                            <p className="font-black uppercase tracking-widest text-xs">No se encontraron registros para esta cuenta</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
