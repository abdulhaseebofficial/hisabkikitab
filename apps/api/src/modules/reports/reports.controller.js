/**
 * Report endpoints.
 *
 * The month's numbers come from reports.service; what is left here is turning
 * them into a JSON body, a spreadsheet or a PDF, which is presentation and
 * belongs next to the response.
 */

const PDFDocument = require('pdfkit');
const reports = require('./reports.service');
const { toCsv } = require('./reports.csv');
const asyncHandler = require('../../shared/http/asyncHandler');
const { round2 } = require('../../shared/utils/calculations');

/**
 * GET /api/reports/monthly
 * The full month in one payload: totals, category breakdown, this-vs-last
 * comparison, budget adherence and the biggest single expense.
 */
const monthlyReport = asyncHandler(async (req, res) => {
  const data = await reports.monthly(req.user, req.query);
  res.json({ success: true, data });
});

/**
 * GET /api/reports/export?format=csv|pdf&month=&year=
 * Streams the month as a spreadsheet or a printable one-page PDF.
 */
const exportReport = asyncHandler(async (req, res) => {
  const format = (req.query.format || 'csv').toLowerCase();
  const { snapshot, expenses, label } = await reports.exportData(req.user, req.query);

  const cur = req.user.currency;

  if (format === 'csv') {
    const rows = [
      ['Hisab Ki Kitab expense report'],
      ['Student', req.user.name],
      ['Period', snapshot.monthLabel],
      ['Currency', cur],
      [],
      ['Income', snapshot.income],
      ['Total spent', snapshot.totalSpent],
      ['Money left', snapshot.remaining],
      ['Transactions', expenses.length],
      [],
      ['Spending by category'],
      ['Category', 'Amount', 'Share %'],
      ...snapshot.breakdown.map((b) => [b.category, b.amount, b.percent]),
      [],
      ['All transactions'],
      ['Date', 'Category', 'Description', 'Payment method', 'Amount'],
      ...expenses.map((e) => [
        new Date(e.date).toISOString().slice(0, 10),
        e.category,
        e.description,
        e.paymentMethod,
        e.amount,
      ]),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hisabkikitab-${label}.csv"`);
    // UTF-8 BOM so Excel renders currency symbols correctly.
    return res.send('\uFEFF' + toCsv(rows));
  }

  // ---------- PDF ----------
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="hisabkikitab-${label}.pdf"`);
  doc.pipe(res);

  const money = (n) => `${cur} ${round2(n).toLocaleString('en-IN')}`;
  const line = () => doc.moveDown(0.4).strokeColor('#e5e7eb').lineWidth(1)
    .moveTo(48, doc.y).lineTo(547, doc.y).stroke().moveDown(0.6);

  doc.fillColor('#4f46e5').fontSize(22).text('Hisab Ki Kitab', { continued: true })
    .fillColor('#6b7280').fontSize(12).text('   monthly report');
  doc.moveDown(0.2);
  doc.fillColor('#111827').fontSize(16).text(snapshot.monthLabel);
  doc.fillColor('#6b7280').fontSize(10)
    .text(`${req.user.name}${req.user.hostelName ? ' - ' + req.user.hostelName : ''}`)
    .text(`Generated ${new Date().toDateString()}`);
  line();

  doc.fillColor('#111827').fontSize(13).text('Summary');
  doc.moveDown(0.3).fontSize(11).fillColor('#374151');
  doc.text(`Income: ${money(snapshot.income)}`);
  doc.text(`Total spent: ${money(snapshot.totalSpent)}`);
  doc.text(`Money left: ${money(snapshot.remaining)}   (${100 - snapshot.spentPercent}% of income)`);
  doc.text(`Average per day: ${money(snapshot.dailyAverage)}`);
  doc.text(`Transactions: ${expenses.length}`);
  line();

  doc.fillColor('#111827').fontSize(13).text('Spending by category');
  doc.moveDown(0.3).fontSize(11);
  if (!snapshot.breakdown.length) {
    doc.fillColor('#9ca3af').text('No expenses recorded for this month.');
  } else {
    snapshot.breakdown.forEach((b) => {
      // A simple text bar keeps the PDF dependency-free.
      const bar = '\u2588'.repeat(Math.max(1, Math.round(b.percent / 4)));
      doc.fillColor('#374151').text(`${b.category.padEnd(20, ' ')} ${money(b.amount).padStart(14, ' ')}  ${String(b.percent).padStart(5, ' ')}%`, { continued: true });
      doc.fillColor('#818cf8').text(`  ${bar}`);
    });
  }
  line();

  if (snapshot.budgets.length) {
    doc.fillColor('#111827').fontSize(13).text('Budget adherence');
    doc.moveDown(0.3).fontSize(11);
    snapshot.budgets.forEach((b) => {
      const colour = b.status === 'over' ? '#dc2626' : b.status === 'warning' ? '#d97706' : '#16a34a';
      doc.fillColor('#374151').text(`${b.category.padEnd(20, ' ')} ${money(b.spent)} of ${money(b.limit)}  `, { continued: true });
      doc.fillColor(colour).text(`${b.usedPercent}% ${b.status.toUpperCase()}`);
    });
    line();
  }

  doc.fillColor('#111827').fontSize(13).text('Transactions');
  doc.moveDown(0.3).fontSize(9).fillColor('#6b7280');
  doc.text('DATE        CATEGORY             DESCRIPTION                    METHOD      AMOUNT');
  doc.moveDown(0.2).fillColor('#374151');

  expenses.forEach((e) => {
    if (doc.y > 760) doc.addPage();
    const row = [
      new Date(e.date).toISOString().slice(0, 10).padEnd(12, ' '),
      String(e.category).slice(0, 20).padEnd(21, ' '),
      String(e.description || '-').slice(0, 29).padEnd(31, ' '),
      String(e.paymentMethod).slice(0, 11).padEnd(12, ' '),
      money(e.amount),
    ].join('');
    doc.text(row);
  });

  doc.moveDown(1).fontSize(9).fillColor('#9ca3af')
    .text('Generated by Hisab Ki Kitab - your AI money coach for hostel life.', { align: 'center' });

  doc.end();
});

module.exports = { monthlyReport, exportReport };
