import { z } from 'zod';

export const CreateConnectionSchema = z.object({
  gupshupSourcePhone: z.string().min(1, 'Gupshup Source Phone is required'),
  gupshupAppName: z.string().min(1, 'Gupshup App Name is required'),
  gupshupApiKey: z.string().min(1, 'Gupshup API Key is required'),
  chatwootUrl: z.string().url('Invalid Chatwoot URL'),
  chatwootAccountId: z.union([z.string(), z.number()]).transform(val => Number(val)),
  chatwootAccessToken: z.string().min(1, 'Chatwoot Access Token is required'),
  chatwootInboxId: z.union([z.string(), z.number()]).transform(val => Number(val)).optional(),
  chatwootHmacToken: z.string().optional().nullable(),
  autoCreateInbox: z.boolean().optional(),
  typebotEnabled: z.boolean().optional(),
  typebotUrl: z.string().url('Invalid Typebot URL').optional().nullable(),
  typebotId: z.string().optional().nullable(),
  typebotToken: z.string().optional().nullable(),
});

export const UpdateConnectionSchema = CreateConnectionSchema.partial();
