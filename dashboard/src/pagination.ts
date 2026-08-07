import type { TaskRecord } from "@mineagents/sdk";
import type { DashboardTaskFilters } from "./filters.js";

export const dashboardTaskPageSize = 50;

export interface DashboardTaskPage {
  items: readonly TaskRecord[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  firstItem: number;
  lastItem: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export const parseDashboardPage = (searchParams: URLSearchParams): number => {
  const values = searchParams.getAll("page");
  if (values.length !== 1 || !/^[1-9]\d{0,4}$/.test(values[0] ?? "")) {
    return 1;
  }

  const page = Number(values[0]);
  return Number.isSafeInteger(page) && page <= 10_000 ? page : 1;
};

export const paginateDashboardTasks = (
  tasks: readonly TaskRecord[],
  requestedPage: number,
  pageSize = dashboardTaskPageSize,
): DashboardTaskPage => {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new TypeError("Dashboard task page size must be between 1 and 100.");
  }

  const totalPages = Math.max(1, Math.ceil(tasks.length / pageSize));
  const safeRequestedPage =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const currentPage = Math.min(safeRequestedPage, totalPages);
  const offset = (currentPage - 1) * pageSize;
  const items = tasks.slice(offset, offset + pageSize);

  return {
    items,
    currentPage,
    totalPages,
    totalItems: tasks.length,
    firstItem: items.length === 0 ? 0 : offset + 1,
    lastItem: offset + items.length,
    hasPrevious: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
};

export const buildDashboardPageHref = (
  filters: DashboardTaskFilters,
  page: number,
): string => {
  const searchParams = new URLSearchParams();
  if (filters.query) {
    searchParams.set("q", filters.query);
  }
  if (filters.status) {
    searchParams.set("status", filters.status);
  }
  if (filters.projectId) {
    searchParams.set("projectId", filters.projectId);
  }
  if (page > 1) {
    searchParams.set("page", String(page));
  }

  const query = searchParams.toString();
  return query ? `/?${query}` : "/";
};
