export const mockProfile = {
  id: "usr_001",
  name: "Dr. Narem Roel",
  email: "narem@lexai.pe",
  role: "Abogado Senior",
  firm: "LexAI Legal",
  avatar: null,
};

export const mockStats = {
  pending_tasks: 7,
  unread_emails: 12,
  hours_this_week: 32.5,
  load_index: 3.2,
};

export const mockTasks = [
  { id: "t1", title: "Preparar recurso de apelación — Caso GR Cusco OxI", priority: "urgente" as const, deadline: "2026-04-01", project: "GR Cusco OxI", completed: false },
  { id: "t2", title: "Revisar informe DGPPIP sobre viabilidad del PIP", priority: "alta" as const, deadline: "2026-04-02", project: "GR Cusco OxI", completed: false },
  { id: "t3", title: "Responder requerimiento SUNAT — Caso Quellaveco", priority: "urgente" as const, deadline: "2026-04-01", project: "Quellaveco EIA", completed: false },
  { id: "t4", title: "Elaborar cronograma de arbitraje Graña y Montero", priority: "media" as const, deadline: "2026-04-05", project: "Graña Montero Arbitraje", completed: false },
  { id: "t5", title: "Actualizar expediente TSRA — audiencia programada", priority: "alta" as const, deadline: "2026-04-03", project: "TSRA Apelación", completed: false },
  { id: "t6", title: "Coordinar reunión con procurador de Miraflores APP", priority: "media" as const, deadline: "2026-04-07", project: "Miraflores APP", completed: false },
  { id: "t7", title: "Registrar horas del equipo — cierre semanal", priority: "baja" as const, deadline: "2026-04-04", project: "Interno", completed: false },
];

export const mockEmails = [
  {
    id: "e1",
    subject: "RE: Recurso de Apelación TSRA — Exp. 2024-0892",
    from: "Secretaría TSRA <secretaria@tsra.gob.pe>",
    date: "2026-03-31T09:15:00",
    urgency: "urgente" as const,
    summary: "Notificación de audiencia oral programada para el 3 de abril. Se requiere confirmar asistencia.",
    body: "Estimado Dr. Roel,\n\nPor medio de la presente se le notifica que la audiencia oral del Expediente N° 2024-0892 ha sido programada para el día 3 de abril de 2026 a las 10:00 horas en la Sala 3 del TSRA.\n\nSe solicita confirmar su asistencia a la brevedad.\n\nAtentamente,\nSecretaría del TSRA",
    ai_analysis: { type: "Notificación judicial", urgency: "urgente", deadline: "2026-04-03", client: "GR Cusco", project: "TSRA Apelación" },
    read: false,
  },
  {
    id: "e2",
    subject: "Observaciones al Expediente Técnico — OxI GR Cusco",
    from: "Ing. Carlos Mendoza <cmendoza@regioncusco.gob.pe>",
    date: "2026-03-30T16:42:00",
    urgency: "alta" as const,
    summary: "DGPPIP observó 3 puntos del expediente técnico. Requiere subsanación en 5 días hábiles.",
    body: "Dr. Roel,\n\nLe informo que la DGPPIP ha emitido observaciones al expediente técnico del proyecto OxI de la carretera Cusco-Quillabamba. Los puntos observados son:\n\n1. Falta de sustento técnico en el componente ambiental\n2. Inconsistencia en el presupuesto de la partida 3.2\n3. Ausencia del informe de factibilidad del ANA\n\nEl plazo para subsanación es de 5 días hábiles.\n\nSaludos,\nIng. Carlos Mendoza",
    ai_analysis: { type: "Requerimiento administrativo", urgency: "alta", deadline: "2026-04-07", client: "GR Cusco", project: "GR Cusco OxI" },
    read: false,
  },
  {
    id: "e3",
    subject: "Requerimiento de información tributaria — Quellaveco",
    from: "SUNAT <notificaciones@sunat.gob.pe>",
    date: "2026-03-29T11:00:00",
    urgency: "media" as const,
    summary: "SUNAT solicita documentación de respaldo para deducción de gastos ambientales del EIA.",
    body: "Contribuyente: Anglo American Quellaveco S.A.\nRUC: 20100971231\n\nSe le requiere presentar la documentación sustentatoria de los gastos ambientales declarados en el ejercicio fiscal 2025, específicamente relacionados con el EIA del proyecto Quellaveco.\n\nPlazo: 10 días hábiles.\n\nSUNAT — Intendencia de Principales Contribuyentes",
    ai_analysis: { type: "Requerimiento tributario", urgency: "media", deadline: "2026-04-11", client: "Anglo American", project: "Quellaveco EIA" },
    read: true,
  },
  {
    id: "e4",
    subject: "Invitación a conversatorio CAL Lima — IA en el Derecho",
    from: "CAL Lima <eventos@cal.org.pe>",
    date: "2026-03-28T08:30:00",
    urgency: "baja" as const,
    summary: "Invitación al conversatorio sobre inteligencia artificial en la práctica jurídica peruana.",
    body: "Estimado(a) colegiado(a),\n\nEl Colegio de Abogados de Lima tiene el agrado de invitarle al conversatorio 'Inteligencia Artificial en la Práctica Jurídica Peruana' que se realizará el 15 de abril de 2026.\n\nPonentes: Dr. María Luisa Fernández, Dr. Jorge Avendaño.\n\nInscripciones en: www.cal.org.pe/eventos\n\nAtentamente,\nComisión de Eventos — CAL Lima",
    ai_analysis: { type: "Invitación", urgency: "baja", deadline: "2026-04-15", client: null, project: null },
    read: true,
  },
];

