import type { OutboxRecord } from "../models/database/OutboxRecord";
import type { OutboxDelivery } from "../models/domain/OutboxDelivery";

export class OutboxMapper {
  static toDelivery(row: OutboxRecord): OutboxDelivery {
    return {
      leaseId: row.lease_id, attempts: row.attempts,
      event: {
        eventId: row.event_id, version: 1, type: row.event_type,
        occurredAt: row.occurred_at.toISOString(),
        data: { taskId: row.task_id, recipientUserId: row.recipient_user_id, title: row.title },
      },
    };
  }
}
