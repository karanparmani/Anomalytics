export interface AnomalyReportProps {
  readonly id: string;
  readonly eventId: string;
  readonly score: number; // 0.0 to 1.0
  readonly detectedAnomalies: readonly string[]; // Reasons
  readonly mitreAtlasTactics: readonly string[]; // MITRE ATLAS tactics
  readonly sanctionStatus: "PASSED" | "FLAGGED";
  readonly actionTaken: "ALLOWED" | "ESCALATE_TO_SOC" | "BLOCKED";
  readonly timestamp: string;
  readonly version: number;
}

/**
 * AnomalyReport domain entity.
 * Immutable design.
 */
export class AnomalyReport {
  public readonly props: AnomalyReportProps;

  constructor(props: AnomalyReportProps) {
    this.props = {
      ...props,
      detectedAnomalies: [...props.detectedAnomalies],
      mitreAtlasTactics: [...props.mitreAtlasTactics]
    };
  }

  public static create(props: Omit<AnomalyReportProps, "version"> & { version?: number }): AnomalyReport {
    return new AnomalyReport({
      ...props,
      version: props.version ?? 1
    });
  }

  public withProps(newProps: Partial<AnomalyReportProps>): AnomalyReport {
    return new AnomalyReport({
      ...this.props,
      ...newProps
    });
  }
}
