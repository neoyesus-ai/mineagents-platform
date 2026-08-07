import type { AgentRecord, ProjectRecord, TaskRecord, TaskStatus } from "@mineagents/sdk";
import type { DashboardSnapshot } from "./contracts.js";
import {
  filterDashboardTasks,
  hasDashboardTaskFilters,
  type DashboardTaskFilters,
} from "./filters.js";
import {
  buildDashboardPageHref,
  paginateDashboardTasks,
  type DashboardTaskPage,
} from "./pagination.js";

const visibleAgentLimit = 12;

export interface DashboardFeedback {
  notice?: string | null;
  error?: string | null;
}

export interface DashboardViewOptions extends DashboardFeedback {
  filters?: DashboardTaskFilters;
  page?: number;
}

const notices: Readonly<Record<string, string>> = {
  "project-created": "Proyecto creado correctamente.",
  "task-created": "Tarea creada y añadida a la cola.",
  "task-cancelled": "Tarea cancelada correctamente.",
};

const statusLabels: Readonly<Record<TaskStatus, string>> = {
  pending: "Pendiente",
  assigned: "Asignada",
  running: "En curso",
  completed: "Completada",
  failed: "Fallida",
  cancelled: "Cancelada",
};

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const displayDate = (value: string): string => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return escapeHtml(value);
  }
  return new Date(timestamp).toISOString().replace("T", " ").replace(".000Z", " UTC");
};

const renderMetric = (label: string, value: number, note: string): string => `
  <article class="metric">
    <span>${escapeHtml(label)}</span>
    <strong>${value}</strong>
    <small>${escapeHtml(note)}</small>
  </article>`;

const renderFeedback = (feedback: DashboardFeedback): string => {
  const notice = feedback.notice ? notices[feedback.notice] : undefined;
  if (notice) {
    return `<p class="feedback feedback-success" role="status">${escapeHtml(notice)}</p>`;
  }
  if (feedback.error === "action-failed") {
    return '<p class="feedback feedback-error" role="alert">No se pudo completar la acción. Revisa el estado del coordinator e inténtalo de nuevo.</p>';
  }
  return "";
};

