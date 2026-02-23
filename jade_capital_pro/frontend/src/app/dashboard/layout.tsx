"use client";

import React, { useState } from 'react';
import {
    BarChart3,
    Wallet,
    History,
    Settings,
    LogOut,
    Menu,
    X,
    LayoutDashboard,
    BrainCircuit,
    MessageSquare,
    BookOpen,
    Sun,
    Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import ToastStack from '@/components/ToastStack';
import api from '@/lib/api';
import { useToastStore } from '@/lib/toastStore';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const [theme, setTheme] = useState('dark');
    const pathname = usePathname();
    const router = useRouter();
    const pushToast = useToastStore((s) => s.push);
    const lastAlertIdRef = React.useRef<number>(0);

    React.useEffect(() => {
        const check = async () => {
            try {
                const statusRes = await api.get('/bot/scanner/status');
                if (!statusRes.data?.running) return;

                const alertsRes = await api.get('/bot/alerts?limit=1');
                const latest = alertsRes.data?.[0];
                if (latest && latest.id > lastAlertIdRef.current) {
                    const isFirstRun = lastAlertIdRef.current === 0;
                    lastAlertIdRef.current = latest.id;

                    if (!isFirstRun && latest.alert_type === 'entry' && pathname !== '/dashboard/bot') {
                        pushToast({
                            type: 'info',
                            title: `Jade Bot: Alerta ${latest.instrument}`,
                            message: `${latest.direction} Detectado @ ${latest.price}`,
                            timeoutMs: 10000
                        });
                    }
                }
            } catch (err) {
                // background fail silent
            }
        };

        const id = setInterval(check, 10000);
        check(); // run once
        return () => clearInterval(id);
    }, [pathname, pushToast]);

    React.useEffect(() => {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        setTheme(savedTheme);
        document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    }, []);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        localStorage.setItem('theme', next);
        document.documentElement.classList.toggle('dark', next === 'dark');
    };

    const handleLogout = () => {
        Cookies.remove('token');
        router.push('/login');
    };

    const menuItems = [
        { icon: LayoutDashboard, label: 'Resumen', path: '/dashboard' },
        { icon: Wallet, label: 'Balance', path: '/dashboard/balance' },
        { icon: History, label: 'Reportes', path: '/dashboard/reports' },
        { icon: BarChart3, label: 'Métricas', path: '/dashboard/metrics' },
        { icon: BrainCircuit, label: 'Estrategia', path: '/dashboard/strategy' },
        { icon: MessageSquare, label: 'Jade Bot', path: '/dashboard/bot' },
        { icon: BookOpen, label: 'Librería', path: '/dashboard/library' },
        { icon: Settings, label: 'Ajustes', path: '/dashboard/settings' },
    ];

    return (
        <div className="min-h-screen bg-background text-foreground flex transition-colors duration-300">
            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {!isSidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSidebarOpen(true)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside className={`fixed lg:sticky top-0 z-[70] h-screen transition-all duration-500 bg-sidebar-bg border-r border-sidebar-border shadow-2xl overflow-hidden flex flex-col ${isSidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full lg:w-24 lg:translate-x-0'}`}>
                <div className="p-8 flex items-center gap-4 shrink-0">
                    <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                        <span className="font-black text-xl text-black">J</span>
                    </div>
                    <div className={`transition-all duration-300 overflow-hidden ${isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0'}`}>
                        <span className="font-black text-lg tracking-tighter uppercase italic">Jade <span className="text-emerald-500 not-italic">Capital</span></span>
                    </div>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto custom-scrollbar">
                    {menuItems.map((item) => {
                        const isActive = pathname === item.path;
                        return (
                            <Link
                                key={item.label}
                                href={item.path}
                                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all group overflow-hidden ${isActive
                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                    : 'text-muted-foreground hover:bg-white/[0.03] hover:text-foreground border border-transparent'
                                    }`}
                            >
                                <item.icon size={22} className={`shrink-0 transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                                <span className={`font-bold text-sm tracking-tight whitespace-nowrap transition-all duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-6 space-y-3 shrink-0 bg-black/10">
                    <button
                        onClick={toggleTheme}
                        className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/[0.03] transition-all text-muted-foreground hover:text-foreground overflow-hidden"
                    >
                        {theme === 'dark' ? <Sun size={20} className="shrink-0" /> : <Moon size={20} className="shrink-0" />}
                        <span className={`font-bold text-xs uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${isSidebarOpen ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>
                            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                        </span>
                    </button>

                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-all overflow-hidden"
                    >
                        <LogOut size={20} className="shrink-0" />
                        <span className={`font-bold text-xs uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${isSidebarOpen ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>
                            Logout
                        </span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
                <header className="h-20 border-b border-sidebar-border flex items-center justify-between px-8 bg-sidebar-bg/50 backdrop-blur-xl sticky top-0 z-40 shrink-0">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setSidebarOpen(!isSidebarOpen)}
                            className="p-2.5 hover:bg-white/5 rounded-xl text-muted-foreground border border-transparent hover:border-white/5 transition-all"
                        >
                            <Menu size={22} />
                        </button>

                        <div className="hidden md:flex items-center gap-2 px-4 py-1.5 bg-emerald-500/5 rounded-full border border-emerald-500/10">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase text-emerald-500 tracking-[0.2em]">Jade Oracle Live</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-5">
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-black text-white tracking-tight">Master Trader</p>
                            <p className="text-[9px] text-emerald-500/60 font-black uppercase tracking-[0.2em] leading-none mt-1">PRO Membership</p>
                        </div>
                        <div className="relative group">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-transparent border border-white/10 flex items-center justify-center font-black group-hover:scale-105 transition-transform cursor-pointer">
                                MT
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#0B0E11]" />
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-8 bg-[#080A0C]">
                    <ToastStack />
                    <div className="max-w-[1600px] mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
