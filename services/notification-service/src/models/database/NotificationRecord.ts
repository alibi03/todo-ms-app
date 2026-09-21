export type NotificationRecord = {
  id: number;
  event_type: "task.assigned" | "task.reassigned";
  task_id: number;
  title: string;
  occurred_at: Date;
  created_at: Date;
};
