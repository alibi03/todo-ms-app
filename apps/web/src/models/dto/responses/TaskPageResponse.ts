import { z } from "zod";
import { taskResponseSchema } from "./TaskResponse";

export const taskPageResponseSchema = z.object({
  tasks: z.array(taskResponseSchema),
  nextCursor: z.number().int().positive().nullable(),
});
export type TaskPageResponse = z.infer<typeof taskPageResponseSchema>;
