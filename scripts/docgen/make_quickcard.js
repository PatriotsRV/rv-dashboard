const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, LevelFormat, BorderStyle, WidthType, ShadingType,
        PageBreak } = require('docx');

const NAVY = "1E3A5F", RED = "B91C1C", GREEN = "166534", BLUE = "1D4ED8", GREY = "64748B", AMBER = "B45309";
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
  return new Paragraph({ spacing: { after: 140 },
    children: [new TextRun({ text: t, italics: true, size: 24, color: GREY })] });
}
// Colored step banner: "STEP 1" chip + when-trigger text
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
  return new Paragraph({ numbering: { reference: "acts", level: 0 }, spacing: { after: 40 }, children: runs.map(T) });
}
function gap(before = 100) { return new Paragraph({ spacing: { before }, children: [] }); }

function pageContent(L) {
  return [
    title(L.title),
    subtitle(L.subtitle),

    stepBar(L.s1, L.s1when, GREEN),
    action([ L.a11a, { text: L.qr, bold: true }, L.a11b ]),
    action([ L.a12a, { text: L.oneService, bold: true, color: BLUE }, L.a12b ]),
    action([ L.tap, { text: L.clockIn, bold: true, color: GREEN }, L.a13b ]),
    gap(),

    stepBar(L.s2, L.s2when, BLUE),
    action([ L.a21a, { text: L.clockOutSwitch, bold: true, color: RED }, L.a21b ]),
    action([ L.a22 ]),
    gap(),

    stepBar(L.s3, L.s3when, NAVY),
    action([ L.a31a, { text: L.workNotes, bold: true }, L.a31b ]),
    action([ L.tap, { text: L.clockOut, bold: true, color: RED }, "." ]),
    gap(),

    stepBar(L.s4, L.s4when, RED),
    action([ { text: L.a41, bold: true }, L.a41b ]),
    action([ L.a42a, { text: L.phantom, bold: true, color: AMBER }, L.a42b ]),
    gap(),

    stepBar(L.s5, L.s5when, "7C3AED"),
    action([ L.a51 ]),
    action([ L.a52a, { text: L.workDone, bold: true, color: GREEN }, L.a52b, { text: L.tapIt, bold: true }, L.a52c ]),
    action([ L.a53a, { text: L.not, bold: true }, L.a53b ]),
    gap(),

    new Table({
      width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
      rows: [new TableRow({ children: [new TableCell({
        borders, width: { size: CW, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 140, right: 140 },
        shading: { fill: "EFF6FF", type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [
          new TextRun({ text: L.autoLabel, bold: true, size: 24 }),
          new TextRun({ text: L.autoText, size: 24 }),
        ]})],
      })]})],
    }),
  ];
}

const EN = {
  title: "PRVS Time Clock — Tech Quick Card",
  subtitle: "Your clock-ins ARE the shop's labor numbers. Five steps. Same steps, every day.",
  s1: "STEP 1", s1when: "EVERY MORNING — before you touch a tool",
  a11a: "Check in to the RO via the ", qr: "Dashboard directly OR scan the QR code", a11b: " on the RV's key tag. (First time ever: sign in with your Patriots RV Google account. It remembers you after that.)",
  a12a: "Tap ", oneService: "the ONE RO Service you are about to work", a12b: " — Roof, Solar, Repairs, etc. Your pick decides which department gets your hours. Wrong pick = wrong books.",
  tap: "Tap ", clockIn: "Clock In / Start Work", a13b: ". Done. Go work.",
  s2: "STEP 2", s2when: "EVERY TIME you SWITCH RO jobs or RVs",
  a21a: "At the OLD RV RO: open its check-in (dashboard or QR), tap ", clockOutSwitch: "Clock Out / Clock Out & Switch RO", a21b: ".",
  a22: "At the NEW RV RO: open its Tech check-in, pick the service, clock in. Clock In will also log you out of the last RO Service work in case you didn't log out already.",
  s3: "STEP 3", s3when: "END OF EVERY JOB",
  a31a: "Open the RV's check-in (dashboard or QR). Type what you did in ", workNotes: "Work Notes", a31b: ".",
  clockOut: "Clock Out",
  s4: "STEP 4", s4when: "END OF EVERY DAY — when you are done with work for the day",
  a41: "Ask yourself: am I clocked out?", a41b: " Not 100% sure? Open the check-in page and check.",
  a42a: "If you forget, the system force-closes you at 5 PM and creates ", phantom: "phantom hours", a42b: " — a forgotten 7:30 AM clock-in becomes a fake 9.5-hour day, flagged ⚠ on manager reports with YOUR name on it.",
  s5: "STEP 5", s5when: "TECH LEADS ONLY — WHEN your team's RO service work is 100% finished and you are DONE, do this…",
  a51: "Clock out like normal (Step 3).",
  a52a: "On the “Clocked Out!” screen a green ", workDone: "OUR WORK IS DONE", a52b: " button appears — ", tapIt: "tap it", a52c: ".",
  a53a: "That tells your manager the job is ready for final review. It does ", not: "NOT", a53b: " close the job — your manager does the final ✓. If it says no work order exists, tell your manager.",
  autoLabel: "Automatic: ",
  autoText: "the RV's Status and the Work Order flip to In Progress when you clock in. Your only jobs: Right RO and Service, Clock Out, and when the RO Service is complete, Lead hits OUR WORK IS DONE.",
};

