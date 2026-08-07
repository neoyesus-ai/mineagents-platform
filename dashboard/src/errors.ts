export class DashboardUpstreamError extends Error {
  readonly code = "COORDINATOR_UNAVAILABLE";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DashboardUpstreamError";
  }
}

export class DashboardInputError extends Error {
  readonly code = "INVALID_ACTION_INPUT";

  constructor(message: string) {
    super(message);
    this.name = "DashboardInputError";
  }
}

export class DashboardActionsUnavailableError extends Error {
  readonly code = "ACTIONS_UNAVAILABLE";

  constructor() {
    super("Dashboard actions are unavailable for this data source.");
    this.name = "DashboardActionsUnavailableError";
  }
}
