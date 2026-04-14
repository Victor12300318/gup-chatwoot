import { Router } from 'express';
import { handleGupshupWebhook, handleChatwootWebhook } from '../controllers/webhook.controller';

const router = Router();

// Endpoint que será configurado no Gupshup Dashboard (Callback URL)
router.post('/gupshup', handleGupshupWebhook);

// Endpoint que será configurado no Chatwoot API Channel (Callback URL)
router.post('/chatwoot', handleChatwootWebhook);

export default router;
