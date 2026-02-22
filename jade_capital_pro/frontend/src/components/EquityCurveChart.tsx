"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import { createChart, ColorType, LineSeries, type LineData, type UTCTimestamp } from 'lightweight-charts';

export type EquityPoint = {
    time: number; // unix seconds
    value: number;
};

type Props = {
    points: EquityPoint[];
    projectionPoints?: EquityPoint[];
};

const toLine = (points: EquityPoint[]): LineData[] => {
    // lightweight-charts requires strictly ascending time values.
    // If multiple events share the same second, keep the last value for that second.
    const byTime = new Map<number, number>();
    for (const p of points) {
        let t = Number((p as any)?.time);
        const v = Number((p as any)?.value);
        if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
        // Accept ms timestamps defensively.
        if (t > 50_000_000_000) t = t / 1000;
        byTime.set(Math.floor(t), v);
    }

    const times = Array.from(byTime.keys()).sort((a, b) => a - b);
    const out: LineData[] = [];
    let prev = -Infinity;
    for (const t of times) {
        if (!Number.isFinite(t)) continue;
        if (t === prev) {
            // Should be impossible with Map keys, but keep strictly increasing for safety.
            continue;
        }
        if (t < prev) continue;
        prev = t;
        out.push({ time: t as UTCTimestamp, value: byTime.get(t)! });
    }
    return out;
};

export default function EquityCurveChart({ points, projectionPoints }: Props) {
    const ref = useRef<HTMLDivElement>(null);

    const line = useMemo(() => toLine(points), [points]);
    const proj = useMemo(() => (projectionPoints ? toLine(projectionPoints) : null), [projectionPoints]);

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
            rightPriceScale: {
                borderColor: 'rgba(255,255,255,0.06)',
            },
            timeScale: {
                borderColor: 'rgba(255,255,255,0.06)',
            },
            width: ref.current.clientWidth,
            height: ref.current.clientHeight || 380,
        });

        const equitySeries = chart.addSeries(LineSeries, {
            color: '#14b8a6',
            lineWidth: 2,
        });
        equitySeries.setData(line);

        let projectionSeries: ReturnType<typeof chart.addSeries> | null = null;
        if (proj && proj.length) {
            projectionSeries = chart.addSeries(LineSeries, {
                color: 'rgba(255,255,255,0.35)',
                lineWidth: 2,
                lineStyle: 2, // dashed
            });
            projectionSeries.setData(proj);
        }

        chart.timeScale().fitContent();

        const handleResize = () => {
            if (!ref.current) return;
            chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight || 380 });
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            projectionSeries = null;
            chart.remove();
        };
    }, [line, proj]);

    return <div ref={ref} className="w-full h-full min-h-[380px]" />;
}
