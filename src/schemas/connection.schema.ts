import { z } from 'zod';

export const CreateConnectionSchema = z.object({
  provider: z.enum(['gupshup', 'whatsapp_cloud']).default('gupshup'),
  
  // Gupshup
  gupshupSourcePhone: z.string().optional().nullable(),
  gupshupAppName: z.string().optional().nullable(),
  gupshupApiKey: z.string().optional().nullable(),

  // WhatsApp Cloud API
  whatsappPhoneId: z.string().optional().nullable(),
  whatsappToken: z.string().optional().nullable(),
  whatsappSourcePhone: z.string().optional().nullable(),

  // Chatwoot
  chatwootUrl: z.string().url('Invalid Chatwoot URL'),
  chatwootAccountId: z.union([z.string(), z.number()]).transform(val => Number(val)),
  chatwootAccessToken: z.string().min(1, 'Chatwoot Access Token is required'),
  chatwootInboxId: z.union([z.string(), z.number()]).transform(val => Number(val)).optional(),
  chatwootHmacToken: z.string().optional().nullable(),
  autoCreateInbox: z.boolean().optional(),

  // Typebot
  typebotEnabled: z.boolean().optional(),
  typebotUrl: z.string().url('Invalid Typebot URL').optional().nullable(),
  typebotId: z.string().optional().nullable(),
  typebotToken: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.provider === 'gupshup') {
    if (!data.gupshupSourcePhone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Gupshup Source Phone is required', path: ['gupshupSourcePhone'] });
    }
    if (!data.gupshupAppName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Gupshup App Name is required', path: ['gupshupAppName'] });
    }
    if (!data.gupshupApiKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Gupshup API Key is required', path: ['gupshupApiKey'] });
    }
  } else if (data.provider === 'whatsapp_cloud') {
    if (!data.whatsappPhoneId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Meta Phone Number ID is required', path: ['whatsappPhoneId'] });
    }
    if (!data.whatsappToken) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Meta Access Token is required', path: ['whatsappToken'] });
    }
    if (!data.chatwootInboxId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Chatwoot Inbox ID is required for WhatsApp Cloud API', path: ['chatwootInboxId'] });
    }
  }
});

export const UpdateConnectionSchema = z.object({
  provider: z.enum(['gupshup', 'whatsapp_cloud']).optional(),
  gupshupSourcePhone: z.string().optional().nullable(),
  gupshupAppName: z.string().optional().nullable(),
  gupshupApiKey: z.string().optional().nullable(),
  whatsappPhoneId: z.string().optional().nullable(),
  whatsappToken: z.string().optional().nullable(),
  whatsappSourcePhone: z.string().optional().nullable(),
  chatwootUrl: z.string().url('Invalid Chatwoot URL').optional(),
  chatwootAccountId: z.union([z.string(), z.number()]).transform(val => Number(val)).optional(),
  chatwootAccessToken: z.string().min(1, 'Chatwoot Access Token is required').optional(),
  chatwootInboxId: z.union([z.string(), z.number()]).transform(val => Number(val)).optional(),
  chatwootHmacToken: z.string().optional().nullable(),
  autoCreateInbox: z.boolean().optional(),
  typebotEnabled: z.boolean().optional(),
  typebotUrl: z.string().url('Invalid Typebot URL').optional().nullable(),
  typebotId: z.string().optional().nullable(),
  typebotToken: z.string().optional().nullable(),
});
