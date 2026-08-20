import { z } from "zod";

export const sessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  tokenType: z.string().default("Bearer"),
  expiresAt: z.number().int().positive(),
  subject: z.string().optional(),
  email: z.string().email().optional()
});

export type MinibotSession = z.infer<typeof sessionSchema>;