export const mockSuggestions = [
  {
    id: "s1",
    emoji: "⚠️",
    question: "¿Quieres preparar la audiencia TSRA del 3 de abril?",
    detail: "Tienes una audiencia oral en 3 días. Puedo generar un resumen del expediente y puntos clave de argumentación.",
    action: "Preparar audiencia",
  },
  {
    id: "s2",
    emoji: "📋",
    question: "¿Necesitas subsanar las observaciones de DGPPIP?",
    detail: "La DGPPIP observó 3 puntos del expediente OxI. Puedo analizar cada observación y sugerir respuestas.",
    action: "Analizar observaciones",
  },
  {
    id: "s3",
    emoji: "⏰",
    question: "¿Registraste tus horas de esta semana?",
    detail: "Llevas 32.5 horas registradas. El promedio semanal es 40h. Faltan 2 días para el cierre.",
    action: "Registrar horas",
  },
];

export const mockChatMessages = [
  {
    id: "msg1",
    role: "user" as const,
    content: "¿Cuáles son los requisitos para que un gobierno regional ejecute un proyecto OxI?",
    timestamp: "2026-03-31T10:00:00",
  },
  {
    id: "msg2",
    role: "assistant" as const,
    content: `## Requisitos para Proyectos OxI — Gobierno Regional

Los proyectos de **Obras por Impuestos (OxI)** ejecutados por gobiernos regionales deben cumplir los siguientes requisitos conforme al **Decreto Legislativo N° 1534** y su Reglamento:

### 1. Requisitos Previos
- Proyecto de inversión pública declarado **viable** por la DGPPIP del MEF
- Inscripción en el **Banco de Inversiones** del SNPMGI
- Priorización por el Gobierno Regional mediante **acuerdo de consejo regional**

### 2. Proceso de Selección
- Publicación de la **lista priorizada** en el portal del MEF
- Convocatoria a empresas privadas interesadas
- Selección del **ejecutor privado** mediante proceso competitivo

### 3. Documentación Requerida
- Expediente técnico aprobado
- **Convenio de inversión** entre el GR y la empresa privada
- Informe de capacidad presupuestal
- Opinión favorable de la **Contraloría General** (para proyectos > 15,000 UIT)

### 4. Ejecución y Supervisión
- Supervisión a cargo del **GR** o entidad contratada
- Informes trimestrales al MEF
- Conformidad de obra por el GR

> **Nota importante:** El DL 1534 modificó el DL 1250, ampliando los sectores elegibles para OxI e incluyendo mantenimiento de infraestructura.`,
    timestamp: "2026-03-31T10:00:15",
    tools: ["corpus_search", "gemini_search", "kelsen_analysis"],
    confidence: "alto" as const,
    citation_verified: 3,
    citation_total: 4,
    sources: [
      { title: "DL 1534 — Ley de Obras por Impuestos", url: "https://www.mef.gob.pe/dl1534", domain: "mef.gob.pe", verified: true },
      { title: "Guía de OxI para Gobiernos Regionales", url: "https://www.mef.gob.pe/oxi-guia", domain: "mef.gob.pe", verified: true },
      { title: "Resolución DGPPIP N° 003-2025", url: "https://dgppip.mef.gob.pe/res003", domain: "dgppip.mef.gob.pe", verified: true },
      { title: "Análisis OxI — Gestión Pública", url: "https://gestionpublica.pe/oxi-analysis", domain: "gestionpublica.pe", verified: false },
    ],
  },
];

