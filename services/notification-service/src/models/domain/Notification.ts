export class Notification {
  readonly id: number;
  readonly eventType: "task.assigned" | "task.reassigned";
  readonly taskId: number;
  readonly title: string;
  readonly occurredAt: Date;
  readonly createdAt: Date;

  constructor(properties: {
    id: number; eventType: "task.assigned" | "task.reassigned"; taskId: number;
    title: string; occurredAt: Date; createdAt: Date;
  }) {
    this.id = properties.id;
    this.eventType = properties.eventType;
    this.taskId = properties.taskId;
    this.title = properties.title;
    this.occurredAt = properties.occurredAt;
    this.createdAt = properties.createdAt;
  }
}
