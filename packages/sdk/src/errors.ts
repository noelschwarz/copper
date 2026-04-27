/**
 * Aloy SDK error hierarchy.
 *
 * The SDK has one absolutely-must-not-violate rule: no Aloy code path that
 * runs *during* a user's tool call may ever throw into that user code. The
 * single intentional exception is `PolicyViolationError`, which fires
 * *before* the underlying call executes when a tool exceeds the configured
 * risk threshold. Everything else (transport errors, redactor errors,
 * config oddities) gets caught at the boundary and dropped.
 */

export class AloyError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AloyError";
  }
}

export class AloyConfigError extends AloyError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AloyConfigError";
  }
}

export class AloyTransportError extends AloyError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AloyTransportError";
  }
}

export interface PolicyViolationDetails {
  readonly toolName: string;
  readonly riskScore: number;
  readonly threshold: number;
  readonly reason?: string;
}

export class PolicyViolationError extends AloyError {
  readonly details: PolicyViolationDetails;
  constructor(details: PolicyViolationDetails, message?: string) {
    super(
      message ??
        `Tool call "${details.toolName}" blocked by policy (risk ${details.riskScore} >= threshold ${details.threshold})`,
    );
    this.name = "PolicyViolationError";
    this.details = details;
  }
}
