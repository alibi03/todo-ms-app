import { z } from "zod";
import { notificationResponseSchema } from "./NotificationResponse";

export const notificationPageResponseSchema = z.object({
  notifications: z.array(notificationResponseSchema),
  nextCursor: z.number().int().positive().nullable(),
});
export type NotificationPageResponse = z.infer<
  typeof notificationPageResponseSchema
>;