export const mockCorpusResults = [
  {
    id: "cr1",
    title: "Lineamientos para la ejecución de proyectos OxI",
    doc_number: "RD-003-2025-EF/63.01",
    date: "2025-08-15",
    source: "DGPPIP",
    relevance: 94,
    snippet: "Los <mark>proyectos OxI</mark> ejecutados por <mark>gobiernos regionales</mark> deberán contar con la declaración de viabilidad vigente y estar inscritos en el Banco de Inversiones...",
  },
  {
    id: "cr2",
    title: "Procedimiento de priorización de proyectos OxI",
    doc_number: "DIR-012-2024-EF/63.01",
    date: "2024-11-20",
    source: "DGPPIP",
    relevance: 87,
    snippet: "La priorización de <mark>inversiones OxI</mark> se realiza mediante acuerdo del consejo regional, considerando la brecha de infraestructura y el impacto social del proyecto...",
  },
  {
    id: "cr3",
    title: "Supervisión y control de obras ejecutadas bajo modalidad OxI",
    doc_number: "DIR-008-2025-EF/63.01",
    date: "2025-03-10",
    source: "DGPPIP",
    relevance: 79,
    snippet: "El <mark>gobierno regional</mark> es responsable de la supervisión de la obra, pudiendo contratar a una entidad supervisora especializada para <mark>proyectos OxI</mark>...",
  },
  {
    id: "cr4",
    title: "Certificación de crédito presupuestario para OxI",
    doc_number: "INF-045-2025-EF/50.06",
    date: "2025-06-01",
    source: "DGPPIP",
    relevance: 72,
    snippet: "Para la emisión del CIPRL, la entidad pública debe acreditar la disponibilidad de recursos para el reconocimiento de la <mark>inversión OxI</mark> en los ejercicios fiscales correspondientes...",
  },
];

export const mockVerification = {
  norm: "Decreto Legislativo 1252",
  verdict: "VIGENTE" as const,
  confidence: "alto" as const,
  sources: [
    { title: "DL 1252 — Texto actualizado (SPIJ)", url: "https://spij.minjus.gob.pe/dl1252", domain: "spij.minjus.gob.pe", verified: true },
    { title: "DL 1432 — Modificatoria (SPIJ)", url: "https://spij.minjus.gob.pe/dl1432", domain: "spij.minjus.gob.pe", verified: true },
    { title: "Análisis DL 1252 — LP Pasión por el Derecho", url: "https://lpderecho.pe/dl1252", domain: "lpderecho.pe", verified: false },
  ],
};

export const mockCases = [
  { id: "c1", client_name: "Gobierno Regional de Cusco", project_name: "Carretera Cusco-Quillabamba OxI", area_legal: "Inversión Pública", status: "activo" as const, created: "2025-11-15" },
  { id: "c2", client_name: "Anglo American", project_name: "Quellaveco — Estudio de Impacto Ambiental", area_legal: "Derecho Ambiental", status: "urgente" as const, created: "2025-09-01" },
  { id: "c3", client_name: "SUNAT", project_name: "Recurso de Reclamación Tributaria", area_legal: "Derecho Tributario", status: "pendiente" as const, created: "2026-01-20" },
  { id: "c4", client_name: "Municipalidad de Miraflores", project_name: "APP Estacionamientos Subterráneos", area_legal: "APP / Concesiones", status: "activo" as const, created: "2026-02-10" },
  { id: "c5", client_name: "Graña y Montero", project_name: "Arbitraje CIADI — Carretera Interoceánica", area_legal: "Arbitraje Internacional", status: "activo" as const, created: "2025-06-01" },
];

export const mockJournalEntries = [
  { id: "j1", case_id: "c1", type: "nota" as const, content: "DGPPIP emitió observaciones al expediente técnico. 3 puntos a subsanar.", date: "2026-03-30", author: "Dr. Narem Roel" },
  { id: "j2", case_id: "c1", type: "tarea" as const, content: "Coordinar con Ing. Mendoza la respuesta a observaciones antes del 7 de abril.", date: "2026-03-30", author: "Dr. Narem Roel" },
  { id: "j3", case_id: "c2", type: "nota" as const, content: "Revisar precedente del caso Tía María para argumentación de EIA.", date: "2026-03-28", author: "Dr. Narem Roel" },
  { id: "j4", case_id: "c1", type: "tarea" as const, content: "Cliente prefiere estrategia de subsanación parcial para ganar tiempo.", date: "2026-03-27", author: "Dr. Narem Roel" },
];

