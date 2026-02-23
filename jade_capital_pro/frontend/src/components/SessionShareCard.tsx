"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Target, Share2, Award, Zap } from 'lucide-react';

type Props = {
    wins: number;
    losses: number;
    winRate: number;
    pnl: number;
    sessionName: string;
};

export default function SessionShareCard({ wins, losses, winRate, pnl, sessionName }: Props) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden group rounded-[40px] bg-zinc-950 p-[2px] shadow-2xl"
        >
            {/* Animated Gradient Border */}
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 animate-[gradient_3s_linear_infinite] opacity-50 blur-xl" />

            <div className="relative bg-zinc-950 rounded-[38px] p-8 overflow-hidden">
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--primary)_0%,_transparent_70%)] blur-3xl opacity-20" />
                </div>

                <div className="flex justify-between items-center mb-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <span className="text-xl font-black text-white italic">J</span>
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-white italic tracking-tighter uppercase">Jade Capital</h4>
                            <p className="text-[9px] text-emerald-400 font-black uppercase tracking-[0.2em]">Session Report</p>
                        </div>
                    </div>
                    <div className="px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{sessionName}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-10">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Performance</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black text-white italic tracking-tighter">
                                {wins}W - {losses}L
                            </span>
                        </div>
                    </div>
                    <div className="space-y-1 text-right">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Win Rate</p>
                        <div className="flex items-baseline justify-end gap-1">
                            <span className="text-4xl font-black text-emerald-400 italic tracking-tighter">
                                {winRate}%
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 rounded-3xl p-6 flex flex-col items-center justify-center relative group-hover:scale-[1.02] transition-transform duration-500">
                    <p className="text-[10px] font-black text-emerald-400/80 uppercase tracking-[0.3em] mb-2">Net Profit</p>
                    <span className="text-5xl font-black text-white italic tracking-tighter drop-shadow-2xl">
                        {pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toLocaleString()}
                    </span>
                    <Zap className="absolute -right-2 -top-2 text-primary w-8 h-8 opacity-20" />
                </div>

                <div className="mt-10 flex justify-between items-center border-t border-white/5 pt-6">
                    <div className="flex items-center gap-4 text-zinc-500">
                        <Award size={18} className="text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Master Trader Plan</span>
                    </div>
                    <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 p-3 rounded-2xl transition-all text-white/50 hover:text-white group/btn">
                        <Share2 size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Compartir</span>
                    </button>
                </div>
            </div>

            <style jsx>{`
                @keyframes gradient {
                    0% { transform: translateX(-100%) }
                    100% { transform: translateX(100%) }
                }
            `}</style>
        </motion.div>
    );
}
