import { CoachingEngine } from "../domain/coaching/CoachingEngine.js";
import type { CoachProfile, CoachingDashboard } from "../domain/models.js";
import type { CoachProfileRepository, RecordRepository, UserRepository } from "../domain/repositories.js";

export class CoachingService {
  public constructor(
    private readonly users: UserRepository,
    private readonly records: RecordRepository,
    private readonly profiles: CoachProfileRepository,
    private readonly engine = new CoachingEngine(),
  ) {}

  public async dashboard(authSubject: string, days = 90): Promise<CoachingDashboard> {
    const user = await this.users.findOrCreateBySubject(authSubject);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [records, profile] = await Promise.all([
      this.records.listSince(user.id, since),
      this.profiles.findProfile(user.id),
    ]);
    return this.engine.build(records, new Date(), profile);
  }

  public async saveProfile(authSubject: string, input: Omit<CoachProfile, "userId" | "version">): Promise<CoachProfile> {
    const user = await this.users.findOrCreateBySubject(authSubject);
    const existing = await this.profiles.findProfile(user.id);
    return this.profiles.save({ ...input, userId: user.id, version: existing?.version ?? 0 }, existing?.version ?? null);
  }
}
