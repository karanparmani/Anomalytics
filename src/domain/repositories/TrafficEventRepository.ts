import { TrafficEvent } from "../models/TrafficEvent.js";

export interface TrafficEventRepository {
  save(event: TrafficEvent): Promise<TrafficEvent>;
  findById(id: string): Promise<TrafficEvent | null>;
}
