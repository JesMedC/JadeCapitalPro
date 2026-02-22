"use client";

import React from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    HistogramSeries,
    type IChartApi,
    type ISeriesApi,
    type CandlestickData,
    type HistogramData,
    type UTCTimestamp,
} from 'lightweight-charts';
import api from '@/lib/api';

type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number };
type Zone = { low: number; mid?: number; high: number };

type Props = {
    instrument: string;
    variant?: 'light' | 'dark';
    timeframe?: '5m';
    entryPrice?: number;
    invalidationPrice?: number;
    zone?: Zone;
    onDataStatus?: (s: { instrument: string; ok: boolean; provider: string }) => void;
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

const toSec = (t: any) => {
    const n = Number(t);
    if (!Number.isFinite(n)) return 0;
    return n > 50_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
};

const toCandles = (candles: Candle[]): CandlestickData[] => {
    const byTime = new Map<number, Candle>();
    for (const c of candles) byTime.set(toSec(c.time), c);
    const times = Array.from(byTime.keys()).sort((a, b) => a - b);
    return times.map((t) => {
        const c = byTime.get(t)!;
        return {
            time: t as UTCTimestamp,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
        };
    });
};

const toVolume = (candles: Candle[]): HistogramData[] => {
    const byTime = new Map<number, Candle>();
    for (const c of candles) byTime.set(toSec(c.time), c);
    const times = Array.from(byTime.keys()).sort((a, b) => a - b);
    return times.map((t) => {
        const c = byTime.get(t)!;
        const v = Number(c.volume || 0);
        const up = Number(c.close) >= Number(c.open);
        return {
            time: t as UTCTimestamp,
            value: v,
            color: up ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.35)',
        };
    });
};

