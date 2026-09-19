export class CreateNotificationModel {
  readonly eventId: string;
  readonly eventType: "task.assigned" | "task.reassigned";
  readonly taskId: number;
  readonly recipientUserId: number;
  readonly title: string;
  readonly occurredAt: Date;

  constructor(properties: {
    eventId: string; eventType: "task.assigned" | "task.reassigned"; taskId: number;
    recipientUserId: number; title: string; occurredAt: Date;
  }) {
    this.eventId = properties.eventId;
    this.eventType = properties.eventType;
    this.taskId = properties.taskId;
    this.recipientUserId = properties.recipientUserId;
    this.title = properties.title;
    this.occurredAt = properties.occurredAt;
  }
}
