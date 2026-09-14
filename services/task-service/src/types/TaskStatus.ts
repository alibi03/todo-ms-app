const taskStatuses = ["pending", "in_progress", "completed"] as const;

type TaskStatus = (typeof taskStatuses)[number];

export { taskStatuses, type TaskStatus };
