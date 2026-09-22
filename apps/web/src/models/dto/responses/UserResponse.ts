import { z } from "zod";

export const userResponseSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  email: z.string(),
  role: z.enum(["admin", "member"]),
  created_at: z.iso.datetime(),
});
export type UserResponse = z.infer<typeof userResponseSchema>;
