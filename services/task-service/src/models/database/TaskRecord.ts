import type { TaskStatus } from "../../types/TaskStatus";

type TaskRecord = {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  owner_user_id: number;
  created_at: Date;
};

export type { TaskRecord };
