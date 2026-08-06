import type { AgentRecord, ProjectRecord, TaskRecord, TaskStatus } from "@mineagents/sdk";
import type { DashboardSnapshot } from "./contracts.js";

const visibleTaskLimit = 50;
const visibleAgentLimit = 12;

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
  @media (max-width:850px) { .metrics { grid-template-columns:repeat(2,1fr); } .layout { grid-template-columns:1fr; } }
  @media (max-width:560px) { header { align-items:flex-start; flex-direction:column; } .stamp { text-align:left; } .metrics { grid-template-columns:1fr; } main { width:min(100% - 20px,1180px); padding-top:24px; } }
`;

export const renderDashboard = (snapshot: DashboardSnapshot, refreshSeconds: number): string => {
  const projects = new Map(snapshot.projects.map((project) => [project.id, project]));
  const agents = new Map(snapshot.agents.map((agent) => [agent.id, agent]));
  const visibleTasks = snapshot.tasks.slice(0, visibleTaskLimit);
  const visibleAgents = snapshot.agents.slice(0, visibleAgentLimit);
  const activeTasks = snapshot.taskCounts.pending + snapshot.taskCounts.assigned + snapshot.taskCounts.running;
  const onlineAgents = snapshot.agents.filter((agent) => agent.status === "online").length;
  const taskRows = visibleTasks.map((task) => renderTask(task, projects, agents)).join("");
  const agentRows = visibleAgents.map(renderAgent).join("");

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
      <div><p class="eyebrow">Control de operaciones</p><h1>Mine<span>Agents</span></h1><p>Estado de sólo lectura del coordinator.</p></div>
      <p class="stamp"><strong>Coordinator conectado</strong>Actualizado ${displayDate(snapshot.generatedAt)}</p>
    </header>
    <section class="metrics" aria-label="Resumen">
      ${renderMetric("Tareas activas", activeTasks, `${snapshot.tasks.length} totales`)}
      ${renderMetric("Agentes online", onlineAgents, `${snapshot.agents.length} registrados`)}
      ${renderMetric("Completadas", snapshot.taskCounts.completed, `${snapshot.taskCounts.failed} fallidas`)}
      ${renderMetric("Proyectos", snapshot.projects.length, "persistencia coordinada")}
    </section>
    <section class="layout">
      <article class="panel">
        <div class="panel-head"><h2>Tareas recientes</h2><p>Mostrando ${visibleTasks.length} de ${snapshot.tasks.length}</p></div>
        ${taskRows.length === 0 ? '<p class="empty">Todavía no hay tareas.</p>' : `<div class="table-wrap"><table><thead><tr><th>Tarea</th><th>Estado</th><th>Proyecto</th><th>Agente</th><th>Actualizada</th></tr></thead><tbody>${taskRows}</tbody></table></div>`}
      </article>
      <aside class="panel">
        <div class="panel-head"><h2>Agentes</h2><p>${onlineAgents} online</p></div>
        ${agentRows.length === 0 ? '<p class="empty">Sin agentes registrados.</p>' : `<ul class="agents">${agentRows}</ul>`}
      </aside>
    </section>
    <footer>Recarga automática cada ${refreshSeconds} segundos · Sin controles de escritura</footer>
  </main>
</body>
</html>`;
};

export const renderUnavailable = (refreshSeconds: number): string => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="${refreshSeconds}"><title>MineAgents · Coordinator no disponible</title><style>${styles}</style></head>
<body><main><p class="eyebrow">Control de operaciones</p><h1>Mine<span>Agents</span></h1><section class="panel"><div class="empty"><h2>Coordinator no disponible</h2><p>El dashboard reintentará automáticamente. No se ha realizado ninguna operación de escritura.</p></div></section></main></body></html>`;
