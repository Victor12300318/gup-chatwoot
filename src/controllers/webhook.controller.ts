import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { publishMessage, QUEUES } from '../lib/rabbitmq';

export const handleGupshupWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    console.log('Webhook Gupshup recebido (Enviando para a fila):', payload?.type);

    if (payload.type === 'message') {
      await publishMessage(QUEUES.GUPSHUP_INCOMING, payload);
    } else if (payload.type === 'message-event') {
      const status = payload.payload.type;
      const phone = payload.payload.destination;
      console.log(`[Status de Entrega] Cliente: ${phone} | Status: ${status.toUpperCase()}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro crítico no webhook Gupshup:', error);
    res.status(500).send('Internal Server Error');
  }
};

export const handleChatwootWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    console.log('Webhook Chatwoot recebido (Enviando para a fila):', payload.event);

    const isMessageCreated = payload.event === 'message_created';
    const isConversationUpdated = payload.event === 'conversation_updated';
    
    let isOutgoing = false;
    let messageData = payload;

    if (isMessageCreated && payload.message_type === 'outgoing') {
      isOutgoing = true;
    } else if (isConversationUpdated && payload.messages && payload.messages.length > 0) {
      const lastMessage = payload.messages[payload.messages.length - 1];
      if (lastMessage.message_type === 1 || lastMessage.message_type === 'outgoing') {
        isOutgoing = true;
        messageData = { ...payload, ...lastMessage };
      }
    }

    if (isOutgoing) {
      await publishMessage(QUEUES.CHATWOOT_OUTGOING, messageData);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro crítico no webhook Chatwoot:', error);
    res.status(500).send('Internal Server Error');
  }
};
