export class DashboardUpstreamError extends Error {
  readonly code = "COORDINATOR_UNAVAILABLE";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DashboardUpstreamError";
  }
}
