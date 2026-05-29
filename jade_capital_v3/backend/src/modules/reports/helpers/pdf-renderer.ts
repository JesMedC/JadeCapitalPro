// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import { TradingAccount } from '../../accounts/entities/trading-account.entity';
import { Trade } from '../../trades/entities/trade.entity';
import { KpiData, EquityPoint } from './kpi-calculator';

export interface DateRange {
  from: Date;
  to: Date;
}

// ── Layout constants ─────────────────────────────────────────────────────────

const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4 points
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// KPI grid
const KPI_COLS = 5;
const KPI_COL_W = CONTENT_WIDTH / KPI_COLS;
const KPI_ROW_H = 40;

// Trade table columns
const TABLE_COLS = [
  { label: 'Date',        width: 70 },
  { label: 'Instrument',  width: 65 },
  { label: 'Direction',   width: 55 },
  { label: 'Investment',  width: 65 },
  { label: 'Entry',       width: 60 },
  { label: 'Exit',        width: 60 },
  { label: 'P&L',         width: 55 },
  { label: 'Status',      width: 65 },
] as const;

const TABLE_ROW_H = 20;
const ROWS_PER_PAGE = 50;

// Equity chart
const CHART_H = 120;

// ── PdfRenderer ──────────────────────────────────────────────────────────────

