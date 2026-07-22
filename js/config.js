// js/config.js — PRVS Dashboard application constants
// Phase 1 of MODULARIZATION_ROADMAP.md — 2026-05-25 (Session 75)
//
// All application-wide constants. No side effects, no imports.
//
// The inline <script> block in index.html still declares these — that is
// intentional (Phase 1 is purely additive). The duplicates will be removed
// once every caller has been migrated to import from this module (Phase 19
// cleanup). DO NOT delete the index.html copies yet.
//
// Spec deltas from MODULARIZATION_ROADMAP.md (Roland's notes 2026-05-25):
//   - ADMIN_EMAILS / MANAGER_EMAILS / SR_MANAGER_EMAILS dropped by Session
//     S2 RBAC migration; they no longer exist in index.html and are not
//     re-introduced here.
//   - CALENDAR_IDS was renamed CALENDAR_IDS_FALLBACK by Session S7; the
//     authoritative calendar ID source is now the `app_config` table via
//     getCalendarId() in index.html. The fallback constant is kept here
//     because getCalendarId() still references it when the table read fails.
//   - PRVS_FUNCTION_SECRET added in v1.406 (Session 50) — shared-secret
//     header for edge-function calls. Not in original spec.
//   - statusColorMap and ALL_STATUSES are function-scoped inside
//     updateStats() and will lift out in Phase 6 (render.js), not here.
//   - DEBUG flag stays in index.html for now because the log()/warn()
//     helpers that read it are not yet modularized. Moves with utils.js
//     in Phase 2.

// ── Supabase ────────────────────────────────────────────────────────
export const SUPABASE_URL = 'https://axfejhudchdejoiwaetq.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4ZmVqaHVkY2hkZWpvaXdhZXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3OTE2NzEsImV4cCI6MjA4OTM2NzY3MX0.CF7XxtXOHg6Zpsb31m55YsMVd2QHSE5L3t7_FtMFfxY';

// Supabase JS client options used by getSB() (auth.js Phase 4B-C and the
// inline copy in index.html). Persists session in localStorage across page
// loads under a dedicated key so multiple PRVS pages don't collide.
// PHASE 4B-C (Session 77, 2026-05-25): moved here from inline declaration
// in index.html so the module's getSB() and the inline getSB() construct
// the Supabase client with identical options. Same shape, same storageKey
// → same persisted session.
export const SB_AUTH_OPTIONS = {
    auth: {
        persistSession:     true,             // keep session in localStorage across page loads
        autoRefreshToken:   true,             // silently refresh JWT before expiry using refresh token
        storageKey:         'prvs_supabase_auth', // dedicated localStorage key
        detectSessionInUrl: true,             // handle OAuth redirects
    },
};

// Shared-secret header for send-quote-email edge function. Matches Supabase
// secret PRVS_FUNCTION_SECRET. Not true security (visible in client source)
// but raises the bar against casual abuse of the public function URL.
export const PRVS_FUNCTION_SECRET = 'b8b5561b957160e04db62bbf1682ebdc036de251a07d8c64d064a389e80d66e5';

// ── Messaging lines (S144) ─────────────────────────────────────────
// PB_LINE_E164 — the Project Blue line every outbound customer text leaves
// from. It matters far beyond cosmetics: Project Blue will not deliver
// outbound to a number that has never texted THIS EXACT LINE (the S138
// engagement gate). PB still accepts the send and issues a pbm_ handle, then
// queues it forever with no failure event — the failure is completely silent.
//
// KENECT_LINE_E164 — the legacy line. All 56k imported messages (S142) landed
// here, so imported threads LOOK like established conversations while Project
// Blue has never seen the customer. Engagement must be computed against
// PB_LINE_E164 only; inbound on the Kenect line does NOT count.
//
// ⚠️ RETIRED S151 (GH#39 Textly pivot): Project Blue is out — no port ever
// happened. PB_LINE_E164/KENECT_LINE_E164 are retained only for historical
// thread math (which line an old message arrived on); nothing gates on them.
export const PB_LINE_E164 = '+19404074145';
export const KENECT_LINE_E164 = '+19404885047';

// TEXTLY_LINE_E164 (S151, GH#39 Textly pivot) — the Textly (Vested Networks
// white-label of Textable) sending line. It is the SAME number as the old
// Kenect line: 940-488-5047 never moved (it is a VoIP line hosted at Vested,
// S143); Textly took over its SMS on 7/20. That kills the PB engagement trap
// for good — every imported Kenect thread lives on the very line we now send
// from, so outbound genuinely reaches everyone again.
export const TEXTLY_LINE_E164 = '+19404885047';

