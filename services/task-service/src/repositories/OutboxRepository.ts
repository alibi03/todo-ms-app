import { randomUUID } from "node:crypto";
import type { TaskDatabase } from "../database/TaskDatabase";
import type { IOutboxRepository } from "../interfaces/repositories/IOutboxRepository";
import type { OutboxDelivery } from "../models/domain/OutboxDelivery";
import type { OutboxRecord } from "../models/database/OutboxRecord";
import { OutboxMapper } from "../mappers/OutboxMapper";

export class OutboxRepository implements IOutboxRepository {
  constructor(private readonly database: Pick<TaskDatabase, "query">) {}

  async claim(): Promise<OutboxDelivery | null> {
    const result = await this.database.query<OutboxRecord>(
      `WITH pending AS (
         SELECT event_id FROM task_outbox WHERE published_at IS NULL AND available_at <= now()
         ORDER BY occurred_at, event_id FOR UPDATE SKIP LOCKED LIMIT 1
       ) UPDATE task_outbox AS event SET lease_id = $1, attempts = attempts + 1,
         available_at = now() + interval '30 seconds'
       FROM pending WHERE event.event_id = pending.event_id RETURNING event.*`, [randomUUID()]
    );
    return result.rows[0] ? OutboxMapper.toDelivery(result.rows[0]) : null;
  }

  async markPublished(delivery: OutboxDelivery): Promise<void> {
    await this.database.query(
      "UPDATE task_outbox SET published_at = now(), lease_id = NULL WHERE event_id = $1 AND lease_id = $2",
      [delivery.event.eventId, delivery.leaseId]
    );
  }

  async retry(delivery: OutboxDelivery): Promise<void> {
    const seconds = Math.min(60, 2 ** Math.min(delivery.attempts, 6));
    await this.database.query(
      `UPDATE task_outbox SET lease_id = NULL, available_at = now() + $3 * interval '1 second'
       WHERE event_id = $1 AND lease_id = $2 AND published_at IS NULL`,
      [delivery.event.eventId, delivery.leaseId, seconds]
    );
  }
}
