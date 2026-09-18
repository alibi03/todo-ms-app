import type { TaskStatus } from "../../types/TaskStatus";

export interface TaskProperties {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly ownerUserId: number;
  readonly assignedToUserId: number | null;
  readonly dueDate: string | null;
  readonly createdAt: Date;
}
