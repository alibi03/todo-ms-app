export type NotificationResponse = {
  id: number;
  eventType: "task.assigned" | "task.reassigned";
  taskId: number;
  title: string;
  occurredAt: string;
  createdAt: string;
};