const renderControls = (projects: readonly ProjectRecord[]): string => {
  const projectOptions = projects
    .map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`)
    .join("");

  return `
    <section class="controls" aria-label="Acciones">
      <article class="panel action-panel">
        <div class="panel-head"><h2>Nueva tarea</h2><p>Se añade como pendiente</p></div>
        <form method="post" action="/actions/tasks">
          <label>Título<input name="title" required maxlength="200" placeholder="Ej. Recolectar 32 bloques de piedra"></label>
          <label>Descripción<textarea name="description" maxlength="4000" rows="3" placeholder="Objetivo y límites de la tarea"></textarea></label>
          <label>Proyecto<select name="projectId"><option value="">Sin proyecto</option>${projectOptions}</select></label>
          <button type="submit">Crear tarea</button>
        </form>
      </article>
      <article class="panel action-panel">
        <div class="panel-head"><h2>Nuevo proyecto</h2><p>Agrupa tareas relacionadas</p></div>
        <form method="post" action="/actions/projects">
          <label>Nombre<input name="name" required maxlength="120" placeholder="Ej. Base del poblado"></label>
          <label>Descripción<textarea name="description" maxlength="2000" rows="3" placeholder="Alcance del proyecto"></textarea></label>
          <button type="submit">Crear proyecto</button>
        </form>
      </article>
    </section>`;
};

const selectedAttribute = (selected: boolean): string => (selected ? " selected" : "");

const renderTaskFilters = (
  projects: readonly ProjectRecord[],
  filters: DashboardTaskFilters,
): string => {
  const statusOptions = Object.entries(statusLabels)
    .map(
      ([status, label]) =>
        `<option value="${status}"${selectedAttribute(filters.status === status)}>${escapeHtml(label)}</option>`,
    )
    .join("");
  const projectOptions = projects
    .map(
      (project) =>
        `<option value="${escapeHtml(project.id)}"${selectedAttribute(filters.projectId === project.id)}>${escapeHtml(project.name)}</option>`,
    )
    .join("");

  return `
    <section class="panel filter-panel" aria-label="Filtros de tareas">
      <div class="panel-head"><h2>Filtrar tareas</h2><p>La URL conserva la selección</p></div>
      <form class="task-filters" method="get" action="/">
        <label>Buscar<input type="search" name="q" maxlength="80" value="${escapeHtml(filters.query ?? "")}" placeholder="Título o descripción"></label>
        <label>Estado<select name="status"><option value="">Todos</option>${statusOptions}</select></label>
        <label>Proyecto<select name="projectId"><option value="">Todos</option>${projectOptions}</select></label>
        <div class="filter-actions"><button type="submit">Aplicar filtros</button><a class="button-secondary" href="/">Limpiar</a></div>
      </form>
    </section>`;
};
const renderPaginationLink = (
  enabled: boolean,
  href: string,
  label: string,
  rel: "prev" | "next",
): string =>
  enabled
    ? `<a class="button-secondary" href="${escapeHtml(href)}" rel="${rel}">${label}</a>`
    : `<span class="button-secondary is-disabled" aria-disabled="true">${label}</span>`;

const renderTaskPagination = (
  filters: DashboardTaskFilters,
  page: DashboardTaskPage,
): string => {
  if (page.totalPages <= 1) {
    return "";
  }

  const previousHref = buildDashboardPageHref(filters, page.currentPage - 1);
  const nextHref = buildDashboardPageHref(filters, page.currentPage + 1);

  return `
    <nav class="task-pagination" aria-label="Paginación de tareas">
      <span>Mostrando ${page.firstItem}–${page.lastItem} de ${page.totalItems}</span>
      <div class="pagination-links">
        ${renderPaginationLink(page.hasPrevious, previousHref, "Anterior", "prev")}
        <span>Página ${page.currentPage} de ${page.totalPages}</span>
        ${renderPaginationLink(page.hasNext, nextHref, "Siguiente", "next")}
      </div>
    </nav>`;
};

const renderTask = (
  task: TaskRecord,
  projects: ReadonlyMap<string, ProjectRecord>,
  agents: ReadonlyMap<string, AgentRecord>,
): string => {
  const project = task.projectId ? projects.get(task.projectId) : undefined;
  const agent = task.assignedAgentId ? agents.get(task.assignedAgentId) : undefined;
  return `
    <tr>
      <td>
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(task.description ?? "Sin descripción")}</small>
      </td>
      <td><span class="status status-${task.status}">${statusLabels[task.status]}</span></td>
      <td>${escapeHtml(project?.name ?? "Sin proyecto")}</td>
      <td>${escapeHtml(agent?.name ?? "Sin asignar")}</td>
      <td><time datetime="${escapeHtml(task.updatedAt)}">${displayDate(task.updatedAt)}</time></td>
      <td class="task-action">
        ${task.status === "pending" || task.status === "assigned" || task.status === "running"
          ? `<form method="post" action="/actions/tasks/${encodeURIComponent(task.id)}/cancel"><button class="button-danger" type="submit">Cancelar</button></form>`
          : '<span class="muted">—</span>'}
      </td>
    </tr>`;
};

const renderAgent = (agent: AgentRecord): string => `
  <li>
    <span class="agent-state agent-state-${agent.status}" aria-label="${agent.status}"></span>
    <div>
      <strong>${escapeHtml(agent.name)}</strong>
      <small>${escapeHtml(agent.role ?? "sin rol")} · ${displayDate(agent.lastHeartbeatAt)}</small>
    </div>
  </li>`;

const styles = `
  :root { color-scheme: dark; --bg:#0b100d; --panel:#141c17; --panel-2:#19231d; --line:#2b3a30; --text:#edf5ef; --muted:#91a499; --green:#72d572; --amber:#e6bd62; --red:#ea7777; --blue:#77aeea; }
  * { box-sizing:border-box; }
  body { margin:0; background:radial-gradient(circle at top right,#193124 0,#0b100d 34rem); color:var(--text); font:15px/1.5 system-ui,sans-serif; }
  main { width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:42px 0 64px; }
  header { display:flex; justify-content:space-between; gap:24px; align-items:flex-end; margin-bottom:28px; }
  h1,h2,p { margin-top:0; } h1 { margin-bottom:4px; font-size:clamp(2rem,5vw,3.6rem); line-height:1; letter-spacing:-.04em; }
  h1 span { color:var(--green); } h2 { font-size:1rem; letter-spacing:.08em; text-transform:uppercase; color:#c4d2c9; }
  .eyebrow { color:var(--green); font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
  .stamp { color:var(--muted); text-align:right; } .stamp strong { display:block; color:var(--text); }
  .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:28px; }
  .metric,.panel { border:1px solid var(--line); background:linear-gradient(145deg,var(--panel-2),var(--panel)); box-shadow:0 18px 50px #0004; }
  .metric { padding:18px; border-radius:12px; } .metric span,.metric small { display:block; color:var(--muted); }
  .metric strong { display:block; margin:6px 0 2px; font-size:2rem; }
  .feedback { margin:0 0 20px; padding:12px 16px; border:1px solid currentColor; border-radius:10px; }
  .feedback-success { color:var(--green); background:#17321e; } .feedback-error { color:var(--red); background:#351a1a; }
  .controls { display:grid; grid-template-columns:2fr 1fr; gap:16px; margin-bottom:28px; }
  .action-panel form { display:grid; gap:13px; padding:20px; }
  label { display:grid; gap:5px; color:var(--muted); font-size:.82rem; font-weight:700; }
  input,textarea,select { width:100%; border:1px solid var(--line); border-radius:8px; background:#0d1510; color:var(--text); padding:10px 12px; font:inherit; }
  textarea { resize:vertical; } input:focus,textarea:focus,select:focus { outline:2px solid var(--green); outline-offset:1px; }
  button { justify-self:start; border:0; border-radius:8px; background:var(--green); color:#081109; padding:9px 14px; font:inherit; font-weight:800; cursor:pointer; }
  button:hover { filter:brightness(1.08); } .button-danger { border:1px solid var(--red); background:transparent; color:var(--red); padding:5px 9px; font-size:.78rem; }
  .task-action form { margin:0; } .muted { color:var(--muted); }
  .filter-panel { margin-bottom:16px; }
  .task-filters { display:grid; grid-template-columns:2fr 1fr 1fr; gap:13px; padding:18px 20px; }
  .filter-actions { display:flex; align-items:center; gap:10px; grid-column:1/-1; }
  .button-secondary { display:inline-block; border:1px solid var(--line); border-radius:8px; color:var(--text); padding:8px 14px; font-weight:800; text-decoration:none; }
  .button-secondary:hover { border-color:var(--green); }
  .task-pagination { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:14px 18px; border-top:1px solid var(--line); color:var(--muted); }
  .pagination-links { display:flex; align-items:center; gap:10px; }
  .is-disabled { opacity:.45; pointer-events:none; }
  .layout { display:grid; grid-template-columns:minmax(0,3fr) minmax(250px,1fr); gap:16px; align-items:start; }
  .panel { border-radius:14px; overflow:hidden; } .panel-head { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px 20px; border-bottom:1px solid var(--line); }
  .panel-head h2,.panel-head p { margin:0; } .panel-head p { color:var(--muted); font-size:.85rem; }
  .table-wrap { overflow-x:auto; } table { width:100%; border-collapse:collapse; min-width:760px; }
  th,td { padding:14px 18px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
  th { color:var(--muted); font-size:.72rem; letter-spacing:.08em; text-transform:uppercase; } tbody tr:last-child td { border-bottom:0; }
  td strong,td small { display:block; } td small { color:var(--muted); max-width:36ch; }
  .status { display:inline-block; padding:4px 8px; border:1px solid currentColor; border-radius:999px; font-size:.76rem; white-space:nowrap; }
  .status-pending,.status-assigned { color:var(--amber); } .status-running { color:var(--blue); } .status-completed { color:var(--green); } .status-failed,.status-cancelled { color:var(--red); }
  .agents { margin:0; padding:6px 18px; list-style:none; } .agents li { display:flex; gap:12px; align-items:center; padding:13px 0; border-bottom:1px solid var(--line); }
  .agents li:last-child { border-bottom:0; } .agents strong,.agents small { display:block; } .agents small { color:var(--muted); }
  .agent-state { width:10px; height:10px; border-radius:50%; background:var(--red); box-shadow:0 0 12px currentColor; flex:0 0 auto; }
  .agent-state-online { background:var(--green); } .empty { padding:36px 20px; color:var(--muted); text-align:center; }
  footer { margin-top:18px; color:var(--muted); font-size:.82rem; }
  @media (max-width:850px) { .metrics { grid-template-columns:repeat(2,1fr); } .controls,.layout { grid-template-columns:1fr; } }
  @media (max-width:560px) { header,.task-pagination { align-items:flex-start; flex-direction:column; } .stamp { text-align:left; } .metrics,.task-filters { grid-template-columns:1fr; } main { width:min(100% - 20px,1180px); padding-top:24px; } }
`;

export const renderDashboard = (
  snapshot: DashboardSnapshot,
  refreshSeconds: number,
  options: DashboardViewOptions = {},
): string => {
  const projects = new Map(snapshot.projects.map((project) => [project.id, project]));
  const agents = new Map(snapshot.agents.map((agent) => [agent.id, agent]));
  const filters = options.filters ?? {};
  const filteredTasks = filterDashboardTasks(snapshot.tasks, filters);
  const filtersActive = hasDashboardTaskFilters(filters);
  const taskPage = paginateDashboardTasks(filteredTasks, options.page ?? 1);
  const visibleTasks = taskPage.items;
  const visibleAgents = snapshot.agents.slice(0, visibleAgentLimit);
  const activeTasks = snapshot.taskCounts.pending + snapshot.taskCounts.assigned + snapshot.taskCounts.running;
  const onlineAgents = snapshot.agents.filter((agent) => agent.status === "online").length;
  const taskRows = visibleTasks.map((task) => renderTask(task, projects, agents)).join("");
  const agentRows = visibleAgents.map(renderAgent).join("");
  const resultLabel = filtersActive ? "coincidencias" : "tareas";
  const taskCountLabel = `Página ${taskPage.currentPage} de ${taskPage.totalPages} · ${taskPage.totalItems} ${resultLabel}`;
  const emptyTaskMessage = filtersActive ? "No hay tareas que coincidan." : "Todavía no hay tareas.";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="${refreshSeconds}">
  <title>MineAgents · Operaciones</title>
  <style>${styles}</style>
</head>
<body>
  <main>
    <header>
      <div><p class="eyebrow">Control de operaciones</p><h1>Mine<span>Agents</span></h1><p>Crea y supervisa trabajo a través del coordinator.</p></div>
      <p class="stamp"><strong>Coordinator conectado</strong>Actualizado ${displayDate(snapshot.generatedAt)}</p>
    </header>
    ${renderFeedback(options)}
    <section class="metrics" aria-label="Resumen">
      ${renderMetric("Tareas activas", activeTasks, `${snapshot.tasks.length} totales`)}
      ${renderMetric("Agentes online", onlineAgents, `${snapshot.agents.length} registrados`)}
      ${renderMetric("Completadas", snapshot.taskCounts.completed, `${snapshot.taskCounts.failed} fallidas`)}
      ${renderMetric("Proyectos", snapshot.projects.length, "persistencia coordinada")}
    </section>
    ${renderControls(snapshot.projects)}
    ${renderTaskFilters(snapshot.projects, filters)}
    <section class="layout">
      <article class="panel">
        <div class="panel-head"><h2>Tareas recientes</h2><p>${taskCountLabel}</p></div>
        ${taskRows.length === 0 ? `<p class="empty">${emptyTaskMessage}</p>` : `<div class="table-wrap"><table><thead><tr><th>Tarea</th><th>Estado</th><th>Proyecto</th><th>Agente</th><th>Actualizada</th><th>Acción</th></tr></thead><tbody>${taskRows}</tbody></table></div>`}
        ${renderTaskPagination(filters, taskPage)}
      </article>
      <aside class="panel">
        <div class="panel-head"><h2>Agentes</h2><p>${onlineAgents} online</p></div>
        ${agentRows.length === 0 ? '<p class="empty">Sin agentes registrados.</p>' : `<ul class="agents">${agentRows}</ul>`}
      </aside>
    </section>
    <footer>Recarga automática cada ${refreshSeconds} segundos · Las acciones se validan y registran en el coordinator</footer>
  </main>
</body>
</html>`;
};

export const renderUnavailable = (refreshSeconds: number): string => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="${refreshSeconds}"><title>MineAgents · Coordinator no disponible</title><style>${styles}</style></head>
<body><main><p class="eyebrow">Control de operaciones</p><h1>Mine<span>Agents</span></h1><section class="panel"><div class="empty"><h2>Coordinator no disponible</h2><p>El dashboard reintentará automáticamente. No se ha realizado ninguna operación de escritura.</p></div></section></main></body></html>`;
