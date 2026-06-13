const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, LevelFormat, BorderStyle, WidthType, ShadingType,
        PageBreak } = require('docx');

const NAVY = "1E3A5F", RED = "B91C1C", GREEN = "166534", BLUE = "1D4ED8", GREY = "64748B", AMBER = "B45309", PURPLE = "7C3AED";
const CW = 9360;

const ruleBorder = { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 2 } };
const cb = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: cb, bottom: cb, left: cb, right: cb };
const margins = { top: 60, bottom: 60, left: 140, right: 140 };

const T = (r) => typeof r === 'string' ? new TextRun({ text: r, size: 24 }) : new TextRun({ size: 24, ...r });

function title(t) {
  return new Paragraph({ border: ruleBorder, spacing: { after: 100 },
    children: [new TextRun({ text: t, bold: true, size: 40, color: NAVY })] });
}
function subtitle(t) {
  return new Paragraph({ spacing: { after: 180 },
    children: [new TextRun({ text: t, italics: true, size: 24, color: GREY })] });
}
function roleHead(t, color) {
  return new Paragraph({ spacing: { before: 100, after: 80 },
    children: [new TextRun({ text: t, bold: true, size: 32, color })] });
}
function stepBar(stepLabel, whenText, fill) {
  return new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
    rows: [new TableRow({ children: [new TableCell({
      borders, width: { size: CW, type: WidthType.DXA }, margins,
      shading: { fill, type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [
        new TextRun({ text: stepLabel + "  ", bold: true, size: 28, color: "FFFFFF" }),
        new TextRun({ text: whenText, bold: true, size: 28, color: "FFFFFF" }),
      ]})],
    })]})],
  });
}
function action(runs) {
  return new Paragraph({ numbering: { reference: "acts", level: 0 }, spacing: { after: 50 }, children: runs.map(T) });
}
function body(runs) {
  return new Paragraph({ spacing: { after: 80 }, children: runs.map(T) });
}
function gap(before = 140) { return new Paragraph({ spacing: { before }, children: [] }); }
function cell(runs, w, fill, white) {
  return new TableCell({ borders, width: { size: w, type: WidthType.DXA }, margins,
    ...(fill ? { shading: { fill, type: ShadingType.CLEAR } } : {}),
    children: [new Paragraph({ children: runs.map(r => {
      const base = typeof r === 'string' ? { text: r } : r;
      return new TextRun({ size: 22, ...(white ? { bold: true, color: "FFFFFF" } : {}), ...base });
    }) })] });
}
function flagRow(flag, meaning, owner, flagColor) {
  return new TableRow({ children: [
    cell([{ text: flag, bold: true, color: flagColor || NAVY }], 2600),
    cell([meaning], 4660),
    cell([{ text: owner, bold: true }], 2100),
  ]});
}

