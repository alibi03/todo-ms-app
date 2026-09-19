import type { NotificationDatabase } from "../database/NotificationDatabase";
import type { INotificationRepository } from "../interfaces/repositories/INotificationRepository";
import type { CreateNotificationModel } from "../models/domain/CreateNotificationModel";

export class NotificationRepository implements INotificationRepository {
  constructor(private readonly database: Pick<NotificationDatabase, "query">) {}

  async createOnce(notification: CreateNotificationModel): Promise<void> {
    await this.database.query(
      `INSERT INTO notifications (event_id, event_type, task_id, recipient_user_id, title, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (event_id) DO NOTHING`,
      [notification.eventId, notification.eventType, notification.taskId,
        notification.recipientUserId, notification.title, notification.occurredAt]
    );
  }
}
