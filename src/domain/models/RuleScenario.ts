export interface RuleScenarioProps {
  readonly id: string;
  readonly name: string;
  readonly pattern: string; // Regex match pattern
  readonly tactic: string;  // MITRE ATLAS Tactic Name
  readonly status: "ACTIVE" | "INACTIVE";
  readonly version: number;
}

/**
 * RuleScenario domain entity representing dynamic detection rules.
 * Immutable design.
 */
export class RuleScenario {
  public readonly props: RuleScenarioProps;

  constructor(props: RuleScenarioProps) {
    this.props = { ...props };
  }

  public static create(props: Omit<RuleScenarioProps, "version"> & { version?: number }): RuleScenario {
    return new RuleScenario({
      ...props,
      version: props.version ?? 1
    });
  }

  public withProps(newProps: Partial<RuleScenarioProps>): RuleScenario {
    return new RuleScenario({
      ...this.props,
      ...newProps
    });
  }
}
