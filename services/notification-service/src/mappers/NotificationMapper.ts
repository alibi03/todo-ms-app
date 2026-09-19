import type { TaskAssignmentEventDto } from "../models/dto/events/TaskAssignmentEventDto";
import { CreateNotificationModel } from "../models/domain/CreateNotificationModel";

export class NotificationMapper {
  static toCreateModel(event: TaskAssignmentEventDto): CreateNotificationModel {
    return new CreateNotificationModel({
      eventId: event.eventId, eventType: event.type, occurredAt: new Date(event.occurredAt),
      taskId: event.data.taskId, recipientUserId: event.data.recipientUserId, title: event.data.title,
    });
  }
}
