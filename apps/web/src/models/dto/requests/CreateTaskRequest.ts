export interface CreateTaskRequest {
  title: string;
  description: string;
  assignedToUserId: number | null;
  dueDate: string | null;
}
