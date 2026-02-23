"use client";

import React from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    HistogramSeries,
    LineSeries,
    type IChartApi,
    type ISeriesApi,
    type CandlestickData,
    type HistogramData,
    type UTCTimestamp,
} from 'lightweight-charts';
import api from '@/lib/api';
import { Trash2, Activity } from 'lucide-react';

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
    const calcEMA = (data: any[], period: number) => {
        if (data.length < period) return [];
        const k = 2 / (period + 1);
        let ema = data[0].close;
        const res = [{ time: data[0].time, value: ema }];
        for (let i = 1; i < data.length; i++) {
            ema = data[i].close * k + ema * (1 - k);
            res.push({ time: data[i].time, value: ema });
        }
        return res;
    };

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

    const [drawings, setDrawings] = React.useState<{ id: number; price: number; color: string }[]>([]);
    const drawingsRef = React.useRef<{ id: number; price: number; color: string }[]>([]);

    const addHorizontalLine = React.useCallback((price: number) => {
        const cs = candlesSeriesRef.current;
        if (!cs) return;
        const id = Date.now();
        const color = 'rgba(234, 179, 8, 0.8)'; // Yellow for manual lines
        const line = cs.createPriceLine({
            price,
            color,
            lineWidth: 1,
            lineStyle: 0,
            axisLabelVisible: true,
            title: 'MARK',
        });
        const d = { id, price, color, line };
        drawingsRef.current.push(d as any);
        setDrawings([...drawingsRef.current]);
    }, []);

    const clearDrawings = () => {
        const cs = candlesSeriesRef.current;
        if (!cs) return;
        drawingsRef.current.forEach((d: any) => {
            if (d.line) cs.removePriceLine(d.line);
        });
        drawingsRef.current = [];
        setDrawings([]);
    };

    const isLight = variant === 'light';

    const lockLastBars = React.useCallback(() => {
        if (!chartRef.current || !containerRef.current) return;
        const bars = candlesRef.current.length;
        const to = Math.max(0, bars - 1);
        const from = Math.max(0, to - (maxBars - 1));
        const w = Math.max(1, containerRef.current.clientWidth);
        const bs = clamp(w / maxBars, 4, 14);
        chartRef.current.timeScale().applyOptions({ barSpacing: bs, rightOffset: 12 });
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
                color: '#02c076',
                lineStyle: 0,
                lineWidth: 2,
                axisLabelVisible: true,
                title: 'ENTRY',
            });
        }
        if (Number.isFinite(Number(invalidationPrice))) {
            invalidLineRef.current = cs.createPriceLine({
                price: Number(invalidationPrice),
                color: '#f84960',
                lineStyle: 2,
                lineWidth: 2,
                axisLabelVisible: true,
                title: 'STOP',
            });
        }
        if (zone && Number.isFinite(Number(zone.low)) && Number.isFinite(Number(zone.high))) {
            zoneLowLineRef.current = cs.createPriceLine({
                price: Number(zone.low),
                color: 'rgba(234,179,8,0.3)',
                lineStyle: 3,
                lineWidth: 1,
                axisLabelVisible: false,
                title: 'Z-LOW',
            });
            zoneHighLineRef.current = cs.createPriceLine({
                price: Number(zone.high),
                color: 'rgba(234,179,8,0.3)',
                lineStyle: 3,
                lineWidth: 1,
                axisLabelVisible: false,
                title: 'Z-HIGH',
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
                background: { type: ColorType.Solid, color: '#0b0e11' },
                textColor: '#848e9c',
                fontFamily: 'BinancePlex, Arial, sans-serif',
                fontSize: 11,
            },
            grid: {
                vertLines: { color: 'rgba(71, 77, 87, 0.1)' },
                horzLines: { color: 'rgba(71, 77, 87, 0.1)' },
            },
            crosshair: {
                mode: 0,
                vertLine: { color: '#848e9c', width: 1, style: 2 },
                horzLine: { color: '#848e9c', width: 1, style: 2 },
            },
            rightPriceScale: {
                borderColor: 'rgba(71, 77, 87, 0.2)',
                scaleMargins: { top: 0.1, bottom: 0.2 },
            },
            timeScale: {
                borderColor: 'rgba(71, 77, 87, 0.2)',
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 12,
            },
            handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
            handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
        });

        const cs = chart.addSeries(CandlestickSeries, {
            upColor: '#02c076',
            downColor: '#f84960',
            borderVisible: false,
            wickUpColor: '#02c076',
            wickDownColor: '#f84960',
            priceLineVisible: true,
            lastValueVisible: true,
        });

        const ema50 = chart.addSeries(LineSeries, { color: '#f3d42f', lineWidth: 1, title: 'EMA 50', lastValueVisible: false, priceLineVisible: false });
        const ema100 = chart.addSeries(LineSeries, { color: '#ff70d2', lineWidth: 1, title: 'EMA 100', lastValueVisible: false, priceLineVisible: false });
        const ema200 = chart.addSeries(LineSeries, { color: '#00d2ff', lineWidth: 1, title: 'EMA 200', lastValueVisible: false, priceLineVisible: false });

        const vol = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'vol',
        });
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

        chartRef.current = chart;
        candlesSeriesRef.current = cs;
        volumeSeriesRef.current = vol;
        (chartRef.current as any).ema50 = ema50;
        (chartRef.current as any).ema100 = ema100;
        (chartRef.current as any).ema200 = ema200;

        chart.subscribeCrosshairMove((param) => {
            if (!param || !param.time) return;
            const sd = param.seriesData.get(cs as any) as any;
            if (!sd) return;
            setOhlc({ o: sd.open, h: sd.high, l: sd.low, c: sd.close });
        });

        chart.subscribeClick((param: any) => {
            if (!param.point) return;
            const price = cs.coordinateToPrice(param.point.y);
            if (price) addHorizontalLine(price);
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
            drawingsRef.current = [];
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLight]);

    const loadInitial = React.useCallback(async () => {
        if (!instrument) return;
        try {
            const res = await api.get(
                `/bot/market/candles?instrument=${encodeURIComponent(instrument)}&expiry_time=${encodeURIComponent(timeframe)}&limit=${maxBars}`
            );
            const next = (res.data?.candles || []) as Candle[];
            const provider = String(res.data?.provider || 'unknown');
            if (onDataStatus) onDataStatus({ instrument, ok: next.length > 0, provider });
            const data = next.slice(-maxBars);
            candlesRef.current = data;
            const candleData = toCandles(data);
            candlesSeriesRef.current?.setData(candleData);
            volumeSeriesRef.current?.setData(toVolume(data));

            const ema50Series = (chartRef.current as any).ema50;
            const ema100Series = (chartRef.current as any).ema100;
            const ema200Series = (chartRef.current as any).ema200;

            if (ema50Series) ema50Series.setData(calcEMA(candleData, 50));
            if (ema100Series) ema100Series.setData(calcEMA(candleData, 100));
            if (ema200Series) ema200Series.setData(calcEMA(candleData, 200));

            lockLastBars();
            if (data.length) {
                const last = data[data.length - 1];
                setOhlc({ o: last.open, h: last.high, l: last.low, c: last.close });
            }
        } catch (err) {
            console.warn('Chart initial load fail:', err);
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
        }, 30000);

        return () => {
            alive = false;
            window.clearInterval(tickId);
            window.clearInterval(syncId);
        };
    }, [instrument, loadInitial, updateCurrentCandle]);

    return (
        <div className="w-full h-full bg-[#0b0e11] flex flex-col relative overflow-hidden">
            {/* Binance Style Vertical Drawing Toolbar */}
            <div className="absolute left-3 top-24 z-30 flex flex-col items-center gap-1.5 p-1.5 bg-[#1e2329]/90 backdrop-blur-md rounded-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <button className="p-2 bg-primary/20 text-primary rounded-lg transition-all" title="Select Tool">
                    <Activity size={18} />
                </button>
                <div className="w-6 h-[1px] bg-white/5 my-1" />
                <button
                    onClick={() => {/* Mock Drawing Tool Select */ }}
                    className="p-2 text-[#848e9c] hover:bg-white/5 hover:text-white rounded-lg transition-all"
                    title="Horizontal Line (Click Chart)"
                >
                    <div className="w-4 h-0.5 bg-current rounded-full" />
                </button>
                <button
                    className="p-2 text-[#848e9c] hover:bg-white/5 hover:text-white rounded-lg transition-all"
                    title="Fibonacci (Coming Soon)"
                >
                    <div className="flex flex-col gap-0.5">
                        <div className="w-4 h-px bg-current" />
                        <div className="w-4 h-px bg-current" />
                        <div className="w-4 h-px bg-current" />
                    </div>
                </button>
                <div className="w-6 h-[1px] bg-white/5 my-1" />
                <button
                    onClick={clearDrawings}
                    className="p-2 text-rose-500/60 hover:bg-rose-500/10 hover:text-rose-500 rounded-lg transition-all"
                    title="Clear All Drawings"
                >
                    <Trash2 size={18} />
                </button>
            </div>

            <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between gap-4 bg-[#161a1e]">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-white tracking-tight">{instrument || '--'}</span>
                        <span className="text-[10px] font-bold text-[#02c076] bg-[#02c076]/10 px-1.5 py-0.5 rounded">LIVE</span>
                    </div>
                    <div className="h-4 w-[1px] bg-white/10" />
                    <div className="flex items-center gap-3">
                        <div className="text-[10px] font-bold text-[#848e9c] uppercase tracking-widest">OHLC</div>
                        <div className="flex items-center gap-3 text-[11px] font-bold tabular-nums">
                            {ohlc ? (
                                <>
                                    <span className="text-[#848e9c]">O <span className="text-white">{ohlc.o.toFixed(5)}</span></span>
                                    <span className="text-[#848e9c]">H <span className="text-white">{ohlc.h.toFixed(5)}</span></span>
                                    <span className="text-[#848e9c]">L <span className="text-white">{ohlc.l.toFixed(5)}</span></span>
                                    <span className="text-[#848e9c]">C <span className={ohlc.c >= ohlc.o ? 'text-[#02c076]' : 'text-[#f84960]'}>{ohlc.c.toFixed(5)}</span></span>
                                </>
                            ) : '--'}
                        </div>
                    </div>
                </div>
                <div className="hidden md:flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-400" />
                        <span className="text-[10px] font-bold text-[#848e9c] uppercase">EMA 50</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 w-full relative group">
                <div className="w-full h-full" ref={containerRef} />
                {/* Instruction Overlay */}
                <div className="absolute bottom-4 right-4 text-[9px] font-bold text-white/20 pointer-events-none uppercase tracking-widest">
                    Click chart to draw levels
                </div>
            </div>
        </div>
    );
}
