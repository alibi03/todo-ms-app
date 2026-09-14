interface TaskResponse {
  id: number;
  title: string;
  description: string;
  status: "pending";
  ownerUserId: number;
  createdAt: string;
}

export type { TaskResponse };
