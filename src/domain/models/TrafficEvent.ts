export interface TrafficEventProps {
  readonly id: string;
  readonly timestamp: string;
  readonly source: "API" | "FlatFile" | "DbCommit" | "UserInput";
  readonly payloadType: "JSON" | "text" | "sql";
  readonly payload: string;
  readonly actorId: string;
  readonly ipAddress: string | null;
  readonly location: string | null;
  readonly amount: number | null;
  readonly currency: string | null;
  readonly recipientName: string | null;
  readonly recipientCountry: string | null;
  readonly version: number;
}

/**
 * TrafficEvent domain entity.
 * Immutable design conforming to functional domain style.
 */
export class TrafficEvent {
  public readonly props: TrafficEventProps;

  constructor(props: TrafficEventProps) {
    this.props = { ...props }; // Defensive copy
  }

  public static create(props: Omit<TrafficEventProps, "version"> & { version?: number }): TrafficEvent {
    return new TrafficEvent({
      ...props,
      version: props.version ?? 1
    });
  }

  /**
   * Helper to perform functional mutations by returning a new instance (Immutability).
   */
  public withProps(newProps: Partial<TrafficEventProps>): TrafficEvent {
    return new TrafficEvent({
      ...this.props,
      ...newProps
    });
  }
}
