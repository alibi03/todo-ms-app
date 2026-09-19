export interface OutboxRecord {
  event_id: string;
  event_type: "task.assigned" | "task.reassigned";
  task_id: number;
  recipient_user_id: number;
  title: string;
  occurred_at: Date;
  lease_id: string;
  attempts: number;
}
