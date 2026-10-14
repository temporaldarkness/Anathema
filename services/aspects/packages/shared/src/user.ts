import { z } from 'zod';

export const CurrentUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  isAdmin: z.boolean(),
});

export type CurrentUser = z.infer<typeof CurrentUserSchema>;