// ── Google APIs (Sheets / Drive / Calendar / Auth) ──────────────────
export const GOOGLE_CONFIG = {
    CLIENT_ID: '971946834908-fqhmdrie6ntt0mmmbh4rkpaop8edvgr8.apps.googleusercontent.com',
    API_KEY: 'AIzaSyB6kg5hZiXJxUoGtKSXIxKj7JfOGNN6jbc',
    SPREADSHEET_ID: '1Nkf_BoqDhanJRCyeqIerF-Te_Z_R0h3mZelcgTjS62Y',
    DRIVE_FOLDER_ID: '1SdOc3FDMN20btqR4iR6rhWXiSG6gXFgv',
    TIME_LOGS_RANGE: 'Time Logs!A:J',
    AUDIT_LOG_RANGE: 'Audit Log!A:G',
    CASHIERED_RANGE: 'Cashiered!A:X',
    INSURANCE_DATA_RANGE: 'Insurance Data!A:C',
    CONFIG_RANGE: 'Config!A1',
    PARTS_RANGE: 'Parts!A:AA',
    PARTS_JSON_COL: 'X',
    DISCOVERY_DOCS: [
        'https://sheets.googleapis.com/$discovery/rest?version=v4',
        'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
    ],
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/calendar.events'
};

// ── Service Silos ───────────────────────────────────────────────────
export const SERVICE_SILOS = [
    { key: 'repair',     label: 'Repair',       emoji: '🔧' },
    { key: 'vroom',      label: 'Vroom',         emoji: '✨' },
    { key: 'solar',      label: 'Solar',         emoji: '☀️' },
    { key: 'roof',       label: 'Roof',          emoji: '🏠' },
    { key: 'paint_body', label: 'Paint & Body',  emoji: '🎨' },
    { key: 'chassis',    label: 'Chassis',       emoji: '🔩' },
    { key: 'detailing',  label: 'Detailing',     emoji: '🧽' },
    { key: 'truetopper', label: 'TrueTopper',    emoji: '🏕️' },
];

// Maps RO repairType text → SERVICE_SILOS key (case-insensitive match)
export const REPAIR_TYPE_TO_SILO = {
    'repairs':        'repair',
    'repair':         'repair',
    'vroom':          'vroom',
    'solar':          'solar',
    'roof':           'roof',
    'paint and body': 'paint_body',
    'paint & body':   'paint_body',
    'chassis':        'chassis',
    'detailing':      'detailing',
    'truetopper':     'truetopper',
};

// Maps SERVICE_SILOS key → canonical repairType label (for syncing back to RO)
export const SILO_TO_REPAIR_TYPE = {
    'repair':     'Repairs',
    'vroom':      'Vroom',
    'solar':      'Solar',
    'roof':       'Roof',
    'paint_body': 'Paint and Body',
    'chassis':    'Chassis',
    'detailing':  'Detailing',
    'truetopper': 'TrueTopper',
};

// ── Google Calendar IDs per service type ────────────────────────────
// Authoritative source is the `app_config` Supabase table (S7 remediation).
// This fallback fires only when the table read fails.
export const CALENDAR_IDS_FALLBACK = {
    'Roof':          'c_23890bb21428b7a92b1f942387a4ea769f4b00b9a08a2448ccbd31e0f1f0234d@group.calendar.google.com',
    'Solar':         'c_f7395ae6ecb439db38486d6aa9750c15dadbf34e7c29b0cdf64e0d5b0bfc1b95@group.calendar.google.com',
    'Vroom':         'c_5ih1tgaloe3kitrpidg2fttrgk@group.calendar.google.com',
    'Repairs':       'c_44c8f542bbfa7b68f7414af2d2548d495a25b4a00ee9e4c7081ff0b46d1e7316@group.calendar.google.com',
    'TrueTopper':    'c_be232eeb5a69d31311ee16f4aafc5988999223207b34d28ef93ff4094a0de891@group.calendar.google.com',
    'Paint and Body': 'c_911600141e4e8e889da76b4dfe294277016b68d2cae7d3d4523dab46ada7cc99@group.calendar.google.com',
    'Detailing':     'c_121e30023259fa55ae879ae30dab545b9a49c6d88b27bc8a5113b9ab20c8a88e@group.calendar.google.com',
    'Chassis':       'c_00fe106cb9b6c88fd83296d6bc2afde52b94fd5a5a46e598f0d8d9447fefaf0e@group.calendar.google.com',
};