export class PdfRenderer {
  /**
   * Render the full PDF report and return it as a Buffer.
   * All sections are drawn in memory — no temp files on disk.
   */
  async render(
    account: TradingAccount,
    kpis: KpiData,
    curve: EquityPoint[],
    trades: Trade[],
    dateRange: DateRange,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this._renderHeader(doc, account, dateRange);
      this._renderKpiCard(doc, kpis);
      this._renderEquityCurve(doc, curve);
      this._renderTradeTable(doc, trades);

      doc.end();
    });
  }

  // ── Section 1: Account Header ─────────────────────────────────────────────

  private _renderHeader(
    doc: InstanceType<typeof PDFDocument>,
    account: TradingAccount,
    range: DateRange,
  ): void {
    const fromStr = range.from.toISOString().split('T')[0];
    const toStr = range.to.toISOString().split('T')[0];

    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor('#0a2540')
      .text('Trading Performance Report', MARGIN, MARGIN, { width: CONTENT_WIDTH });

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#0a2540')
      .moveDown(0.4)
      .text(account.name);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#555555')
      .text(`Market: ${account.marketType}   Currency: ${account.currency}   Period: ${fromStr} → ${toStr}`);

    // Divider
    doc
      .moveTo(MARGIN, doc.y + 8)
      .lineTo(PAGE_WIDTH - MARGIN, doc.y + 8)
      .strokeColor('#cccccc')
      .lineWidth(0.5)
      .stroke();

    doc.moveDown(1.2);
  }

  // ── Section 2: KPI Card ───────────────────────────────────────────────────

  private _renderKpiCard(
    doc: InstanceType<typeof PDFDocument>,
    kpis: KpiData,
  ): void {
    const y = doc.y;
    const labels = ['Win Rate', 'Net P&L', 'ROI', 'Profit Factor', 'Max Drawdown'];
    const values = [
      `${(kpis.winRate * 100).toFixed(1)}%`,
      kpis.netPnl >= 0 ? `+${kpis.netPnl.toFixed(2)}` : `${kpis.netPnl.toFixed(2)}`,
      `${kpis.roi >= 0 ? '+' : ''}${kpis.roi.toFixed(2)}%`,
      kpis.profitFactor === Infinity ? '∞' : kpis.profitFactor.toFixed(2),
      kpis.maxDrawdown.toFixed(2),
    ];

    // Draw KPI cells
    for (let i = 0; i < KPI_COLS; i++) {
      const x = MARGIN + i * KPI_COL_W;

      // Border rectangle
      doc
        .rect(x, y, KPI_COL_W, KPI_ROW_H * 2)
        .strokeColor('#e0e0e0')
        .lineWidth(0.5)
        .stroke();

      // Label
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#888888')
        .text(labels[i], x + 6, y + 6, { width: KPI_COL_W - 12, align: 'center' });

      // Value colour: green for positive PnL/ROI, red for negative
      let valueColor = '#0a2540';
      if ((labels[i] === 'Net P&L' || labels[i] === 'ROI') && kpis.netPnl < 0) {
        valueColor = '#c0392b';
      } else if (labels[i] === 'Max Drawdown' && kpis.maxDrawdown < 0) {
        valueColor = '#c0392b';
      } else if (
        (labels[i] === 'Net P&L' && kpis.netPnl > 0) ||
        (labels[i] === 'ROI' && kpis.roi > 0)
      ) {
        valueColor = '#27ae60';
      }

      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor(valueColor)
        .text(values[i], x + 6, y + KPI_ROW_H - 4, { width: KPI_COL_W - 12, align: 'center' });
    }

    doc.y = y + KPI_ROW_H * 2 + 16;
    doc.moveDown(0.5);
  }

  // ── Section 3: Equity Curve ───────────────────────────────────────────────

  private _renderEquityCurve(
    doc: InstanceType<typeof PDFDocument>,
    curve: EquityPoint[],
  ): void {
    const y = doc.y;

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0a2540')
      .text('Equity Curve', MARGIN, y);

    const chartY = doc.y + 4;
    const chartX = MARGIN;
    const chartW = CONTENT_WIDTH;

    // Chart border
    doc
      .rect(chartX, chartY, chartW, CHART_H)
      .strokeColor('#e0e0e0')
      .lineWidth(0.5)
      .stroke();

    // Synthesize start point for single-trade curve (0, 0) → (x, cumPnl)
    const curveToDraw = curve.length === 1
      ? [{ date: curve[0].date, cumPnl: 0 }, curve[0]]
      : curve;

    if (curveToDraw.length < 2) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#aaaaaa')
        .text('Not enough data to draw equity curve.', chartX + 10, chartY + CHART_H / 2 - 6, {
          width: chartW - 20,
          align: 'center',
        });
      doc.y = chartY + CHART_H + 12;
      return;
    }

    const pnlValues = curveToDraw.map((p) => p.cumPnl);
    const minPnl = Math.min(...pnlValues, 0);
    const maxPnl = Math.max(...pnlValues, 0);
    const pnlRange = maxPnl - minPnl || 1;

    const padX = 6;
    const padY = 10;
    const drawW = chartW - padX * 2;
    const drawH = CHART_H - padY * 2;

    // Zero baseline
    const zeroY = chartY + padY + drawH - ((0 - minPnl) / pnlRange) * drawH;
    doc
      .moveTo(chartX + padX, zeroY)
      .lineTo(chartX + padX + drawW, zeroY)
      .strokeColor('#dddddd')
      .lineWidth(0.5)
      .stroke();

    // Equity polyline
    const points = curveToDraw.map((p, i) => ({
      x: chartX + padX + (i / (curveToDraw.length - 1)) * drawW,
      y: chartY + padY + drawH - ((p.cumPnl - minPnl) / pnlRange) * drawH,
    }));

    // Colour: green if final is positive, red if negative
    const lineColor = curveToDraw[curveToDraw.length - 1].cumPnl >= 0 ? '#27ae60' : '#c0392b';

    doc.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      doc.lineTo(points[i].x, points[i].y);
    }
    doc.strokeColor(lineColor).lineWidth(1.5).stroke();

    // Axis labels
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#888888')
      .text(maxPnl.toFixed(0), chartX + padX, chartY + padY - 2, { width: 30 })
      .text(minPnl.toFixed(0), chartX + padX, chartY + CHART_H - padY - 8, { width: 30 });

    doc.y = chartY + CHART_H + 14;
    doc.moveDown(0.5);
  }

  // ── Section 4: Trade History Table ────────────────────────────────────────

  private _renderTradeTable(
    doc: InstanceType<typeof PDFDocument>,
    trades: Trade[],
  ): void {
    const sorted = [...trades].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0a2540')
      .text('Trade History', MARGIN, doc.y);

    doc.moveDown(0.3);

    let rowIndex = 0;

    const drawHeader = () => {
      const y = doc.y;
      let x = MARGIN;
      for (const col of TABLE_COLS) {
        doc
          .rect(x, y, col.width, TABLE_ROW_H)
          .fillColor('#f4f6f8')
          .fill()
          .strokeColor('#cccccc')
          .lineWidth(0.5)
          .rect(x, y, col.width, TABLE_ROW_H)
          .stroke();

        doc
          .font('Helvetica-Bold')
          .fontSize(7)
          .fillColor('#333333')
          .text(col.label, x + 3, y + 6, { width: col.width - 6, align: 'center' });

        x += col.width;
      }
      doc.y = y + TABLE_ROW_H;
    };

    drawHeader();

    for (const trade of sorted) {
      // New page when needed
      if (rowIndex > 0 && rowIndex % ROWS_PER_PAGE === 0) {
        doc.addPage();
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#0a2540')
          .text('Trade History (continued)', MARGIN, MARGIN);
        doc.moveDown(0.3);
        drawHeader();
      }

      const y = doc.y;
      const pnl = Number(trade.pnl ?? 0);
      const pnlStr = pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2);
      const pnlColor = pnl > 0 ? '#27ae60' : pnl < 0 ? '#c0392b' : '#555555';

      const cells: Array<{ text: string; color?: string }> = [
        { text: new Date(trade.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) },
        { text: trade.instrument },
        { text: trade.direction.toUpperCase() },
        { text: Number(trade.amount).toFixed(2) },
        { text: Number(trade.entryPrice).toFixed(4) },
        { text: trade.exitPrice != null ? Number(trade.exitPrice).toFixed(4) : '—' },
        { text: pnlStr, color: pnlColor },
        { text: trade.status.toUpperCase() },
      ];

      let x = MARGIN;
      const bgColor = rowIndex % 2 === 0 ? '#ffffff' : '#fafbfc';
      for (let ci = 0; ci < TABLE_COLS.length; ci++) {
        const col = TABLE_COLS[ci];
        const cell = cells[ci];

        doc
          .rect(x, y, col.width, TABLE_ROW_H)
          .fillColor(bgColor)
          .fill()
          .strokeColor('#e8e8e8')
          .lineWidth(0.3)
          .rect(x, y, col.width, TABLE_ROW_H)
          .stroke();

        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor(cell.color ?? '#333333')
          .text(cell.text, x + 3, y + 6, { width: col.width - 6, align: 'center' });

        x += col.width;
      }

      doc.y = y + TABLE_ROW_H;
      rowIndex++;
    }
  }
}
