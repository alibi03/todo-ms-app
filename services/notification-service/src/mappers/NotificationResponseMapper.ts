import type { Notification } from "../models/domain/Notification";
import type { NotificationResponse } from "../models/dto/responses/NotificationResponse";

export class NotificationResponseMapper {
  static toResponse(notification: Notification): NotificationResponse {
    return {
      id: notification.id, eventType: notification.eventType, taskId: notification.taskId,
      title: notification.title, occurredAt: notification.occurredAt.toISOString(),
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
