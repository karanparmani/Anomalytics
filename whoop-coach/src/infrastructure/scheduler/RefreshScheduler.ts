import cron from "node-cron";
import type { WhoopSyncService } from "../../application/WhoopSyncService.js";

export class RefreshScheduler {
  public constructor(
    private readonly expression: string,
    private readonly lookbackDays: number,
    private readonly sync: WhoopSyncService,
  ) {}

  public start(): void {
    cron.schedule(this.expression, () => {
      void this.sync.reconcileAll(this.lookbackDays);
    }, { noOverlap: true });
  }
}
