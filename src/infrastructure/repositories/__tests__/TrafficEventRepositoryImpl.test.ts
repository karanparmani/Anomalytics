import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Database } from "../../db/Database.js";
import { TrafficEventRepositoryImpl } from "../TrafficEventRepositoryImpl.js";
import { TrafficEvent } from "../../../domain/models/TrafficEvent.js";

describe("TrafficEventRepository SQLite with OCC", () => {
  let repository: TrafficEventRepositoryImpl;

  beforeEach(() => {
    Database.reset();
    const db = Database.getInstance(":memory:");
    repository = new TrafficEventRepositoryImpl(db);
  });

  afterEach(() => {
    Database.reset();
  });

  test("should save a new event and retrieve it by ID", async () => {
    const event = TrafficEvent.create({
      id: "evt_test_save",
      timestamp: new Date().toISOString(),
      source: "API",
      payloadType: "JSON",
      payload: '{"status": "ok"}',
      actorId: "usr_123",
      ipAddress: null,
      location: null,
      amount: null,
      currency: null,
      recipientName: null,
      recipientCountry: null
    });

    const saved = await repository.save(event);
    expect(saved.props.version).toBe(1);

    const fetched = await repository.findById("evt_test_save");
    expect(fetched).not.toBeNull();
    expect(fetched!.props.actorId).toBe("usr_123");
    expect(fetched!.props.version).toBe(1);
  });

  test("should increment version on successful updates", async () => {
    const event = TrafficEvent.create({
      id: "evt_test_occ",
      timestamp: new Date().toISOString(),
      source: "API",
      payloadType: "JSON",
      payload: '{"status": "ok"}',
      actorId: "usr_123",
      ipAddress: null,
      location: null,
      amount: null,
      currency: null,
      recipientName: null,
      recipientCountry: null
    });

    const saved = await repository.save(event);
    expect(saved.props.version).toBe(1);

    // Modify payload
    const updatedEvent = saved.withProps({ payload: '{"status": "updated"}' });
    const updated = await repository.save(updatedEvent);
    expect(updated.props.version).toBe(2);

    const fetched = await repository.findById("evt_test_occ");
    expect(fetched!.props.payload).toBe('{"status": "updated"}');
    expect(fetched!.props.version).toBe(2);
  });

  test("should throw an OCC Conflict when version mismatch occurs", async () => {
    const event = TrafficEvent.create({
      id: "evt_conflict",
      timestamp: new Date().toISOString(),
      source: "API",
      payloadType: "JSON",
      payload: '{"status": "initial"}',
      actorId: "usr_123",
      ipAddress: null,
      location: null,
      amount: null,
      currency: null,
      recipientName: null,
      recipientCountry: null
    });

    const saved1 = await repository.save(event);
    expect(saved1.props.version).toBe(1);

    // Fork event reference (simulating two concurrent updates)
    const client1Update = saved1.withProps({ payload: '{"status": "updated_by_client_1"}' });
    const client2Update = saved1.withProps({ payload: '{"status": "updated_by_client_2"}' });

    // Client 1 succeeds
    const res1 = await repository.save(client1Update);
    expect(res1.props.version).toBe(2);

    // Client 2 fails (still has version 1)
    await expect(repository.save(client2Update)).rejects.toThrow("OCC CONFLICT");
  });
});
