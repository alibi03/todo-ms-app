import type { TaskStatus } from "../../types/TaskStatus";

class Task {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly ownerUserId: number;
  readonly createdAt: Date;

  constructor(id: number, title: string, description: string, status: TaskStatus, ownerUserId: number, createdAt: Date) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.status = status;
    this.ownerUserId = ownerUserId;
    this.createdAt = createdAt;
  }
}

export default Task;