const ES = {
  title: "Reloj de PRVS — Tarjeta Rápida para Técnicos",
  subtitle: "Tus registros SON los números de mano de obra del taller. Cinco pasos. Los mismos pasos, todos los días.",
  s1: "PASO 1", s1when: "CADA MAÑANA — antes de tocar una herramienta",
  a11a: "Regístrate en la OR desde el ", qr: "Dashboard directamente O escanea el código QR", a11b: " del llavero del RV. (Solo la primera vez: inicia sesión con tu cuenta Google de Patriots RV. Después te recuerda.)",
  a12a: "Toca ", oneService: "el ÚNICO Servicio de la OR que vas a trabajar", a12b: " — Techo, Solar, Reparaciones, etc. Tu selección decide a qué departamento se cargan tus horas. Selección equivocada = números equivocados.",
  tap: "Toca ", clockIn: "Registrar Entrada", a13b: ". Listo. A trabajar.",
  s2: "PASO 2", s2when: "CADA VEZ que CAMBIES de trabajo (OR) o de RV",
  a21a: "En la OR del RV VIEJO: abre su página (dashboard o QR) y toca ", clockOutSwitch: "Registrar Salida / Salir y Cambiar OR", a21b: ".",
  a22: "En la OR del RV NUEVO: abre su página de check-in, elige el servicio y registra tu entrada. Registrar Entrada también te saca del último servicio por si no registraste tu salida.",
  s3: "PASO 3", s3when: "AL TERMINAR CADA TRABAJO",
  a31a: "Abre la página del RV (dashboard o QR). Escribe lo que hiciste en ", workNotes: "Notas de Trabajo", a31b: ".",
  clockOut: "Registrar Salida",
  s4: "PASO 4", s4when: "AL FINAL DE CADA DÍA — cuando termines tu trabajo del día",
  a41: "Pregúntate: ¿registré mi salida?", a41b: " ¿No estás 100% seguro? Abre la página y revisa.",
  a42a: "Si lo olvidas, el sistema te cierra a la fuerza a las 5 PM y crea ", phantom: "horas fantasma", a42b: " — una entrada olvidada de las 7:30 AM se convierte en un día falso de 9.5 horas, marcado ⚠ en los reportes de los gerentes con TU nombre.",
  s5: "PASO 5", s5when: "SOLO LÍDERES DE EQUIPO — CUANDO el trabajo esté 100% terminado, haz esto…",
  a51: "Registra tu salida como siempre (Paso 3).",
  a52a: "En la pantalla de salida aparece un botón verde ", workDone: "Nuestro trabajo está terminado", a52b: " — ", tapIt: "tócalo", a52c: ".",
  a53a: "Eso avisa a tu gerente que el trabajo está listo para revisión final. ", not: "NO", a53b: " cierra el trabajo — tu gerente da el ✓ final. Si dice que no existe una orden de trabajo, avísale a tu gerente.",
  autoLabel: "Automático: ",
  autoText: "el Estado del RV y la Orden de Trabajo cambian solos a En Progreso al registrar tu entrada. Tus tareas: la OR y el Servicio correctos, Registrar Salida, y al completar el servicio, el Líder toca NUESTRO TRABAJO ESTÁ TERMINADO.",
};

const doc = new Document({
  styles: { default: { document: { run: { font: "Arial", size: 24 } } } },
  numbering: { config: [
    { reference: "acts", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
      alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 280 }, spacing: { before: 50 } } } }] },
  ]},
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 },
      margin: { top: 800, right: 1340, bottom: 800, left: 1340 } } },
    children: [
      ...pageContent(EN),
      new Paragraph({ children: [new PageBreak()] }),
      ...pageContent(ES),
    ],
  }],
});

Packer.toBuffer(doc).then(b => { fs.writeFileSync("PRVS_Tech_and_Lead_RO_Check_In_Procedure.docx", b); console.log("OK"); });