// ── RO Status → numeric progress (drives the status-progress bar) ───
export const STATUS_PROGRESS_MAP = {
    'Not On Lot': 0,
    'On Lot': 10,
    'Off Lot - Returning': 15,
    'Awaiting Approval': 20,
    'Awaiting parts': 30,
    'Scheduled': 45,
    'Ready to Work': 50,
    'In progress': 60,
    'Repairs Completed': 80,
    'Waiting for QA/QC': 85,
    'Ready for pickup': 95,
    'Delivered/Cashed Out': 100
};

// ── Work Order Statuses ─────────────────────────────────────────────
export const WO_STATUS_LABELS = {
    not_started:                '⬜ Not Started',
    in_progress:                '🔄 In Progress',
    awaiting_customer_approval: '⏳ Awaiting Approval',
    customer_approved:          '✅ Approved',
    completed:                  '✅ Completed',
};
export const WO_STATUS_COLORS = {
    not_started:                '#94a3b8',
    in_progress:                '#3b82f6',
    awaiting_customer_approval: '#f59e0b',
    customer_approved:          '#8b5cf6',
    completed:                  '#22c55e',
};

// ── WO Task Statuses ────────────────────────────────────────────────
export const TASK_STATUSES = ['not_started','in_progress','awaiting_approval','awaiting_parts','completed'];
export const TASK_STATUS_LABELS = {
    not_started:      'Not Started',
    in_progress:      'In Progress',
    awaiting_approval:'Awaiting Approval',
    awaiting_parts:   'Awaiting Parts',
    completed:        '✅ Completed',
};
export const TASK_STATUS_COLORS = {
    not_started:      '#94a3b8',
    in_progress:      '#3b82f6',
    awaiting_approval:'#f59e0b',
    awaiting_parts:   '#ef4444',
    completed:        '#22c55e',
};

// ── Parts ───────────────────────────────────────────────────────────
export const PART_STATUSES = ['Ordered','In Transit','Sourcing','Received','Installed','Backordered','Returned','Lost'];

export const PART_STATUS_COLORS = {
    'Ordered':     '#ffcc00',
    'In Transit':  '#ff9500',
    'Sourcing':    '#ff6a00',
    'Received':    '#34c759',
    'Installed':   '#0a84ff',
    'Backordered': '#ff3b30',
    'Returned':    '#9ca3af',
    'Lost':        '#ff3b30'
};

export const ALL_PART_FIELDS = [
    'partName','partNumber','condition','qty','status','notes',
    'partsSource','poNumber','orderedBy','dateOrdered','eta','trackingNumber','partUrl','returnDeadline',
    'wholesalePrice','retailPrice','coreCharge','laborHours','serviceSilo',
    'supplier','salesAssocName','salesAssocPhone','salesAssocEmail',
    'dateReceived','receivedBy','warrantyPeriod'
];

// ── Service scheduling ──────────────────────────────────────────────
// Services that schedule in DAYS (not hours)
export const DAY_BASED_SERVICES = ['Roof', 'Paint and Body', 'Solar', 'Vroom'];

