import type { TaskStatus } from "../../types/TaskStatus";

type TaskRecord = {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  owner_user_id: number;
  assigned_to_user_id: number | null;
  due_date: string | null;
  created_at: Date;
};

export type { TaskRecord };
