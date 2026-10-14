import { z } from 'zod';

export const AuditPayloadSchema = z.object({
  user_id: z.string(),
  username: z.string(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().nullable().optional(),
  details: z.record(z.unknown()).optional(),
});

export type AuditPayload = z.infer<typeof AuditPayloadSchema>;