export type LedgerEvent = {
    t: number; // unix seconds
    delta: number;
    kind: 'deposit' | 'withdrawal' | 'trade_open' | 'trade_close';
};

export type LedgerAggPoint = {
    t: number;
    delta: number;
};

export type BinaryTradeLike = {
    open_date: string;
    close_date?: string | null;
    investment: number;
    payout_pct: number;
    status: string;
};

export type ForexTradeLike = {
    open_date: string;
    close_date?: string | null;
    investment: number;
    pnl: number;
    status: string;
};

export type TransactionLike = {
    date: string;
    type: string;
    amount: number;
};

export const toSec = (d: string | Date) => Math.floor(new Date(d).getTime() / 1000);

export const binaryNetResult = (t: any) => {
    const status = String(t?.status || '').toLowerCase();
    const inv = Number(t?.investment || 0);
    const payout = Number(t?.payout_pct || 0);
    if (status === 'win') return inv * payout;
    if (status === 'loss') return -inv;
    if (status === 'be') return 0;
    return 0;
};

export const forexNetResult = (t: any) => {
    const status = String(t?.status || '').toLowerCase();
    if (status === 'open') return 0;
    return Number(t?.pnl || 0);
};

export const buildLedgerEvents = (args: {
    binaryTrades: BinaryTradeLike[];
    forexTrades: ForexTradeLike[];
    transactions: TransactionLike[];
}): LedgerEvent[] => {
    const events: LedgerEvent[] = [];

    for (const tx of args.transactions || []) {
        const when = toSec(tx.date);
        const amt = Number(tx.amount || 0);
        const type = String(tx.type || '').toLowerCase();
        if (type === 'deposit') events.push({ t: when, delta: amt, kind: 'deposit' });
        if (type === 'withdrawal') events.push({ t: when, delta: -amt, kind: 'withdrawal' });
    }

    for (const t of args.binaryTrades || []) {
        events.push({ t: toSec(t.open_date), delta: -Number(t.investment || 0), kind: 'trade_open' });
        if (t.close_date) {
            const status = String(t.status || '').toLowerCase();
            if (status !== 'open') {
                const inv = Number(t.investment || 0);
                const payout = Number(t.payout_pct || 0);
                const delta = status === 'win' ? inv + inv * payout : status === 'be' ? inv : 0;
                events.push({ t: toSec(t.close_date), delta, kind: 'trade_close' });
            }
        }
    }

    for (const t of args.forexTrades || []) {
        events.push({ t: toSec(t.open_date), delta: -Number(t.investment || 0), kind: 'trade_open' });
        if (t.close_date) {
            const status = String(t.status || '').toLowerCase();
            if (status !== 'open') {
                const inv = Number(t.investment || 0);
                const pnl = Number((t as any).pnl || 0);
                events.push({ t: toSec(t.close_date), delta: inv + pnl, kind: 'trade_close' });
            }
        }
    }

    return events;
};

export const aggregateBySecond = (events: LedgerEvent[]): LedgerAggPoint[] => {
    const byTime = new Map<number, number>();
    for (const ev of events) {
        const t = Math.floor(ev.t);
        byTime.set(t, (byTime.get(t) ?? 0) + Number(ev.delta || 0));
    }
    const times = Array.from(byTime.keys()).sort((a, b) => a - b);
    return times.map((t) => ({ t, delta: byTime.get(t) ?? 0 }));
};

export const computeOffsetFromCurrentBalance = (agg: LedgerAggPoint[], currentBalance: number) => {
    const net = agg.reduce((acc, p) => acc + p.delta, 0);
    return Number(currentBalance || 0) - net;
};

export const equitySeriesFromAgg = (agg: LedgerAggPoint[], offset: number) => {
    let v = Number(offset || 0);
    return agg.map((p) => {
        v += p.delta;
        return { time: p.t, value: Number(v.toFixed(2)) };
    });
};

export const balanceAt = (agg: LedgerAggPoint[], offset: number, tSecInclusive: number) => {
    let v = Number(offset || 0);
    for (const p of agg) {
        if (p.t > tSecInclusive) break;
        v += p.delta;
    }
    return Number(v.toFixed(2));
};

export const daysInMonth = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();

export const dailyEquitySeriesForMonth = (agg: LedgerAggPoint[], offset: number, year: number, month0: number) => {
    const n = daysInMonth(year, month0);
    const points: Array<{ time: number; value: number }> = [];
    for (let day = 1; day <= n; day++) {
        const dayEnd = new Date(year, month0, day, 23, 59, 59);
        const labelTime = new Date(year, month0, day, 12, 0, 0);
        points.push({ time: toSec(labelTime), value: balanceAt(agg, offset, toSec(dayEnd)) });
    }
    return points;
};

export const projectionSeriesForMonth = (args: {
    year: number;
    month0: number;
    startBalance: number;
    dailyPct: number;
}) => {
    const n = daysInMonth(args.year, args.month0);
    const daily = Number(args.dailyPct || 0) / 100;
    const points: Array<{ time: number; value: number }> = [];
    for (let day = 1; day <= n; day++) {
        const labelTime = new Date(args.year, args.month0, day, 12, 0, 0);
        const projected = args.startBalance * Math.pow(1 + daily, day);
        points.push({ time: toSec(labelTime), value: Number(projected.toFixed(2)) });
    }
    return points;
};

export const getSessionWindow = (now: Date) => {
    // Two sessions:
    // Day: 05:00 -> 17:00
    // Night: 17:00 -> 05:00 (next day)
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();

    const dayStart = new Date(y, m, d, 5, 0, 0);
    const dayEnd = new Date(y, m, d, 17, 0, 0);

    if (now >= dayStart && now < dayEnd) {
        return { name: '05:00-17:00', start: dayStart, end: dayEnd };
    }

    const nightStart = now >= dayEnd ? dayEnd : new Date(y, m, d - 1, 17, 0, 0);
    const nightEnd = new Date(nightStart.getFullYear(), nightStart.getMonth(), nightStart.getDate() + 1, 5, 0, 0);
    return { name: '17:00-05:00', start: nightStart, end: nightEnd };
};

export const sessionNameForDate = (dt: Date) => {
    const w = getSessionWindow(dt);
    return w.name;
};
