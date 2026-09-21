import type { TaskAssignmentEventDto } from "../models/dto/events/TaskAssignmentEventDto";
import { CreateNotificationModel } from "../models/domain/CreateNotificationModel";
import type { NotificationRecord } from "../models/database/NotificationRecord";
import { Notification } from "../models/domain/Notification";

export class NotificationMapper {
  static toDomain(row: NotificationRecord): Notification {
    return new Notification({
      id: row.id, eventType: row.event_type, taskId: row.task_id,
      title: row.title, occurredAt: row.occurred_at, createdAt: row.created_at,
    });
  }

  static toCreateModel(event: TaskAssignmentEventDto): CreateNotificationModel {
    return new CreateNotificationModel({
      eventId: event.eventId, eventType: event.type, occurredAt: new Date(event.occurredAt),
      taskId: event.data.taskId, recipientUserId: event.data.recipientUserId, title: event.data.title,
    });
  }
}
