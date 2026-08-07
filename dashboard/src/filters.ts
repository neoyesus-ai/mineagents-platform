import { isTaskStatus, type TaskRecord, type TaskStatus } from "@mineagents/sdk";

const maxQueryLength = 80;
const maxProjectIdLength = 200;

export interface DashboardTaskFilters {
  query?: string;
  status?: TaskStatus;
  projectId?: string;
}

const readSingle = (
  searchParams: URLSearchParams,
  key: string,
  maxLength: number,
): string | undefined => {
  const values = searchParams.getAll(key);
  if (values.length !== 1) {
    return undefined;
  }
  const value = values[0]?.trim();
  return value && value.length <= maxLength ? value : undefined;
};

export const parseDashboardTaskFilters = (
  searchParams: URLSearchParams,
): DashboardTaskFilters => {
  const query = readSingle(searchParams, "q", maxQueryLength);
  const statusValue = readSingle(searchParams, "status", 32);
  const projectId = readSingle(searchParams, "projectId", maxProjectIdLength);

  return {
    query,
    status: isTaskStatus(statusValue) ? statusValue : undefined,
    projectId,
  };
};

export const hasDashboardTaskFilters = (filters: DashboardTaskFilters): boolean =>
  filters.query !== undefined ||
  filters.status !== undefined ||
  filters.projectId !== undefined;

export const filterDashboardTasks = (
  tasks: readonly TaskRecord[],
  filters: DashboardTaskFilters,
): readonly TaskRecord[] => {
  const normalizedQuery = filters.query?.toLocaleLowerCase("es");

  return tasks.filter((task) => {
    if (filters.status && task.status !== filters.status) {
      return false;
    }
    if (filters.projectId && task.projectId !== filters.projectId) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }

    return [task.title, task.description ?? ""].some((value) =>
      value.toLocaleLowerCase("es").includes(normalizedQuery),
    );
  });
};
