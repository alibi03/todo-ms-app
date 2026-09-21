import type { NotificationDatabase } from "../database/NotificationDatabase";
import type { INotificationRepository } from "../interfaces/repositories/INotificationRepository";
import type { CreateNotificationModel } from "../models/domain/CreateNotificationModel";
import type { Notification } from "../models/domain/Notification";
import type { NotificationRecord } from "../models/database/NotificationRecord";
import { NotificationMapper } from "../mappers/NotificationMapper";

export class NotificationRepository implements INotificationRepository {
  constructor(private readonly database: Pick<NotificationDatabase, "query">) {}

  async listByRecipient(userId: number, before: number | null, limit: number): Promise<Notification[]> {
    const result = await this.database.query<NotificationRecord>(
      `SELECT id, event_type, task_id, title, occurred_at, created_at FROM notifications
       WHERE recipient_user_id = $1 AND ($2::integer IS NULL OR id < $2)
       ORDER BY id DESC LIMIT $3`, [userId, before, limit]
    );
    return result.rows.map(NotificationMapper.toDomain);
  }

  async createOnce(notification: CreateNotificationModel): Promise<void> {
    await this.database.query(
      `INSERT INTO notifications (event_id, event_type, task_id, recipient_user_id, title, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (event_id) DO NOTHING`,
      [notification.eventId, notification.eventType, notification.taskId,
        notification.recipientUserId, notification.title, notification.occurredAt]
    );
  }
}