// ── i18n: Spanish translations ──────────────────────────────────────
export const TRANSLATIONS_ES = {
    // Header & nav
    'PRVS Repair Order Dashboard': 'Panel de Órdenes PRVS',
    '+ New RO': '+ Nueva OR',
    'Live': 'En Vivo',
    'RVs on Lot': 'RVs en el Lote',
    // Search & filters
    '🔍 Search:': '🔍 Buscar:',
    'Search name, RO ID, VIN, tech, description, phone…': 'Buscar nombre, OR, VIN, técnico, descripción, teléfono…',
    '✕ Clear': '✕ Limpiar',
    'Filter by Days on Lot ≥': 'Días en el Lote ≥',
    'Filter by Parts Status': 'Filtrar por Partes',
    'Filter by RO Type': 'Filtrar por Tipo de OT',
    'Filter by Repair Type:': 'Tipo de Reparación:',
    'Filter by Status': 'Filtrar por Estado',
    'All ROs': 'Todas',
    '⚠️ Outstanding': '⚠️ Pendientes',
    '🔴 Backordered': '🔴 Pedido Pendiente',
    'All': 'Todos',
    '🛡️ Insurance': '🛡️ Seguro',
    '🔀 Hybrid': '🔀 Híbrido',
    '🔧 Standard': '🔧 Estándar',
    '🏪 Shop': '🏪 Taller',
    '🏪 Shop Operations': '🏪 Operaciones de Taller',
    // RO status values
    'Not On Lot': 'No en el Lote',
    'On Lot': 'En el Lote',
    'Off Lot - Returning': 'Fuera del Lote - Regresa',
    'Awaiting Approval': 'Esperando Aprobación',
    'Awaiting parts': 'Esperando Partes',
    'Awaiting Parts': 'Esperando Partes',
    'Scheduled': 'Programado',
    'Ready to Work': 'Listo para Trabajar',
    'In progress': 'En Progreso',
    'In Progress': 'En Progreso',
    'Repairs Completed': 'Reparaciones Completadas',
    'Waiting for QA/QC': 'Esperando QA/QC',
    'Ready for pickup': 'Listo para Recoger',
    'Ready for Pickup': 'Listo para Recoger',
    'Delivered/Cashed Out': 'Entregado/Cerrado',
    // Urgency
    'CRITICAL': 'CRÍTICO',
    'HIGH': 'ALTO',
    'MEDIUM': 'MEDIO',
    'LOW': 'BAJO',
    // Card labels
    'Days': 'Días',
    'RV Not Specified': 'RV No Especificado',
    'Unknown Customer': 'Cliente Desconocido',
    'Unknown': 'Desconocido',
    'Not specified': 'No especificado',
    'Unassigned': 'Sin Asignar',
    'Click Here To Update': 'Toca Para Actualizar',
    'Insurance Claim': 'Reclamo de Seguro',
    'Customer Pay': 'Pago del Cliente',
    'PARTS REQUESTED — PENDING ORDER': 'PARTES SOLICITADAS — PEDIDO PENDIENTE',
    'PART SOURCING':      'BUSCANDO PARTES',
    'PARTS OUTSTANDING':  'PARTES PENDIENTES',
    'PARTS RECEIVED':     'PARTES RECIBIDAS',
    'PARTS ESTIMATE':     'ESTIMACIÓN DE PARTES',
    '🔩 Request Parts':   '🔩 Solicitar Partes',
    '🔩 Set Parts Status': '🔩 Estado de Partes',
    // Info row labels
    'Type:': 'Tipo:',
    'RV:': 'RV:',
    'VIN:': 'VIN:',
    'Tech:': 'Técnico:',
    'Phone:': 'Teléfono:',
    'Email:': 'Correo:',
    'Address:': 'Dirección:',
    // Section titles
    'Repair Description': 'Descripción de Reparación',
    'RO Status': 'Estado de la OR',
    'Customer Comm': 'Comunicación',
    'Message Customer': 'Mensaje al Cliente',
    'Thread': 'Hilo',
    'Progress': 'Progreso',
    // Time logs
    'View Time Logs': 'Ver Horas',
    '🔄 Refresh Time Logs': '🔄 Actualizar Horas',
    'session': 'sesión',
    'sessions': 'sesiones',
    // Card buttons
    'QR Code': 'Código QR',
    '🖨️ Print Label': '🖨️ Imprimir',
    '🚪 Tech Check In': '🚪 Check-In Técnico',
    'Manage Photos & Docs': 'Gestionar Fotos y Docs',
    'Add Photo / Docs': 'Agregar Foto / Docs',
    '✏️ Edit RO': '✏️ Editar OR',
    '🔩 Manage Parts': '🔩 Gestionar Partes',
    'Notify': 'Notificar',
    '🔔 Schedule Notification': '🔔 Programar Notificación',
    'Schedule Important Tasks or Update Notifications': 'Programar Tareas Importantes o Actualizar Notificaciones',
    '🔩 Request Parts': '🔩 Solicitar Partes',
    '✅ Mark Parts Ordered': '✅ Confirmar Pedido',
    'Schedule': 'Programar',
    'Reschedule': 'Reprogramar',
    '📦 Archive to Cashiered': '📦 Archivar',
    // Parts badge labels
    'Outstanding': 'Pendiente',
    'Backordered': 'Pedido Pendiente',
    'All Received': 'Todo Recibido',
    'Requested': 'Solicitado',
    // Empty state
    'No RVs match the current filters': 'Ningún RV coincide con los filtros',
    // v1.414 WO Redesign Phase A1+A2 — Missing WO badge + WO summary chips
    'No WO yet': 'Sin Orden de Trabajo',
    'WO exists — no tasks': 'OT existe — sin tareas',
    'No WO': 'Sin OT',
    'WO empty': 'OT vacía',
    'Build a Work Order for this RO': 'Crea una Orden de Trabajo para esta OR',
    'empty': 'vacía',
    'done': 'hecho',
    // Photo modal
    'Photos & Docs': 'Fotos y Docs',
    'Tap a photo to view full size. Set as main from the viewer.': 'Toca para ver tamaño completo.',
    '📷 Add New Photo': '📷 Agregar Foto',
    '📎 Upload Document': '📎 Subir Documento',
    'No photos yet.': 'Sin fotos aún.',
    'No documents yet.': 'Sin documentos aún.',
    '📧 Email Photos to Customer': '📧 Enviar Fotos al Cliente',
    '✕ Close': '✕ Cerrar',
};