export const mockCalendarEvents = [
  { id: "ev1", title: "Audiencia oral TSRA — Exp. 2024-0892", date: "2026-04-02", start: "10:00", end: "12:00", type: "audiencia" as const, color: "danger" },
  { id: "ev2", title: "Reunión con GR Cusco — observaciones DGPPIP", date: "2026-03-31", start: "15:00", end: "16:30", type: "reunion" as const, color: "teal" },
  { id: "ev3", title: "Plazo SUNAT — documentación Quellaveco", date: "2026-04-03", start: "09:00", end: "09:00", type: "deadline" as const, color: "caution" },
  { id: "ev4", title: "Capacitación interna — Nuevo reglamento OxI", date: "2026-04-01", start: "14:00", end: "16:00", type: "interno" as const, color: "muted" },
  { id: "ev5", title: "Revisión expediente Quellaveco con equipo", date: "2026-03-31", start: "09:00", end: "11:00", type: "reunion" as const, color: "teal" },
];

export const mockTimeEntries = [
  { id: "te1", project: "GR Cusco OxI", hours: 4.5, date: "2026-03-31", notes: "Revisión de observaciones DGPPIP" },
  { id: "te2", project: "Quellaveco EIA", hours: 3.0, date: "2026-03-31", notes: "Análisis de requerimiento SUNAT" },
  { id: "te3", project: "TSRA Apelación", hours: 2.5, date: "2026-03-30", notes: "Preparación de alegatos" },
  { id: "te4", project: "Graña Montero Arbitraje", hours: 5.0, date: "2026-03-29", notes: "Jurisprudencia CIADI" },
  { id: "te5", project: "Miraflores APP", hours: 1.5, date: "2026-03-29", notes: "Revisión contrato de concesión" },
];

export const mockNews = [
  {
    id: "n1",
    title: "TSRA emite resolución sobre competencia en conflictos de OxI",
    summary: "El Tribunal Superior de Responsabilidades Administrativas estableció nuevos criterios para determinar competencia en controversias derivadas de proyectos de Obras por Impuestos.",
    heat: "alta" as const,
    source: "El Peruano",
    date: "2026-03-30",
    category: "Administrativo",
    affected_case: "Carretera Cusco-Quillabamba OxI",
  },
  {
    id: "n2",
    title: "MEF publica nueva directiva para gestión de inversiones 2026",
    summary: "La Dirección General de Programación Multianual de Inversiones del MEF actualizó los lineamientos para la formulación y evaluación de proyectos de inversión pública.",
    heat: "alta" as const,
    source: "MEF",
    date: "2026-03-28",
    category: "Inversión Pública",
    affected_case: "Carretera Cusco-Quillabamba OxI",
  },
  {
    id: "n3",
    title: "Congreso debate proyecto de ley sobre uso de IA en procesos judiciales",
    summary: "La Comisión de Justicia del Congreso discute la regulación del uso de inteligencia artificial como herramienta de apoyo en la administración de justicia.",
    heat: "baja" as const,
    source: "Congreso",
    date: "2026-03-25",
    category: "Tecnología Legal",
    affected_case: null,
  },
  {
    id: "n4",
    title: "SUNAT modifica procedimiento de fiscalización para grandes contribuyentes",
    summary: "Nueva resolución establece plazos más cortos para atender requerimientos de información tributaria en procesos de fiscalización parcial.",
    heat: "media" as const,
    source: "SUNAT",
    date: "2026-03-24",
    category: "Tributario",
    affected_case: "Quellaveco — Estudio de Impacto Ambiental",
  },
  {
    id: "n5",
    title: "Tribunal Constitucional fija criterio sobre derecho de defensa en arbitraje",
    summary: "El TC estableció que la falta de notificación oportuna en procesos arbitrales constituye vulneración al debido proceso y al derecho de defensa.",
    heat: "media" as const,
    source: "TC",
    date: "2026-03-22",
    category: "Civil",
    affected_case: null,
  },
];

// Peruvian national holidays 2026 for business days calculator
export const PERU_HOLIDAYS_2026 = [
  "2026-01-01", // Año Nuevo
  "2026-04-02", // Jueves Santo
  "2026-04-03", // Viernes Santo
  "2026-05-01", // Día del Trabajo
  "2026-06-29", // San Pedro y San Pablo
  "2026-07-28", // Fiestas Patrias
  "2026-07-29", // Fiestas Patrias
  "2026-08-06", // Batalla de Junín
  "2026-08-30", // Santa Rosa de Lima
  "2026-10-08", // Combate de Angamos
  "2026-11-01", // Todos los Santos
  "2026-12-08", // Inmaculada Concepción
  "2026-12-25", // Navidad
];
