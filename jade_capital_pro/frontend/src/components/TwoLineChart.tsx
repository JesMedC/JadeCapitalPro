"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import { createChart, ColorType, LineSeries, HistogramSeries, type LineData, type UTCTimestamp } from 'lightweight-charts';

export type SeriesPoint = { time: number; value: number };

type Props = {
    a: { name: string; color: string; points: SeriesPoint[] };
    b?: { name: string; color: string; points: SeriesPoint[] };
    type?: 'line' | 'histogram';
    height?: number;
};

const normalize = (points: SeriesPoint[], type: 'line' | 'histogram'): any[] => {
    const byTime = new Map<number, number>();
    for (const p of points) {
        if (!Number.isFinite(p.time) || !Number.isFinite(p.value)) continue;
        byTime.set(Math.floor(p.time), p.value);
    }
    const times = Array.from(byTime.keys()).sort((x, y) => x - y);
    return times.map((t) => {
        const val = byTime.get(t)!;
        if (type === 'histogram') {
            return {
                time: t as UTCTimestamp,
                value: val,
                color: val >= 0 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)'
            };
        }
        return { time: t as UTCTimestamp, value: val };
    });
};

export default function TwoLineChart({ a, b, type = 'line', height = 300 }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const aLine = useMemo(() => normalize(a.points, type), [a.points, type]);
    const bLine = useMemo(() => normalize(b?.points || [], type), [b?.points, type]);

    useEffect(() => {
        if (!ref.current) return;

        const isDark = document.documentElement.classList.contains('dark');
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
        const borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDark ? '#a1a1aa' : '#71717a';

        const chart = createChart(ref.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: textColor,
            },
            grid: {
                vertLines: { color: gridColor },
                horzLines: { color: gridColor },
            },
            rightPriceScale: {
                borderColor: borderColor,
                scaleMargins: { top: 0.1, bottom: 0.1 },
            },
            timeScale: {
                borderColor: borderColor,
                barSpacing: 10,
            },
            width: ref.current.clientWidth,
            height: height,
        });

        const SeriesType = type === 'histogram' ? HistogramSeries : LineSeries;

        const sA = chart.addSeries(SeriesType, {
            color: a.color,
            ...(type === 'line' ? { lineWidth: 2 } : { base: 0 })
        } as any);
        sA.setData(aLine);

        if (b && bLine.length > 0) {
            const sB = chart.addSeries(SeriesType, {
                color: b.color,
                ...(type === 'line' ? { lineWidth: 2, lineStyle: 2 } : { base: 0 })
            } as any);
            sB.setData(bLine);
        }

        chart.timeScale().fitContent();

        const handleResize = () => {
            if (!ref.current) return;
            chart.applyOptions({ width: ref.current.clientWidth, height: height });
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [aLine, bLine, a.color, b?.color, type, height]);

    return (
        <div className="w-full">
            <div className="flex flex-wrap items-center gap-6 mb-4 px-2">
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{a.name}</span>
                </div>
                {b && (
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full border border-dashed" style={{ borderColor: b.color }} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{b.name}</span>
                    </div>
                )}
            </div>
            <div ref={ref} className="w-full" />
        </div>
    );
}