export default function TradingChart({
    instrument,
    variant = 'light',
    timeframe = '5m',
    entryPrice,
    invalidationPrice,
    zone,
    onDataStatus,
}: Props) {
    const stepSec = 5 * 60;
    const maxBars = 200;

    const containerRef = React.useRef<HTMLDivElement>(null);
    const chartRef = React.useRef<IChartApi | null>(null);
    const candlesSeriesRef = React.useRef<ISeriesApi<'Candlestick'> | null>(null);
    const volumeSeriesRef = React.useRef<ISeriesApi<'Histogram'> | null>(null);

    const entryLineRef = React.useRef<any>(null);
    const invalidLineRef = React.useRef<any>(null);
    const zoneLowLineRef = React.useRef<any>(null);
    const zoneHighLineRef = React.useRef<any>(null);

    const candlesRef = React.useRef<Candle[]>([]);
    const [ohlc, setOhlc] = React.useState<{ o: number; h: number; l: number; c: number } | null>(null);

    const isLight = variant === 'light';

    const lockLastBars = React.useCallback(() => {
        if (!chartRef.current || !containerRef.current) return;
        const bars = candlesRef.current.length;
        const to = Math.max(0, bars - 1);
        const from = Math.max(0, to - (maxBars - 1));
        const w = Math.max(1, containerRef.current.clientWidth);
        const bs = clamp(w / maxBars, 4, 14);
        chartRef.current.timeScale().applyOptions({ barSpacing: bs, rightOffset: 6 });
        try {
            chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
        } catch {
            // ignore
        }
    }, []);

    const applyLevels = React.useCallback(() => {
        const cs = candlesSeriesRef.current;
        if (!cs) return;
        try {
            if (entryLineRef.current) cs.removePriceLine(entryLineRef.current);
            if (invalidLineRef.current) cs.removePriceLine(invalidLineRef.current);
            if (zoneLowLineRef.current) cs.removePriceLine(zoneLowLineRef.current);
            if (zoneHighLineRef.current) cs.removePriceLine(zoneHighLineRef.current);
        } catch {
            // ignore
        }
        entryLineRef.current = null;
        invalidLineRef.current = null;
        zoneLowLineRef.current = null;
        zoneHighLineRef.current = null;

        if (Number.isFinite(Number(entryPrice))) {
            entryLineRef.current = cs.createPriceLine({
                price: Number(entryPrice),
                color: 'rgba(14,116,144,0.95)',
                lineStyle: 0,
                lineWidth: 2,
                axisLabelVisible: true,
                title: 'ENTRY',
            });
        }
        if (Number.isFinite(Number(invalidationPrice))) {
            invalidLineRef.current = cs.createPriceLine({
                price: Number(invalidationPrice),
                color: 'rgba(244,63,94,0.95)',
                lineStyle: 2,
                lineWidth: 2,
                axisLabelVisible: true,
                title: 'INVAL',
            });
        }
        if (zone && Number.isFinite(Number(zone.low)) && Number.isFinite(Number(zone.high))) {
            zoneLowLineRef.current = cs.createPriceLine({
                price: Number(zone.low),
                color: 'rgba(234,179,8,0.55)',
                lineStyle: 3,
                lineWidth: 2,
                axisLabelVisible: false,
                title: 'ZONE',
            });
            zoneHighLineRef.current = cs.createPriceLine({
                price: Number(zone.high),
                color: 'rgba(234,179,8,0.55)',
                lineStyle: 3,
                lineWidth: 2,
                axisLabelVisible: false,
                title: 'ZONE',
            });
        }
    }, [entryPrice, invalidationPrice, zone]);

    React.useEffect(() => {
        applyLevels();
    }, [applyLevels]);

    React.useEffect(() => {
        if (!containerRef.current) return;
        if (chartRef.current) return;

        const chart = createChart(containerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: isLight ? '#0f172a' : '#e5e7eb',
                fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
                fontSize: 12,
            },
            grid: {
                vertLines: { color: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)' },
                horzLines: { color: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)' },
            },
            crosshair: { mode: 0 },
            rightPriceScale: {
                borderColor: isLight ? 'rgba(15,23,42,0.16)' : 'rgba(255,255,255,0.16)',
                scaleMargins: { top: 0.08, bottom: 0.18 },
            },
            timeScale: {
                borderColor: isLight ? 'rgba(15,23,42,0.16)' : 'rgba(255,255,255,0.16)',
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 6,
            },
            handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
            handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false, axisDoubleClickReset: false },
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
        });

        const cs = chart.addSeries(CandlestickSeries, {
            upColor: '#16a34a',
            downColor: '#dc2626',
            borderVisible: false,
            wickUpColor: '#16a34a',
            wickDownColor: '#dc2626',
            priceLineVisible: true,
            lastValueVisible: true,
        });

        const vol = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'vol',
        });
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

        chartRef.current = chart;
        candlesSeriesRef.current = cs;
        volumeSeriesRef.current = vol;

        chart.subscribeCrosshairMove((param) => {
            if (!param || !param.time) return;
            const sd = param.seriesData.get(cs as any) as any;
            if (!sd) return;
            setOhlc({ o: sd.open, h: sd.high, l: sd.low, c: sd.close });
        });

        const ro = new ResizeObserver(() => {
            if (!containerRef.current) return;
            chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
            lockLastBars();
        });
        ro.observe(containerRef.current);

        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            candlesSeriesRef.current = null;
            volumeSeriesRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLight]);

    const loadInitial = React.useCallback(async () => {
        if (!instrument) return;
        const res = await api.get(
            `/bot/market/candles?instrument=${encodeURIComponent(instrument)}&expiry_time=${encodeURIComponent(timeframe)}&limit=${maxBars}`
        );
        const next = (res.data?.candles || []) as Candle[];
        const provider = String(res.data?.provider || 'unknown');
        if (onDataStatus) onDataStatus({ instrument, ok: next.length > 0, provider });
        const data = next.slice(-maxBars);
        candlesRef.current = data;
        candlesSeriesRef.current?.setData(toCandles(data));
        volumeSeriesRef.current?.setData(toVolume(data));
        lockLastBars();
        if (data.length) {
            const last = data[data.length - 1];
            setOhlc({ o: last.open, h: last.high, l: last.low, c: last.close });
        } else {
            setOhlc(null);
        }
    }, [instrument, timeframe, lockLastBars, onDataStatus]);

    React.useEffect(() => {
        loadInitial().catch(() => {
            if (onDataStatus) onDataStatus({ instrument, ok: false, provider: 'error' });
        });
    }, [loadInitial, instrument, onDataStatus]);

    const updateCurrentCandle = React.useCallback(
        (price: number, tsSec: number) => {
            const list = candlesRef.current;
            if (!list.length) return;
            const bucket = Math.floor(tsSec / stepSec) * stepSec;
            const last = list[list.length - 1];
            const lastT = toSec(last.time);

            if (bucket > lastT) {
                const open = Number(last.close);
                const c: Candle = { time: bucket, open, high: price, low: price, close: price, volume: 0 };
                const next = [...list, c].slice(-maxBars);
                candlesRef.current = next;
                candlesSeriesRef.current?.setData(toCandles(next));
                volumeSeriesRef.current?.setData(toVolume(next));
                lockLastBars();
                setOhlc({ o: c.open, h: c.high, l: c.low, c: c.close });
                return;
            }

            const upd: Candle = {
                ...last,
                high: Math.max(Number(last.high), price),
                low: Math.min(Number(last.low), price),
                close: price,
            };
            list[list.length - 1] = upd;
            candlesSeriesRef.current?.update({
                time: lastT as UTCTimestamp,
                open: Number(upd.open),
                high: Number(upd.high),
                low: Number(upd.low),
                close: Number(upd.close),
            });
            setOhlc({ o: upd.open, h: upd.high, l: upd.low, c: upd.close });
        },
        [lockLastBars]
    );

    React.useEffect(() => {
        if (!instrument) return;
        let alive = true;
        const tickId = window.setInterval(async () => {
            if (!alive) return;
            try {
                const res = await api.get(`/bot/market/price?instrument=${encodeURIComponent(instrument)}`);
                const px = Number(res.data?.price);
                if (!Number.isFinite(px)) return;
                const now = Math.floor(Date.now() / 1000);
                updateCurrentCandle(px, now);
            } catch {
                // silent
            }
        }, 1000);

        const syncId = window.setInterval(() => {
            if (!alive) return;
            loadInitial().catch(() => {
                // silent
            });
        }, 30_000);

        return () => {
            alive = false;
            window.clearInterval(tickId);
            window.clearInterval(syncId);
        };
    }, [instrument, loadInitial, updateCurrentCandle]);

    return (
        <div className={`w-full h-full ${isLight ? 'bg-white' : 'bg-slate-950 text-slate-100'}`}>
            <div className={`px-4 py-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'} flex items-center justify-between gap-4`}>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <div className={`font-black ${isLight ? 'text-slate-900' : 'text-white'} truncate`}>{instrument || '--'}</div>
                        <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">M5</div>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">OHLC</div>
                    <div className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {ohlc ? (
                            <>O {ohlc.o.toFixed(5)} H {ohlc.h.toFixed(5)} L {ohlc.l.toFixed(5)} C {ohlc.c.toFixed(5)}</>
                        ) : (
                            '--'
                        )}
                    </div>
                </div>
            </div>
            <div className="w-full h-[740px]" ref={containerRef} />
        </div>
    );
}
