import { z } from "zod";
import { taskStatusSchema } from "../../TaskStatus";

export const taskResponseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  status: taskStatusSchema,
  ownerUserId: z.number().int().positive(),
  assignedToUserId: z.number().int().positive().nullable(),
  dueDate: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
});
export type TaskResponse = z.infer<typeof taskResponseSchema>;
