import type { TaskResponse } from "./TaskResponse";

interface ListTasksResponse {
  tasks: TaskResponse[];
  nextCursor: number | null;
}

export type { ListTasksResponse };
