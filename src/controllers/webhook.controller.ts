import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { processGupshupMessage } from '../services/chatwoot.service';
import { processChatwootMessage } from '../services/gupshup.service';
import { runTypebotFlow } from '../services/typebot.service';

export const handleGupshupWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    console.log('Webhook Gupshup recebido:', payload?.type);

    if (payload.type === 'message') {
      const appName = payload.app;
      const customerPhone = payload.payload.source;
      
      const connection = await prisma.connection.findFirst({
        where: { gupshupAppName: appName }
      });

      if (connection) {
        processGupshupMessage(connection, payload).then(chatwootData => {
          if (chatwootData && chatwootData.status === 'pending' && connection.typebotEnabled) {
            runTypebotFlow(connection, chatwootData.conversationId, customerPhone, chatwootData.content).catch(err => {
              console.error('Erro no fluxo do Typebot:', err);
            });
          }
        }).catch(err => {
          console.error('Erro ao processar mensagem Gupshup -> Chatwoot:', err);
        });
      }
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
    console.log('Webhook Chatwoot recebido:', payload.event);

    const isMessageCreated = payload.event === 'message_created';
    const isConversationUpdated = payload.event === 'conversation_updated';
    
    let isOutgoing = false;
    let messageData = payload;

    if (isMessageCreated && (payload.message_type === 'outgoing' || payload.message_type === 1)) {
      isOutgoing = true;
    } else if (isConversationUpdated && payload.messages && payload.messages.length > 0) {
      const lastMessage = payload.messages[payload.messages.length - 1];
      if (lastMessage.message_type === 1 || lastMessage.message_type === 'outgoing') {
        isOutgoing = true;
        messageData = { ...payload, ...lastMessage };
      }
    }

    if (isOutgoing) {
      const inboxId = payload.inbox_id || (payload.inbox && payload.inbox.id);
      
      if (inboxId) {
        const connection = await prisma.connection.findFirst({
          where: { chatwootInboxId: Number(inboxId) }
        });

        if (connection) {
          processChatwootMessage(connection, messageData).catch(err => {
            console.error('Erro ao processar mensagem Chatwoot -> Gupshup:', err);
          });
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro crítico no webhook Chatwoot:', error);
    res.status(500).send('Internal Server Error');
  }
};
