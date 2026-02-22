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
    BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import ToastStack from '@/components/ToastStack';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = () => {
        Cookies.remove('token');
        router.push('/login');
    };

    const menuItems = [
        { icon: LayoutDashboard, label: 'Resumen', path: '/dashboard' },
        { icon: Wallet, label: 'Balance', path: '/dashboard/balance' },
        { icon: History, label: 'Informes', path: '/dashboard/reports' },
        { icon: BarChart3, label: 'Métricas', path: '/dashboard/metrics' },
        { icon: BrainCircuit, label: 'Estrategia', path: '/dashboard/strategy' },
        { icon: MessageSquare, label: 'Jade Bot', path: '/dashboard/bot' },
        { icon: BookOpen, label: 'Librería', path: '/dashboard/library' },
        { icon: Settings, label: 'Ajustes', path: '/dashboard/settings' },
    ];

    return (
        <div className="min-h-screen bg-black text-white flex">
            {/* Sidebar Desktop */}
            <aside className={`fixed lg:relative z-50 h-screen transition-all duration-300 bg-zinc-950 border-r border-white/5 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
                <div className="flex flex-col h-full">
                    <div className="p-6 flex items-center gap-4">
                        <div className="w-10 h-10 bg-teal-500 rounded-xl flex items-center justify-center shrink-0">
                            <span className="font-bold text-xl">J</span>
                        </div>
                        {isSidebarOpen && <span className="font-bold text-lg tracking-tight">JADE CAPITAL</span>}
                    </div>

                    <nav className="flex-1 px-4 py-6 space-y-2">
                        {menuItems.map((item) => {
                            const isActive = pathname === item.path;
                            return (
                                <Link
                                    key={item.label}
                                    href={item.path}
                                    className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all group ${isActive
                                            ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                                            : 'text-zinc-400 hover:bg-white/5 hover:text-white border border-transparent'
                                        }`}
                                >
                                    <item.icon size={22} className="shrink-0" />
                                    {isSidebarOpen && <span className="font-medium text-sm">{item.label}</span>}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="p-4 mt-auto">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                        >
                            <LogOut size={22} className="shrink-0" />
                            {isSidebarOpen && <span className="font-medium text-sm">Cerrar Sesión</span>}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 h-screen overflow-y-auto bg-[#050505]">
                <header className="h-20 border-bottom border-white/5 flex items-center justify-between px-8 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-40">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-white/5 rounded-lg text-zinc-400">
                            <Menu size={24} />
                        </button>
                        <h2 className="text-xl font-bold">Dashboard Principal</h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-bold">Master Trader</p>
                            <p className="text-xs text-zinc-500 uppercase tracking-tighter">Administrador</p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 border border-white/10" />
                    </div>
                </header>

                <ToastStack />

                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
