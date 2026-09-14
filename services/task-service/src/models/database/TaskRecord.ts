type TaskRecord = {
  id: number;
  title: string;
  description: string;
  status: "pending";
  owner_user_id: number;
  created_at: Date;
};

export type { TaskRecord };
