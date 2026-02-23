"use client";

import React, { useState, useEffect } from 'react';
import {
    Building2,
    ArrowDownCircle,
    ArrowUpCircle,
    Plus,
    CreditCard,
    ChevronRight,
    Search,
    Loader2,
    X,
    TrendingUp,
    TrendingDown,
    DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useToastStore } from '@/lib/toastStore';
import {
    aggregateBySecond,
    balanceAt,
    buildLedgerEvents,
    computeOffsetFromCurrentBalance,
    getSessionWindow,
    binaryNetResult,
    forexNetResult,
    toSec,
} from '@/lib/ledger';

export default function BalancePage() {
    const pushToast = useToastStore((s) => s.push);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [trades, setTrades] = useState<{ binary: any[]; forex: any[] }>({ binary: [], forex: [] });
    const [tradingConfig, setTradingConfig] = useState<{ instruments: string[]; expiry_times: string[]; payout_pct_default: number; payout_options: number[]; investment_pct_default: number }>({
        instruments: [],
        expiry_times: [],
        payout_pct_default: 0.85,
        payout_options: [0.75, 0.8, 0.85, 0.9],
        investment_pct_default: 2,
    });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'accounts' | 'transactions' | 'trades'>('trades');
    const [selectedAccount, setSelectedAccount] = useState<any>(null);
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState<'account' | 'deposit' | 'withdrawal' | 'trade' | 'trade_close'>('account');

    // Form States
    const [accountName, setAccountName] = useState('');
    const [marketType, setMarketType] = useState('forex');
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [formLoading, setFormLoading] = useState(false);

    // Trade form
    const [tradeInstrument, setTradeInstrument] = useState('');
    const [tradeInvestment, setTradeInvestment] = useState('');
    const [tradeNotes, setTradeNotes] = useState('');
    const [tradeBeforeImage, setTradeBeforeImage] = useState<File | null>(null);
    const [tradeAfterImage, setTradeAfterImage] = useState<File | null>(null);

    const [closingTrade, setClosingTrade] = useState<any | null>(null);

    const [showDeleteAccount, setShowDeleteAccount] = useState(false);
    const [accountToDelete, setAccountToDelete] = useState<any | null>(null);

    const deleteOpenTrade = async (t: any) => {
        if (!selectedAccount) return;
        const status = String(t?.status || '').toLowerCase();
        if (status !== 'open') return;
        if (!confirm('Eliminar operacion abierta? Se devolvera la inversion a la cuenta.')) return;

        setFormLoading(true);
        try {
            if (selectedAccount.market_type === 'binary') {
                await api.delete(`/trading/trades/binary/${t.id}`);
            } else {
                await api.delete(`/trading/trades/forex/${t.id}`);
            }
            pushToast({ type: 'success', title: 'Operacion', message: 'Operacion eliminada.' });
            await fetchData();
        } catch (err) {
            pushToast({ type: 'error', title: 'Operacion', message: getApiErrorMessage(err, 'No se pudo eliminar la operacion.') });
        } finally {
            setFormLoading(false);
        }
    };

    // Binary
    const [binaryDirection, setBinaryDirection] = useState<'CALL' | 'PUT'>('CALL');
    const [binaryPayoutPct, setBinaryPayoutPct] = useState('0.85');
    const [binaryExpiry, setBinaryExpiry] = useState('5m');
    const [binaryResult, setBinaryResult] = useState<'WIN' | 'LOSS' | 'BE'>('WIN');

    // Forex
    const [forexDirection, setForexDirection] = useState<'BUY' | 'SELL'>('BUY');
    const [forexEntryPrice, setForexEntryPrice] = useState('');
    const [forexExitPrice, setForexExitPrice] = useState('');
    const [forexStopLoss, setForexStopLoss] = useState('');
    const [forexTakeProfit, setForexTakeProfit] = useState('');
    const [forexPnlAmount, setForexPnlAmount] = useState('');

    const [sessionInfo, setSessionInfo] = useState<{ name: string; pnl: number; pct: number; startBalance: number } | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [accRes, cfgRes] = await Promise.all([
                api.get('/trading/accounts'),
                api.get('/trading/config'),
            ]);
            setAccounts(accRes.data);
            setTradingConfig({
                instruments: cfgRes.data?.instruments || [],
                expiry_times: cfgRes.data?.expiry_times || [],
                payout_pct_default: Number(cfgRes.data?.payout_pct_default ?? 0.85),
                payout_options: cfgRes.data?.payout_options || [0.75, 0.8, 0.85, 0.9],
                investment_pct_default: Number(cfgRes.data?.investment_pct_default ?? 2),
            });
            if (accRes.data.length > 0) {
                const nextSelected = selectedAccount
                    ? accRes.data.find((a: any) => a.id === selectedAccount.id) || accRes.data[0]
                    : accRes.data[0];
                setSelectedAccount(nextSelected);
                await loadAccount(nextSelected);
            } else {
                setSelectedAccount(null);
                setTransactions([]);
                setTrades({ binary: [], forex: [] });
                setSessionInfo(null);
            }
        } catch (err) {
            pushToast({
                type: 'error',
                title: 'Cuentas',
                message: getApiErrorMessage(err, 'No se pudieron cargar las cuentas.'),
            });
        } finally {
            setLoading(false);
        }
    };

    const loadAccount = async (acc: any) => {
        try {
            const [txRes, tradesRes] = await Promise.all([
                api.get(`/trading/transactions/${acc.id}`),
                api.get(`/trading/trades/${acc.id}`),
            ]);

            const txs = (txRes.data || []).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const binaryTrades = (tradesRes.data?.binary || []).sort((a: any, b: any) => new Date(b.open_date).getTime() - new Date(a.open_date).getTime());
            const forexTrades = (tradesRes.data?.forex || []).sort((a: any, b: any) => new Date(b.open_date).getTime() - new Date(a.open_date).getTime());

            setTransactions(txs);
            setTrades({ binary: binaryTrades, forex: forexTrades });

            const events = buildLedgerEvents({ binaryTrades, forexTrades, transactions: txs });
            const agg = aggregateBySecond(events);
            const offset = computeOffsetFromCurrentBalance(agg, Number(acc.balance || 0));

            const session = getSessionWindow(new Date());
            const startBalance = balanceAt(agg, offset, toSec(session.start) - 1);
            const pnl = Number(
                (
                    (binaryTrades || [])
                        .filter((t: any) => t.close_date && new Date(t.close_date) >= session.start && new Date(t.close_date) < session.end)
                        .reduce((acc2: number, t: any) => acc2 + binaryNetResult(t), 0) +
                    (forexTrades || [])
                        .filter((t: any) => t.close_date && new Date(t.close_date) >= session.start && new Date(t.close_date) < session.end)
                        .reduce((acc2: number, t: any) => acc2 + forexNetResult(t), 0)
                ).toFixed(2)
            );
            const pct = startBalance ? Number(((pnl / startBalance) * 100).toFixed(2)) : 0;
            setSessionInfo({ name: session.name, pnl, pct, startBalance });
        } catch (err) {
            pushToast({ type: 'error', title: 'Cuenta', message: getApiErrorMessage(err, 'No se pudo cargar la cuenta.') });
        }
    };

    const handleCreateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            await api.post(`/trading/accounts?name=${encodeURIComponent(accountName)}&market_type=${encodeURIComponent(marketType)}`);
            setShowModal(false);
            pushToast({ type: 'success', title: 'Cuenta', message: 'Cuenta creada correctamente.' });
            fetchData();
        } catch (err) {
            pushToast({
                type: 'error',
                title: 'Cuenta',
                message: getApiErrorMessage(err, 'Error al crear cuenta.'),
            });
        } finally {
            setFormLoading(false);
        }
    };

    const openDeleteAccountModal = (acc: any) => {
        setAccountToDelete(acc);
        setShowDeleteAccount(true);
    };

    const handleDeleteAccount = async () => {
        if (!accountToDelete) return;
        setFormLoading(true);
        try {
            await api.delete(`/trading/accounts/${accountToDelete.id}`);
            setShowDeleteAccount(false);
            setAccountToDelete(null);
            pushToast({ type: 'success', title: 'Cuenta', message: 'Cuenta eliminada y operaciones borradas.' });
            await fetchData();
        } catch (err) {
            pushToast({ type: 'error', title: 'Cuenta', message: getApiErrorMessage(err, 'No se pudo eliminar la cuenta.') });
        } finally {
            setFormLoading(false);
        }
    };

    const handleTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        const endpoint = modalType === 'deposit' ? 'deposit' : 'withdraw';
        try {
            await api.post(`/trading/accounts/${selectedAccount.id}/${endpoint}?amount=${encodeURIComponent(amount)}&notes=${encodeURIComponent(notes)}`);
            setShowModal(false);
            pushToast({ type: 'success', title: 'Transaccion', message: 'Operacion registrada correctamente.' });
            fetchData();
        } catch (err) {
            pushToast({
                type: 'error',
                title: 'Transaccion',
                message: getApiErrorMessage(err, 'Error en la transaccion.'),
            });
        } finally {
            setFormLoading(false);
        }
    };

    const openTradeModal = () => {
        if (!selectedAccount) {
            pushToast({ type: 'error', title: 'Operacion', message: 'Selecciona una cuenta primero.' });
            return;
        }
        setModalType('trade');
        setShowModal(true);

        const bal = Number(selectedAccount.balance || 0);
        const pct = Number(tradingConfig.investment_pct_default || 0);
        const suggested = Math.max(1, Math.floor((bal * pct) / 100));
        setTradeInstrument(tradingConfig.instruments?.[0] || '');
        setTradeInvestment(String(Number.isFinite(suggested) ? suggested : ''));
        setTradeNotes('');
        setTradeBeforeImage(null);
        setTradeAfterImage(null);

        if (selectedAccount.market_type === 'binary') {
            setBinaryDirection('CALL');
            setBinaryPayoutPct(String(tradingConfig.payout_pct_default ?? 0.85));
            setBinaryExpiry(tradingConfig.expiry_times?.[0] || '5m');
            setBinaryResult('WIN');
        } else {
            setForexDirection('BUY');
            setForexEntryPrice('');
            setForexExitPrice('');
            setForexStopLoss('');
            setForexTakeProfit('');
            setForexPnlAmount('');
        }
    };

    const handleRecordTrade = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAccount) return;

        setFormLoading(true);
        try {
            const fd = new FormData();
            fd.append('account_id', String(selectedAccount.id));
            fd.append('instrument', tradeInstrument);
            fd.append('investment', String(parseInt(tradeInvestment, 10)));
            fd.append('notes', tradeNotes);

            if (selectedAccount.market_type === 'binary') {
                fd.append('direction', binaryDirection);
                fd.append('payout_pct', binaryPayoutPct);
                fd.append('expiry_time', binaryExpiry);
            } else {
                fd.append('direction', forexDirection);
                fd.append('entry_price', forexEntryPrice);
                if (forexStopLoss.trim()) fd.append('stop_loss', forexStopLoss);
                if (forexTakeProfit.trim()) fd.append('take_profit', forexTakeProfit);
            }

            if (tradeBeforeImage) fd.append('before_image', tradeBeforeImage);

            await api.post('/trading/trades/manual/open', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            setShowModal(false);
            pushToast({ type: 'success', title: 'Operacion', message: 'Operacion abierta. Ahora registra el resultado al cerrarla.' });
            fetchData();
        } catch (err) {
            pushToast({
                type: 'error',
                title: 'Operacion',
                message: getApiErrorMessage(err, 'No se pudo registrar la operacion.'),
            });
        } finally {
            setFormLoading(false);
        }
    };

    const openCloseTradeModal = (trade: any) => {
        setClosingTrade(trade);
        setTradeAfterImage(null);
        setTradeNotes(trade?.notes || '');

        if (selectedAccount?.market_type === 'binary') {
            setBinaryResult('WIN');
        } else {
            setForexPnlAmount('');
            setForexExitPrice('');
        }

        setModalType('trade_close');
        setShowModal(true);
    };

    const handleCloseTrade = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAccount || !closingTrade) return;

        setFormLoading(true);
        try {
            const fd = new FormData();
            fd.append('notes', tradeNotes);
            if (tradeAfterImage) fd.append('after_image', tradeAfterImage);

            if (selectedAccount.market_type === 'binary') {
                fd.append('result', binaryResult);
                await api.post(`/trading/trades/manual/binary/${closingTrade.id}/close`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            } else {
                fd.append('pnl_amount', forexPnlAmount);
                if (forexExitPrice.trim()) fd.append('exit_price', forexExitPrice);
                await api.post(`/trading/trades/manual/forex/${closingTrade.id}/close`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            }

            setShowModal(false);
            setClosingTrade(null);
            pushToast({ type: 'success', title: 'Operacion', message: 'Operacion cerrada correctamente.' });
            fetchData();
        } catch (err) {
            pushToast({
                type: 'error',
                title: 'Operacion',
                message: getApiErrorMessage(err, 'No se pudo cerrar la operacion.'),
            });
        } finally {
            setFormLoading(false);
        }
    };

    return (
        <div className="space-y-10 pb-10">
            {/* Terminal Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 pb-8 border-b border-white/5">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3">
                        <span className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <Building2 className="text-emerald-500" size={24} />
                        </span>
                        Neural Ledger Protocol
                    </h1>
                    <p className="text-white/40 font-bold tracking-[0.2em] text-[10px] uppercase ml-14">
                        Financial Command • Asset Allocation System
                    </p>
                </div>

                <div className="flex bg-[#0B0E11] p-1.5 rounded-[22px] border border-white/5 w-fit">
                    <button
                        onClick={() => setActiveTab('accounts')}
                        className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'accounts' ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'text-white/40 hover:text-white'}`}
                    >
                        Nodes
                    </button>
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'transactions' ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'text-white/40 hover:text-white'}`}
                    >
                        Transfers
                    </button>
                    <button
                        onClick={() => setActiveTab('trades')}
                        className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'trades' ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'text-white/40 hover:text-white'}`}
                    >
                        Operations
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                    <div className="relative z-10">
                        <p className="text-white/20 text-[9px] font-black uppercase tracking-[.2em]">Net Node Liquidity</p>
                        <div className="mt-2 text-4xl font-black text-white tracking-tighter italic uppercase">
                            {selectedAccount ? `$${Number(selectedAccount.balance || 0).toLocaleString()}` : '--'}
                        </div>
                        <p className="mt-4 text-white/40 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            {selectedAccount ? `${selectedAccount.name} • ${selectedAccount.market_type}` : 'Awaiting Selection'}
                        </p>
                    </div>
                </div>

                <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                    <div className="relative z-10 flex justify-between items-start">
                        <div>
                            <p className="text-white/20 text-[9px] font-black uppercase tracking-[.2em]">Session Yield Dynamics</p>
                            <div className={`mt-2 text-4xl font-black tracking-tighter italic uppercase ${sessionInfo && sessionInfo.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {sessionInfo ? `${sessionInfo.pnl >= 0 ? '+' : '-'}$${Math.abs(sessionInfo.pnl).toLocaleString()}` : '--'}
                            </div>
                            <p className="mt-4 text-white/40 text-[10px] font-bold uppercase tracking-widest">
                                {sessionInfo ? `${sessionInfo.name} Cycle • ${sessionInfo.pct >= 0 ? '+' : ''}${sessionInfo.pct}% Evolution` : 'Calculating Metrics...'}
                            </p>
                        </div>
                        {sessionInfo && (
                            <div className={`p-4 rounded-[22px] border ${sessionInfo.pnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
                                {sessionInfo.pnl >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="h-[40vh] flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin text-emerald-500 w-10 h-10" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Decrypting Ledger Data...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 space-y-8">
                        {activeTab === 'accounts' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {accounts.map((acc) => (
                                    <motion.div
                                        key={acc.id}
                                        whileHover={{ y: -4 }}
                                        onClick={() => {
                                            setSelectedAccount(acc);
                                            loadAccount(acc);
                                        }}
                                        className={`bg-[#0B0E11] border p-8 rounded-[32px] group cursor-pointer transition-all duration-300 relative overflow-hidden shadow-2xl ${selectedAccount?.id === acc.id ? 'border-emerald-500/40 shadow-emerald-500/5' : 'border-white/5'}`}
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[60px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

                                        <div className="relative z-10">
                                            <div className="flex justify-between items-start mb-8">
                                                <div className={`p-4 rounded-2xl border transition-all group-hover:scale-110 ${acc.market_type === 'forex' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-white/5 text-white/60 border-white/10'}`}>
                                                    {acc.market_type === 'forex' ? <Building2 size={24} /> : <CreditCard size={24} />}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openDeleteAccountModal(acc);
                                                        }}
                                                        className="text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-xl bg-rose-500/5 text-rose-500 border border-rose-500/10 hover:bg-rose-500/20 transition-all"
                                                    >
                                                        Purge
                                                    </button>
                                                </div>
                                            </div>
                                            <h3 className="font-black text-xl text-white uppercase tracking-tight italic group-hover:text-emerald-500 transition-colors">{acc.name}</h3>
                                            <p className="text-white/20 text-[9px] font-black uppercase tracking-widest mt-1">{acc.market_type} Terminal</p>

                                            <div className="mt-10">
                                                <p className="text-white/30 text-[10px] font-black uppercase tracking-widest">Available Liquidity</p>
                                                <p className="text-3xl font-black mt-2 text-white italic tracking-tighter uppercase">${acc.balance.toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                                <button
                                    onClick={() => { setModalType('account'); setShowModal(true); }}
                                    className="border-2 border-dashed border-white/5 rounded-[32px] p-8 flex flex-col items-center justify-center gap-4 text-white/20 hover:text-emerald-500 hover:border-emerald-500/20 hover:bg-emerald-500/5 transition-all min-h-[260px] group shadow-2xl"
                                >
                                    <div className="p-4 bg-white/5 rounded-2xl group-hover:scale-110 transition-transform">
                                        <Plus size={32} />
                                    </div>
                                    <span className="font-black text-[10px] uppercase tracking-[.2em]">Initialize New Node</span>
                                </button>
                            </div>
                        ) : activeTab === 'transactions' ? (
                            <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-white/[0.02] border-b border-white/5">
                                                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Timestamp</th>
                                                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Type</th>
                                                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Quantum Value</th>
                                                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Meta-Data</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {transactions.map((tx) => (
                                                <tr key={tx.id} className="hover:bg-white/[0.01] transition-colors group">
                                                    <td className="px-8 py-6 text-xs font-bold text-white/40">{new Date(tx.date).toLocaleDateString()}</td>
                                                    <td className="px-8 py-6">
                                                        <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border tracking-widest ${tx.type === 'deposit' ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/10' : 'bg-rose-500/5 text-rose-500 border-rose-500/10'}`}>
                                                            {tx.type}
                                                        </span>
                                                    </td>
                                                    <td className={`px-8 py-6 font-black text-sm italic ${tx.type === 'deposit' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                        {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toLocaleString()}
                                                    </td>
                                                    <td className="px-8 py-6 text-[10px] text-white/20 font-black uppercase tracking-widest">{tx.notes}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-white/[0.02] border-b border-white/5">
                                                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Operational Time</th>
                                                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Asset</th>
                                                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Outcome</th>
                                                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Allocation</th>
                                                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Net Yield</th>
                                                <th className="px-8 py-6 text-[9px] font-black uppercase tracking-[.2em] text-white/30">Visions</th>
                                                <th className="px-8 py-6 text-right text-[9px] font-black uppercase tracking-[.2em] text-white/30">Command</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {selectedAccount?.market_type === 'binary'
                                                ? (trades.binary || []).map((t: any) => {
                                                    const pnl = t.status === 'win' ? t.investment * t.payout_pct : t.status === 'loss' ? -t.investment : 0;
                                                    const base = typeof window !== 'undefined' ? `http://${window.location.hostname}:8080` : '';
                                                    return (
                                                        <tr key={`b-${t.id}`} className="hover:bg-white/[0.01] transition-colors group">
                                                            <td className="px-8 py-6 text-[10px] font-bold text-white/40">{new Date(t.open_date).toLocaleString()}</td>
                                                            <td className="px-8 py-6 text-[11px] font-black text-white uppercase tracking-tight group-hover:text-emerald-500 transition-colors italic">{t.instrument}</td>
                                                            <td className="px-8 py-6">
                                                                <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border tracking-widest ${t.status === 'win' ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/10' : t.status === 'loss' ? 'bg-rose-500/5 text-rose-500 border-rose-500/10' : 'bg-white/5 text-white/30 border-white/10'}`}>
                                                                    {t.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-8 py-6 font-black text-xs text-white/60 italic">${t.investment.toLocaleString()}</td>
                                                            <td className={`px-8 py-6 font-black text-sm italic ${t.status === 'open' ? 'text-white/20' : pnl >= 0 ? 'text-emerald-500 shadow-emerald-500/50 drop-shadow-sm' : 'text-rose-500 shadow-rose-500/50 drop-shadow-sm'}`}>
                                                                {t.status === 'open' ? '--' : `${pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toLocaleString()}`}
                                                            </td>
                                                            <td className="px-8 py-6">
                                                                <div className="flex gap-2">
                                                                    {t.before_image && (
                                                                        <a href={`${base}/media/trades/${t.before_image}`} target="_blank" rel="noreferrer" className="p-2 bg-white/5 rounded-lg border border-white/10 text-emerald-500 hover:bg-emerald-500/10 transition-colors">
                                                                            <ImageIcon size={14} />
                                                                        </a>
                                                                    )}
                                                                    {t.after_image && (
                                                                        <a href={`${base}/media/trades/${t.after_image}`} target="_blank" rel="noreferrer" className="p-2 bg-white/5 rounded-lg border border-white/10 text-rose-500 hover:bg-rose-500/10 transition-colors">
                                                                            <ImageIcon size={14} />
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-6 text-right">
                                                                {t.status === 'open' ? (
                                                                    <div className="flex items-center justify-end gap-3">
                                                                        <button
                                                                            onClick={() => openCloseTradeModal(t)}
                                                                            className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:scale-105 transition-all"
                                                                        >
                                                                            Conclude
                                                                        </button>
                                                                        <button
                                                                            onClick={() => deleteOpenTrade(t)}
                                                                            className="p-2 bg-rose-500/5 text-rose-500 border border-rose-500/10 rounded-xl hover:bg-rose-500/20 transition-all"
                                                                            disabled={formLoading}
                                                                        >
                                                                            <X size={14} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="p-2 text-white/10">
                                                                        <CheckCircle2 size={16} />
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                                : (trades.forex || []).map((t: any) => {
                                                    const base = typeof window !== 'undefined' ? `http://${window.location.hostname}:8080` : '';
                                                    return (
                                                        <tr key={`f-${t.id}`} className="hover:bg-white/[0.01] transition-colors group">
                                                            <td className="px-8 py-6 text-[10px] font-bold text-white/40">{new Date(t.open_date).toLocaleString()}</td>
                                                            <td className="px-8 py-6 text-[11px] font-black text-white uppercase tracking-tight group-hover:text-emerald-500 transition-colors italic">{t.instrument}</td>
                                                            <td className="px-8 py-6">
                                                                <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border tracking-widest ${t.status === 'win' ? 'bg-emerald-500/5 text-emerald-500 border-emerald-500/10' : t.status === 'loss' ? 'bg-rose-500/5 text-rose-500 border-rose-500/10' : 'bg-white/5 text-white/30 border-white/10'}`}>
                                                                    {t.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-8 py-6 font-black text-xs text-white/60 italic">${t.investment.toLocaleString()}</td>
                                                            <td className={`px-8 py-6 font-black text-sm italic ${t.status === 'open' ? 'text-white/20' : t.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                {t.status === 'open' ? '--' : `${t.pnl >= 0 ? '+' : '-'}${Math.abs(t.pnl).toLocaleString()}`}
                                                            </td>
                                                            <td className="px-8 py-6">
                                                                <div className="flex gap-2">
                                                                    {t.before_image && (
                                                                        <a href={`${base}/media/trades/${t.before_image}`} target="_blank" rel="noreferrer" className="p-2 bg-white/5 rounded-lg border border-white/10 text-emerald-500 hover:bg-emerald-500/10 transition-colors">
                                                                            <ImageIcon size={14} />
                                                                        </a>
                                                                    )}
                                                                    {t.after_image && (
                                                                        <a href={`${base}/media/trades/${t.after_image}`} target="_blank" rel="noreferrer" className="p-2 bg-white/5 rounded-lg border border-white/10 text-rose-500 hover:bg-rose-500/10 transition-colors">
                                                                            <ImageIcon size={14} />
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-6 text-right">
                                                                {t.status === 'open' ? (
                                                                    <div className="flex items-center justify-end gap-3">
                                                                        <button
                                                                            onClick={() => openCloseTradeModal(t)}
                                                                            className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:scale-105 transition-all"
                                                                        >
                                                                            Conclude
                                                                        </button>
                                                                        <button
                                                                            onClick={() => deleteOpenTrade(t)}
                                                                            className="p-2 bg-rose-500/5 text-rose-500 border border-rose-500/10 rounded-xl hover:bg-rose-500/20 transition-all"
                                                                            disabled={formLoading}
                                                                        >
                                                                            <X size={14} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="p-2 text-white/10">
                                                                        <CheckCircle2 size={16} />
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-4 space-y-8">
                        <div className="bg-[#0B0E11] border border-emerald-500/10 rounded-[32px] p-8 relative overflow-hidden group shadow-2xl">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                            <div className="relative z-10">
                                <h3 className="text-xl font-black text-white italic uppercase tracking-tight mb-8">Rapid Command</h3>
                                <div className="space-y-4">
                                    <button
                                        disabled={!selectedAccount}
                                        onClick={() => { setModalType('deposit'); setShowModal(true); }}
                                        className="w-full h-16 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-center gap-4 text-[11px] font-black text-white uppercase tracking-[.2em] hover:bg-emerald-500 hover:text-black hover:border-emerald-500 transition-all disabled:opacity-30 group"
                                    >
                                        <ArrowDownCircle size={20} className="text-emerald-500 group-hover:text-black transition-colors" />
                                        Inbound Vector
                                    </button>
                                    <button
                                        disabled={!selectedAccount}
                                        onClick={() => { setModalType('withdrawal'); setShowModal(true); }}
                                        className="w-full h-16 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-center gap-4 text-[11px] font-black text-white uppercase tracking-[.2em] hover:bg-rose-500 hover:text-black hover:border-rose-500 transition-all disabled:opacity-30 group"
                                    >
                                        <ArrowUpCircle size={20} className="text-rose-500 group-hover:text-black transition-colors" />
                                        Outbound Vector
                                    </button>
                                    <div className="pt-4 border-t border-white/5">
                                        <button
                                            disabled={!selectedAccount}
                                            onClick={openTradeModal}
                                            className="w-full h-16 bg-emerald-500 text-black rounded-2xl flex items-center justify-center gap-4 text-[11px] font-black uppercase tracking-[.2em] shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:scale-[1.02] transition-all disabled:opacity-30"
                                        >
                                            <TrendingUp size={20} />
                                            Initialize Operation
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#0B0E11] border border-white/5 rounded-[32px] p-8 relative overflow-hidden shadow-2xl">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-white/40">
                                    <Activity size={20} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-white/30 tracking-widest">Network Pulse</p>
                                    <p className="text-sm font-black text-white italic">Operational Integrity</p>
                                </div>
                            </div>
                            <p className="text-[11px] text-white/20 font-bold uppercase tracking-widest leading-relaxed">
                                All financial vectors are synchronized across the Jade Core Node in real-time. Changes affect neural strategy weighting instantly.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal */}
            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowModal(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-card border border-border rounded-3xl w-full max-w-md p-8 relative z-10 transition-colors duration-300"
                        >
                            <button onClick={() => setShowModal(false)} className="absolute top-6 right-6 text-muted-foreground hover:text-foreground">
                                <X size={20} />
                            </button>

                            <h2 className="text-2xl font-bold mb-6 text-foreground">
                                {modalType === 'account'
                                    ? 'Nueva Cuenta'
                                    : modalType === 'deposit'
                                        ? 'Depositar Fondos'
                                        : modalType === 'withdrawal'
                                            ? 'Retirar Capital'
                                            : modalType === 'trade_close'
                                                ? 'Cerrar Operacion'
                                                : 'Registrar Operacion'}
                            </h2>

                            <form onSubmit={
                                modalType === 'account'
                                    ? handleCreateAccount
                                    : modalType === 'trade'
                                        ? handleRecordTrade
                                        : modalType === 'trade_close'
                                            ? handleCloseTrade
                                            : handleTransaction
                            } className="space-y-4">
                                {modalType === 'account' ? (
                                    <>
                                        <div>
                                            <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Nombre de Cuenta</label>
                                            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} required className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="Ej: Forex VIP 1" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Mercado</label>
                                            <select value={marketType} onChange={(e) => setMarketType(e.target.value)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none">
                                                <option value="forex">Forex</option>
                                                <option value="binary">Binarias</option>
                                            </select>
                                        </div>
                                    </>
                                ) : modalType === 'trade' ? (
                                    <>
                                        <div>
                                            <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Instrumento</label>
                                            {tradingConfig.instruments?.length ? (
                                                <select
                                                    value={tradeInstrument}
                                                    onChange={(e) => setTradeInstrument(e.target.value)}
                                                    className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none"
                                                >
                                                    {tradingConfig.instruments.map((ins) => (
                                                        <option key={ins} value={ins} className="bg-card">{ins}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    value={tradeInstrument}
                                                    onChange={(e) => setTradeInstrument(e.target.value)}
                                                    required
                                                    className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none"
                                                    placeholder="Ej: EUR/USD"
                                                />
                                            )}
                                        </div>

                                        <div>
                                            <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Inversion (USD)</label>
                                            <input type="number" step="1" value={tradeInvestment} onChange={(e) => setTradeInvestment(e.target.value)} required className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="0" />
                                        </div>

                                        {selectedAccount?.market_type === 'binary' ? (
                                            <>
                                                <div>
                                                    <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Direccion</label>
                                                    <select value={binaryDirection} onChange={(e) => setBinaryDirection(e.target.value as any)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none">
                                                        <option value="CALL">CALL</option>
                                                        <option value="PUT">PUT</option>
                                                    </select>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Payout</label>
                                                        {tradingConfig.payout_options?.length ? (
                                                            <select value={binaryPayoutPct} onChange={(e) => setBinaryPayoutPct(e.target.value)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none">
                                                                {tradingConfig.payout_options.map((p) => (
                                                                    <option key={String(p)} value={String(p)} className="bg-card">{Math.round(Number(p) * 100)}%</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <input type="number" step="0.01" value={binaryPayoutPct} onChange={(e) => setBinaryPayoutPct(e.target.value)} required className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="0.85" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Expiracion</label>
                                                        {tradingConfig.expiry_times?.length ? (
                                                            <select value={binaryExpiry} onChange={(e) => setBinaryExpiry(e.target.value)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none">
                                                                {tradingConfig.expiry_times.map((t) => (
                                                                    <option key={t} value={t} className="bg-card">{t}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <input value={binaryExpiry} onChange={(e) => setBinaryExpiry(e.target.value)} required className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="5m" />
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Direccion</label>
                                                    <select value={forexDirection} onChange={(e) => setForexDirection(e.target.value as any)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none">
                                                        <option value="BUY">BUY</option>
                                                        <option value="SELL">SELL</option>
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Entry</label>
                                                    <input type="number" step="0.00001" value={forexEntryPrice} onChange={(e) => setForexEntryPrice(e.target.value)} required className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="1.10000" />
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Stop Loss (opcional)</label>
                                                        <input type="number" step="0.00001" value={forexStopLoss} onChange={(e) => setForexStopLoss(e.target.value)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="1.09500" />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Take Profit (opcional)</label>
                                                        <input type="number" step="0.00001" value={forexTakeProfit} onChange={(e) => setForexTakeProfit(e.target.value)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="1.11000" />
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        <div>
                                            <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Notas</label>
                                            <input value={tradeNotes} onChange={(e) => setTradeNotes(e.target.value)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="Opcional" />
                                        </div>

                                        <div className="grid grid-cols-1 gap-3">
                                            <div>
                                                <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Imagen antes (opcional)</label>
                                                <input type="file" accept="image/*" onChange={(e) => setTradeBeforeImage(e.target.files?.[0] || null)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" />
                                            </div>
                                        </div>
                                    </>
                                ) : modalType === 'trade_close' ? (
                                    <>
                                        <div className="bg-muted border border-border rounded-2xl p-4">
                                            <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Operacion</div>
                                            <div className="mt-2 text-sm font-bold text-foreground">
                                                {closingTrade ? `${closingTrade.instrument} • $${Number(closingTrade.investment || 0).toLocaleString()}` : '--'}
                                            </div>
                                        </div>

                                        {selectedAccount?.market_type === 'binary' ? (
                                            <>
                                                <div>
                                                    <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Resultado</label>
                                                    <select value={binaryResult} onChange={(e) => setBinaryResult(e.target.value as any)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none">
                                                        <option value="WIN">WIN</option>
                                                        <option value="LOSS">LOSS</option>
                                                        <option value="BE">BE</option>
                                                    </select>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">PnL (USD)</label>
                                                    <input type="number" step="0.01" value={forexPnlAmount} onChange={(e) => setForexPnlAmount(e.target.value)} required className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="-5 / 10" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Exit (opcional)</label>
                                                    <input type="number" step="0.00001" value={forexExitPrice} onChange={(e) => setForexExitPrice(e.target.value)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="1.10500" />
                                                </div>
                                            </>
                                        )}

                                        <div>
                                            <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Notas</label>
                                            <input value={tradeNotes} onChange={(e) => setTradeNotes(e.target.value)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="Opcional" />
                                        </div>

                                        <div>
                                            <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Imagen despues (opcional)</label>
                                            <input type="file" accept="image/*" onChange={(e) => setTradeAfterImage(e.target.files?.[0] || null)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Monto (USD)</label>
                                            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="0.00" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-muted-foreground uppercase block mb-2">Concepto / Notas</label>
                                            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-background border border-border rounded-xl p-4 text-foreground focus:ring-2 focus:ring-primary outline-none" placeholder="Opcional" />
                                        </div>
                                    </>
                                )}
                                <button disabled={formLoading} className="w-full bg-primary hover:opacity-90 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 mt-4 transition-all transition-colors duration-300">
                                    {formLoading ? <Loader2 className="animate-spin" /> : 'Confirmar Operación'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showDeleteAccount && accountToDelete && (
                    <motion.div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            initial={{ scale: 0.98, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.98, opacity: 0 }}
                            className="w-full max-w-lg bg-card border border-border rounded-3xl overflow-hidden transition-colors duration-300"
                        >
                            <div className="p-6 flex items-start justify-between border-b border-border">
                                <div>
                                    <h3 className="text-lg font-black text-foreground">Eliminar cuenta</h3>
                                    <p className="text-muted-foreground text-sm mt-1">
                                        Se borraran todas las transacciones y operaciones asociadas.
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowDeleteAccount(false);
                                        setAccountToDelete(null);
                                    }}
                                    className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="bg-muted border border-border rounded-2xl p-4">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cuenta</div>
                                    <div className="text-sm font-bold text-foreground">
                                        {accountToDelete.name} ({accountToDelete.market_type})
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setShowDeleteAccount(false);
                                            setAccountToDelete(null);
                                        }}
                                        className="flex-1 bg-background border border-border text-foreground px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-muted transition-colors"
                                        disabled={formLoading}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleDeleteAccount}
                                        className="flex-1 bg-rose-500 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-600 disabled:opacity-50 transition-colors"
                                        disabled={formLoading}
                                    >
                                        {formLoading ? (
                                            <span className="inline-flex items-center gap-2">
                                                <Loader2 className="animate-spin" size={16} />
                                                Eliminando...
                                            </span>
                                        ) : (
                                            'Eliminar'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
