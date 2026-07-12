export class OptimisticConcurrencyError extends Error {
  public constructor(message = "The record changed during this operation.") {
    super(message);
    this.name = "OptimisticConcurrencyError";
  }
}

export class AuthenticationRequiredError extends Error {
  public constructor(message = "Authentication is required.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class WhoopConnectionRequiredError extends Error {
  public constructor(message = "Connect WHOOP before requesting coaching data.") {
    super(message);
    this.name = "WhoopConnectionRequiredError";
  }
}
