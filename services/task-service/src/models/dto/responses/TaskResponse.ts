import type { TaskStatus } from "../../../types/TaskStatus";

interface TaskResponse {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  ownerUserId: number;
  assignedToUserId: number | null;
  dueDate: string | null;
  createdAt: string;
}

export type { TaskResponse };
