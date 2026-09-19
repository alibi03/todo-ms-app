export interface TaskAssignmentEvent {
  eventId: string;
  version: 1;
  type: "task.assigned" | "task.reassigned";
  occurredAt: string;
  data: { taskId: number; recipientUserId: number; title: string };
}