const children = [
  title("PRVS Weekly P&L — Manager Guide"),
  subtitle("What service silo managers and parts managers must do for the daily and weekly P&L numbers to be right. June 2026 — v1."),

  body([ "P&L weeks run ", { text: "Monday through Sunday", bold: true },
    ". Every number traces to an action below: ", { text: "Revenue", bold: true },
    " = WO Dollar Values, counted only when you click ", { text: "✓ Mark Completed", bold: true, color: GREEN },
    ". ", { text: "Labor", bold: true }, " = tech clock-ins. ", { text: "Parts cost", bold: true },
    " = wholesale × qty + freight, attributed by the part's ", { text: "Service Silo", bold: true },
    " tag. Skip a step and the number is missing or lands in the wrong place." ]),

  roleHead("SERVICE SILO MANAGERS", NAVY),

  stepBar("STEP 1", "THE MOMENT A JOB IS SCOPED — before work starts", GREEN),
  action([ "Build the Work Order — ", { text: "real Dollar Value, right silo", bold: true },
    ". The WO's Dollar Value IS the revenue number. No WO, or a $0 WO = the job is ",
    { text: "invisible", bold: true }, " to the P&L, no matter how much work goes into it." ]),
  action([ "Don't worry about status — the WO flips to In Progress ", { text: "by itself", bold: true },
    " at the first tech clock-in." ]),
  gap(),

  stepBar("STEP 2", "EVERY DAY — keep your techs' time clean", BLUE),
  action([ "Right RO, right service at clock-in, ", { text: "clocked out at day end", bold: true }, "." ]),
  action([ "Forgotten clock-outs force-close at 5 PM and create ",
    { text: "⚠ phantom hours", bold: true, color: AMBER },
    " — one forgotten morning clock-in = a fake 9.5-hour day on your silo's labor." ]),
  gap(),

  stepBar("STEP 3", "WHEN THE BLUE “TECH DONE” CHIP APPEARS on a WO", NAVY),
  action([ "Your tech lead tapped ", { text: "“Our work is done”", bold: true },
    " at the kiosk. That is your cue: ", { text: "QA/QC the job and inform the customer", bold: true }, "." ]),
  gap(),

  stepBar("STEP 4", "THE SAME WEEK THE WORK FINISHES — recognize the revenue", RED),
  action([ "Click ", { text: "✓ Mark Completed", bold: true, color: GREEN }, " on the WO. ",
    { text: "This is THE revenue event.", bold: true },
    " Until you click it, Revenue Completed stays $0 — no matter how finished the job is." ]),
  action([ "Revenue counts in the week you click — ", { text: "don't batch them up", bold: true }, "." ]),
  action([ "Clicked too early? ", { text: "↩ Reopen", bold: true }, " pulls the revenue back out." ]),

  new Paragraph({ children: [new PageBreak()] }),

  roleHead("PARTS MANAGERS", NAVY),

  stepBar("STEP 1", "EVERY PART YOU ENTER — tag the silo", GREEN),
  action([ "Set the ", { text: "Service Silo", bold: true }, " dropdown on ", { text: "every part", bold: true },
    " — it marks the silos already “— on this RO” for you." ]),
  action([ "A blank silo sends the part to the ", { text: "Unattributed", bold: true, color: AMBER },
    " bucket — one June week had ", { text: "$19,068", bold: true },
    " sitting there that no department answered for." ]),
  gap(),

  stepBar("STEP 2", "EVERY PART YOU ENTER — get the cost fields right", BLUE),
  action([ { text: "Wholesale cost is per unit", bold: true }, " (the system multiplies by quantity)." ]),
  action([ { text: "Freight goes in its own field.", bold: true }, " Together these are the parts-cost side of the P&L." ]),
  gap(),

  stepBar("STEP 3", "EVERY TECH PARTS REQUEST — add the missing silo", NAVY),
  action([ "Tech requests arrive ", { text: "without a silo", bold: true },
    " today. Tag it when you process the request — match it to the RO's work order." ]),
  gap(),

  stepBar("STEP 4", "ANY OLD PART YOU TOUCH — re-tag it", PURPLE),
  action([ "There is a backlog of untagged parts. Whenever you open one, ",
    { text: "set its silo before you move on", bold: true }, "." ]),
  gap(220),

  roleHead("READING THE FLAGS", NAVY),
  body([ "When a report flags something, it points back at one of the steps above:" ]),
  new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [2600, 4660, 2100],
    rows: [
      new TableRow({ children: [
        cell(["Flag"], 2600, NAVY, true), cell(["What it means"], 4660, NAVY, true), cell(["Who fixes it"], 2100, NAVY, true),
      ]}),
      flagRow("Amber dot on a silo week", "Hours or parts spent but no completed revenue — a WO was never Mark-Completed, or has no Dollar Value.", "Silo manager", AMBER),
      flagRow("⚠ on calendar / timeline", "Auto-closed session at 5 PM = phantom hours. The tech forgot to clock out.", "Tech (mgr coaches)", AMBER),
      flagRow("Unattributed row", "Parts with no Service Silo tag.", "Parts manager", AMBER),
      flagRow("Blue Tech done chip", "Tech lead finished — job is waiting on manager QA/QC + Mark Completed.", "Silo manager", BLUE),
    ],
  }),

  gap(220),
  new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
    rows: [new TableRow({ children: [new TableCell({
      borders, width: { size: CW, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 140, right: 140 },
      shading: { fill: "EFF6FF", type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [
        new TextRun({ text: "Where this is headed: ", bold: true, size: 24 }),
        new TextRun({ size: 24, text: "this is the v1 P&L. Shop expenses, burdened labor, per-job hour tracking, and manager-facing daily reports come next — but they all build on the steps above. Get these right and everything that follows gets easier." }),
      ]})],
    })]})],
  }),
];

const doc = new Document({
  styles: { default: { document: { run: { font: "Arial", size: 24 } } } },
  numbering: { config: [
    { reference: "acts", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
      alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 280 }, spacing: { before: 50 } } } }] },
  ]},
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 },
      margin: { top: 800, right: 1340, bottom: 800, left: 1340 } } },
    children,
  }],
});

Packer.toBuffer(doc).then(b => { fs.writeFileSync("PRVS_PnL_Manager_Guide.docx", b); console.log("OK"); });
