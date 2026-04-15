import { Router } from 'express';
import { handleGupshupWebhook, handleChatwootWebhook, handleChatwootBotWebhook } from '../controllers/webhook.controller';

const router = Router();

// Endpoint que será configurado no Gupshup Dashboard (Callback URL)
router.post('/gupshup', handleGupshupWebhook);

// Endpoint que será configurado no Chatwoot API Channel (Aba Webhooks) - Sincronização de Saída
router.post('/chatwoot', handleChatwootWebhook);

// Endpoint que será configurado no Chatwoot Agent Bot (Aba Agent Bot) - Para o Typebot
router.post('/chatwoot/bot', handleChatwootBotWebhook);

export default router;
