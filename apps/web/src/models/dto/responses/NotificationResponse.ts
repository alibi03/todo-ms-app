import { z } from "zod";

export const notificationResponseSchema = z.object({
  id: z.number().int().positive(),
  eventType: z.enum(["task.assigned", "task.reassigned"]),
  taskId: z.number().int().positive(),
  title: z.string(),
  occurredAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;
