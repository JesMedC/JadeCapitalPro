"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import { createChart, ColorType, LineSeries, type LineData, type UTCTimestamp } from 'lightweight-charts';

export type SeriesPoint = { time: number; value: number };

type Props = {
    a: { name: string; color: string; points: SeriesPoint[] };
    b: { name: string; color: string; points: SeriesPoint[] };
};

const normalize = (points: SeriesPoint[]): LineData[] => {
    const byTime = new Map<number, number>();
    for (const p of points) {
        if (!Number.isFinite(p.time) || !Number.isFinite(p.value)) continue;
        byTime.set(Math.floor(p.time), p.value);
    }
    const times = Array.from(byTime.keys()).sort((x, y) => x - y);
    return times.map((t) => ({ time: t as UTCTimestamp, value: byTime.get(t)! }));
};

export default function TwoLineChart({ a, b }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const aLine = useMemo(() => normalize(a.points), [a.points]);
    const bLine = useMemo(() => normalize(b.points), [b.points]);

    useEffect(() => {
        if (!ref.current) return;

        const chart = createChart(ref.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#a1a1aa',
            },
            grid: {
                vertLines: { color: 'rgba(255,255,255,0.05)' },
                horzLines: { color: 'rgba(255,255,255,0.05)' },
            },
            rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)' },
            timeScale: { borderColor: 'rgba(255,255,255,0.06)' },
            width: ref.current.clientWidth,
            height: ref.current.clientHeight || 360,
        });

        const sA = chart.addSeries(LineSeries, { color: a.color, lineWidth: 2 });
        sA.setData(aLine);

        const sB = chart.addSeries(LineSeries, { color: b.color, lineWidth: 2, lineStyle: 2 });
        sB.setData(bLine);

        chart.timeScale().fitContent();

        const handleResize = () => {
            if (!ref.current) return;
            chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight || 360 });
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [aLine, bLine, a.color, b.color]);

    return (
        <div>
            <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">
                <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: a.color }} />{a.name}</span>
                <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: b.color }} />{b.name}</span>
            </div>
            <div ref={ref} className="w-full h-[360px]" />
        </div>
    );
}
