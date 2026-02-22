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

            const txs = txRes.data || [];
            const binaryTrades = tradesRes.data?.binary || [];
            const forexTrades = tradesRes.data?.forex || [];

            setTransactions(txs);
            setTrades(tradesRes.data || { binary: [], forex: [] });

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
        <div className="space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight">Gestión Bancaria</h1>
                    <p className="text-zinc-500 mt-1">Administra tus fondos y cuentas de trading.</p>
                </div>
                <div className="flex bg-zinc-950 p-1 rounded-2xl border border-white/5">
                    <button
                        onClick={() => setActiveTab('accounts')}
                        className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'accounts' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500'}`}
                    >
                        Mis Cuentas
                    </button>
                    <button
                        onClick={() => setActiveTab('transactions')}
                        className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'transactions' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500'}`}
                    >
                        Transacciones
                    </button>
                    <button
                        onClick={() => setActiveTab('trades')}
                        className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'trades' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500'}`}
                    >
                        Operaciones
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-zinc-950 border border-white/5 rounded-3xl p-6">
                    <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Balance de cuenta</p>
                    <div className="mt-2 text-3xl font-black">
                        {selectedAccount ? `$${Number(selectedAccount.balance || 0).toLocaleString()}` : '--'}
                    </div>
                    <p className="mt-2 text-zinc-600 text-sm font-semibold">
                        {selectedAccount ? `${selectedAccount.name} (${selectedAccount.market_type})` : 'Selecciona una cuenta'}
                    </p>
                </div>
                <div className="bg-zinc-950 border border-white/5 rounded-3xl p-6">
                    <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Profit de sesion</p>
                    <div className={`mt-2 text-3xl font-black ${sessionInfo && sessionInfo.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {sessionInfo ? `${sessionInfo.pnl >= 0 ? '+' : '-'}$${Math.abs(sessionInfo.pnl).toLocaleString()}` : '--'}
                    </div>
                    <p className="mt-2 text-zinc-600 text-sm font-semibold">
                        {sessionInfo ? `${sessionInfo.name} • ${sessionInfo.pct >= 0 ? '+' : ''}${sessionInfo.pct}%` : 'Cargando sesion...'}
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="h-[400px] flex items-center justify-center">
                    <Loader2 className="animate-spin text-teal-500 w-12 h-12" />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 space-y-6">
                        {activeTab === 'accounts' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {accounts.map((acc) => (
                                    <motion.div
                                        key={acc.id}
                                        whileHover={{ scale: 1.01 }}
                                        onClick={() => {
                                            setSelectedAccount(acc);
                                            loadAccount(acc);
                                        }}
                                        className={`bg-zinc-950 border p-6 rounded-3xl group cursor-pointer transition-all ${selectedAccount?.id === acc.id ? 'border-teal-500/50 shadow-lg shadow-teal-500/10' : 'border-white/5'}`}
                                    >
                                        <div className="flex justify-between items-start mb-6">
                                            <div className={`p-3 rounded-2xl ${acc.market_type === 'forex' ? 'bg-teal-500/10 text-teal-400' : 'bg-emerald-500/10 text-emerald-400'}`}> 
                                                {acc.market_type === 'forex' ? <Building2 size={24} /> : <CreditCard size={24} />}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openDeleteAccountModal(acc);
                                                    }}
                                                    className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/15"
                                                >
                                                    Eliminar
                                                </button>
                                                <ChevronRight size={20} className="text-zinc-600 group-hover:translate-x-1 transition-transform" />
                                            </div>
                                        </div>
                                        <h3 className="font-bold text-lg">{acc.name}</h3>
                                        <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold mt-1">{acc.market_type}</p>
                                        <div className="mt-8">
                                            <p className="text-zinc-500 text-sm">Balance Disponible</p>
                                            <p className="text-3xl font-black mt-1">${acc.balance.toLocaleString()}</p>
                                        </div>
                                    </motion.div>
                                ))}
                                <button
                                    onClick={() => { setModalType('account'); setShowModal(true); }}
                                    className="border-2 border-dashed border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-2 text-zinc-600 hover:text-white hover:border-white/10 transition-all min-h-[200px]"
                                >
                                    <Plus size={32} />
                                    <span className="font-bold text-sm uppercase tracking-widest">Nueva Cuenta</span>
                                </button>
                            </div>
                        ) : activeTab === 'transactions' ? (
                            <div className="bg-zinc-950 border border-white/5 rounded-3xl overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="bg-white/5 text-zinc-500 text-xs uppercase tracking-widest font-bold">
                                        <tr>
                                            <th className="px-6 py-4">Fecha</th>
                                            <th className="px-6 py-4">Tipo</th>
                                            <th className="px-6 py-4">Monto</th>
                                            <th className="px-6 py-4">Notas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {transactions.map((tx) => (
                                            <tr key={tx.id} className="text-sm border-white/5">
                                                <td className="px-6 py-4 text-zinc-400">{new Date(tx.date).toLocaleDateString()}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${tx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                                        {tx.type}
                                                    </span>
                                                </td>
                                                <td className={`px-6 py-4 font-bold ${tx.type === 'deposit' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 text-zinc-500">{tx.notes}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="bg-zinc-950 border border-white/5 rounded-3xl overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="bg-white/5 text-zinc-500 text-xs uppercase tracking-widest font-bold">
                                        <tr>
                                            <th className="px-6 py-4">Fecha</th>
                                            <th className="px-6 py-4">Instrumento</th>
                                            <th className="px-6 py-4">Resultado</th>
                                            <th className="px-6 py-4">Inversion</th>
                                            <th className="px-6 py-4">PnL</th>
                                            <th className="px-6 py-4">Imagenes</th>
                                            <th className="px-6 py-4">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {selectedAccount?.market_type === 'binary'
                                            ? (trades.binary || []).map((t: any) => {
                                                const pnl = t.status === 'win' ? t.investment * t.payout_pct : t.status === 'loss' ? -t.investment : 0;
                                                const base = typeof window !== 'undefined' ? `http://${window.location.hostname}:8080` : '';
                                                return (
                                                    <tr key={`b-${t.id}`} className="text-sm border-white/5">
                                                        <td className="px-6 py-4 text-zinc-400">{new Date(t.open_date).toLocaleString()}</td>
                                                        <td className="px-6 py-4 text-white font-semibold">{t.instrument}</td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${t.status === 'win' ? 'bg-emerald-500/10 text-emerald-500' : t.status === 'loss' ? 'bg-rose-500/10 text-rose-500' : 'bg-white/10 text-white/70'}`}>
                                                                {t.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 font-bold text-zinc-200">${t.investment.toLocaleString()}</td>
                                                        <td className={`px-6 py-4 font-bold ${t.status === 'open' ? 'text-zinc-500' : pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                            {t.status === 'open' ? '--' : `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toLocaleString()}`}
                                                        </td>
                                                        <td className="px-6 py-4 text-xs text-teal-400">
                                                            {t.before_image ? (
                                                                <a className="underline mr-3" href={`${base}/media/trades/${t.before_image}`} target="_blank" rel="noreferrer">Antes</a>
                                                            ) : null}
                                                            {t.after_image ? (
                                                                <a className="underline" href={`${base}/media/trades/${t.after_image}`} target="_blank" rel="noreferrer">Despues</a>
                                                            ) : null}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {t.status === 'open' ? (
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => openCloseTradeModal(t)}
                                                                        className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 transition-colors"
                                                                    >
                                                                        Cerrar
                                                                    </button>
                                                                    <button
                                                                        onClick={() => deleteOpenTrade(t)}
                                                                        className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors"
                                                                        disabled={formLoading}
                                                                    >
                                                                        Eliminar
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span className="text-zinc-600 text-xs">--</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                            : (trades.forex || []).map((t: any) => {
                                                const base = typeof window !== 'undefined' ? `http://${window.location.hostname}:8080` : '';
                                                return (
                                                    <tr key={`f-${t.id}`} className="text-sm border-white/5">
                                                        <td className="px-6 py-4 text-zinc-400">{new Date(t.open_date).toLocaleString()}</td>
                                                        <td className="px-6 py-4 text-white font-semibold">{t.instrument}</td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${t.status === 'win' ? 'bg-emerald-500/10 text-emerald-500' : t.status === 'loss' ? 'bg-rose-500/10 text-rose-500' : 'bg-white/10 text-white/70'}`}>
                                                                {t.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 font-bold text-zinc-200">${t.investment.toLocaleString()}</td>
                                                        <td className={`px-6 py-4 font-bold ${t.status === 'open' ? 'text-zinc-500' : t.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                            {t.status === 'open' ? '--' : `${t.pnl >= 0 ? '+' : '-'}$${Math.abs(t.pnl).toLocaleString()}`}
                                                        </td>
                                                        <td className="px-6 py-4 text-xs text-teal-400">
                                                            {t.before_image ? (
                                                                <a className="underline mr-3" href={`${base}/media/trades/${t.before_image}`} target="_blank" rel="noreferrer">Antes</a>
                                                            ) : null}
                                                            {t.after_image ? (
                                                                <a className="underline" href={`${base}/media/trades/${t.after_image}`} target="_blank" rel="noreferrer">Despues</a>
                                                            ) : null}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {t.status === 'open' ? (
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => openCloseTradeModal(t)}
                                                                        className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 transition-colors"
                                                                    >
                                                                        Cerrar
                                                                    </button>
                                                                    <button
                                                                        onClick={() => deleteOpenTrade(t)}
                                                                        className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors"
                                                                        disabled={formLoading}
                                                                    >
                                                                        Eliminar
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span className="text-zinc-600 text-xs">--</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-gradient-to-br from-teal-500 to-emerald-700 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl shadow-teal-500/20">
                            <div className="relative z-10">
                                <h3 className="text-xl font-bold mb-2">Acción Rápida</h3>
                                <p className="text-white/60 text-sm mb-8">
                                    {selectedAccount ? `Operando en: ${selectedAccount.name}` : 'Selecciona una cuenta'}
                                </p>

                                <div className="space-y-3">
                                    <button
                                        disabled={!selectedAccount}
                                        onClick={() => { setModalType('deposit'); setShowModal(true); }}
                                        className="w-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 py-4 rounded-2xl flex items-center justify-center gap-3 font-bold transition-all disabled:opacity-50"
                                    >
                                        <ArrowDownCircle size={22} />
                                        Depositar Fondos
                                    </button>
                                    <button
                                        disabled={!selectedAccount}
                                        onClick={() => { setModalType('withdrawal'); setShowModal(true); }}
                                        className="w-full bg-black/20 hover:bg-black/40 border border-white/5 py-4 rounded-2xl flex items-center justify-center gap-3 font-bold transition-all disabled:opacity-50"
                                    >
                                        <ArrowUpCircle size={22} />
                                        Retirar Capital
                                    </button>

                                    <button
                                        disabled={!selectedAccount}
                                        onClick={openTradeModal}
                                        className="w-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 py-4 rounded-2xl flex items-center justify-center gap-3 font-bold transition-all disabled:opacity-50"
                                    >
                                        <TrendingUp size={22} />
                                        Registrar Operacion
                                    </button>
                                </div>
                            </div>
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
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-md p-8 relative z-10"
                        >
                            <button onClick={() => setShowModal(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white">
                                <X size={20} />
                            </button>

                            <h2 className="text-2xl font-bold mb-6">
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
                                            <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Nombre de Cuenta</label>
                                            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} required className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Ej: Forex VIP 1" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Mercado</label>
                                            <select value={marketType} onChange={(e) => setMarketType(e.target.value)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none">
                                                <option value="forex">Forex</option>
                                                <option value="binary">Binarias</option>
                                            </select>
                                        </div>
                                    </>
                                ) : modalType === 'trade' ? (
                                    <>
                                        <div>
                                            <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Instrumento</label>
                                            {tradingConfig.instruments?.length ? (
                                                <select
                                                    value={tradeInstrument}
                                                    onChange={(e) => setTradeInstrument(e.target.value)}
                                                    className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none"
                                                >
                                                    {tradingConfig.instruments.map((ins) => (
                                                        <option key={ins} value={ins}>{ins}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    value={tradeInstrument}
                                                    onChange={(e) => setTradeInstrument(e.target.value)}
                                                    required
                                                    className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none"
                                                    placeholder="Ej: EUR/USD"
                                                />
                                            )}
                                        </div>

                                        <div>
                                            <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Inversion (USD)</label>
                                            <input type="number" step="1" value={tradeInvestment} onChange={(e) => setTradeInvestment(e.target.value)} required className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="0" />
                                        </div>

                                        {selectedAccount?.market_type === 'binary' ? (
                                            <>
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Direccion</label>
                                                    <select value={binaryDirection} onChange={(e) => setBinaryDirection(e.target.value as any)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none">
                                                        <option value="CALL">CALL</option>
                                                        <option value="PUT">PUT</option>
                                                    </select>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Payout</label>
                                                        {tradingConfig.payout_options?.length ? (
                                                            <select value={binaryPayoutPct} onChange={(e) => setBinaryPayoutPct(e.target.value)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none">
                                                        {tradingConfig.payout_options.map((p) => (
                                                                    <option key={String(p)} value={String(p)}>{Math.round(Number(p) * 100)}%</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <input type="number" step="0.01" value={binaryPayoutPct} onChange={(e) => setBinaryPayoutPct(e.target.value)} required className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="0.85" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Expiracion</label>
                                                        {tradingConfig.expiry_times?.length ? (
                                                            <select value={binaryExpiry} onChange={(e) => setBinaryExpiry(e.target.value)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none">
                                                                {tradingConfig.expiry_times.map((t) => (
                                                                    <option key={t} value={t}>{t}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <input value={binaryExpiry} onChange={(e) => setBinaryExpiry(e.target.value)} required className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="5m" />
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Direccion</label>
                                                    <select value={forexDirection} onChange={(e) => setForexDirection(e.target.value as any)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none">
                                                        <option value="BUY">BUY</option>
                                                        <option value="SELL">SELL</option>
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Entry</label>
                                                    <input type="number" step="0.00001" value={forexEntryPrice} onChange={(e) => setForexEntryPrice(e.target.value)} required className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="1.10000" />
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Stop Loss (opcional)</label>
                                                        <input type="number" step="0.00001" value={forexStopLoss} onChange={(e) => setForexStopLoss(e.target.value)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="1.09500" />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Take Profit (opcional)</label>
                                                        <input type="number" step="0.00001" value={forexTakeProfit} onChange={(e) => setForexTakeProfit(e.target.value)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="1.11000" />
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        <div>
                                            <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Notas</label>
                                            <input value={tradeNotes} onChange={(e) => setTradeNotes(e.target.value)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Opcional" />
                                        </div>

                                        <div className="grid grid-cols-1 gap-3">
                                            <div>
                                                <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Imagen antes (opcional)</label>
                                                <input type="file" accept="image/*" onChange={(e) => setTradeBeforeImage(e.target.files?.[0] || null)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white" />
                                            </div>
                                        </div>
                                    </>
                                ) : modalType === 'trade_close' ? (
                                    <>
                                        <div className="bg-black/40 border border-white/10 rounded-2xl p-4">
                                            <div className="text-xs font-black uppercase tracking-widest text-zinc-500">Operacion</div>
                                            <div className="mt-2 text-sm font-bold text-white">
                                                {closingTrade ? `${closingTrade.instrument} • $${Number(closingTrade.investment || 0).toLocaleString()}` : '--'}
                                            </div>
                                        </div>

                                        {selectedAccount?.market_type === 'binary' ? (
                                            <>
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Resultado</label>
                                                    <select value={binaryResult} onChange={(e) => setBinaryResult(e.target.value as any)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none">
                                                        <option value="WIN">WIN</option>
                                                        <option value="LOSS">LOSS</option>
                                                        <option value="BE">BE</option>
                                                    </select>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">PnL (USD)</label>
                                                    <input type="number" step="0.01" value={forexPnlAmount} onChange={(e) => setForexPnlAmount(e.target.value)} required className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="-5 / 10" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Exit (opcional)</label>
                                                    <input type="number" step="0.00001" value={forexExitPrice} onChange={(e) => setForexExitPrice(e.target.value)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="1.10500" />
                                                </div>
                                            </>
                                        )}

                                        <div>
                                            <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Notas</label>
                                            <input value={tradeNotes} onChange={(e) => setTradeNotes(e.target.value)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Opcional" />
                                        </div>

                                        <div>
                                            <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Imagen despues (opcional)</label>
                                            <input type="file" accept="image/*" onChange={(e) => setTradeAfterImage(e.target.files?.[0] || null)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Monto (USD)</label>
                                            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="0.00" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-zinc-500 uppercase block mb-2">Concepto / Notas</label>
                                            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Opcional" />
                                        </div>
                                    </>
                                )}
                                <button disabled={formLoading} className="w-full bg-teal-500 hover:bg-teal-400 text-black font-black py-4 rounded-xl flex items-center justify-center gap-2 mt-4">
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
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            initial={{ scale: 0.98, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.98, opacity: 0 }}
                            className="w-full max-w-lg bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden"
                        >
                            <div className="p-6 flex items-start justify-between border-b border-white/5">
                                <div>
                                    <h3 className="text-lg font-black">Eliminar cuenta</h3>
                                    <p className="text-zinc-500 text-sm mt-1">
                                        Se borraran todas las transacciones y operaciones asociadas.
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowDeleteAccount(false);
                                        setAccountToDelete(null);
                                    }}
                                    className="p-2 rounded-xl hover:bg-white/5"
                                >
                                    <X size={18} className="text-zinc-400" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Cuenta</div>
                                    <div className="text-sm font-bold text-white">
                                        {accountToDelete.name} ({accountToDelete.market_type})
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setShowDeleteAccount(false);
                                            setAccountToDelete(null);
                                        }}
                                        className="flex-1 bg-zinc-900 border border-white/10 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest"
                                        disabled={formLoading}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleDeleteAccount}
                                        className="flex-1 bg-rose-500 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-400 disabled:opacity-50"
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
