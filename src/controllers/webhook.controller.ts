import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { processGupshupMessage } from '../services/chatwoot.service';
import { processChatwootMessage } from '../services/gupshup.service';

export const handleGupshupWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    // A Gupshup as vezes envia os webhooks num array ou objeto.
    // Vamos considerar que estamos recebendo a estrutura base (Inbound Message)
    
    // Verificando se é um evento de mensagem de entrada do usuário
    if (payload.type === 'message') {
      const sourcePhone = payload.payload.destination; // O numero da Gupshup (destino do cliente é o app)
      const customerPhone = payload.payload.source; // O numero do cliente
      const messagePayload = payload.payload.payload;
      
      const connection = await prisma.connection.findUnique({
        where: { gupshupSourcePhone: sourcePhone }
      });

      if (connection) {
        // Enviar assíncronamente para o Chatwoot
        processGupshupMessage(connection, payload).catch(console.error);
      } else {
        console.warn(`Webhook Gupshup: Conexão não encontrada para o número ${sourcePhone}`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro no webhook Gupshup:', error);
    res.status(500).send('Internal Server Error');
  }
};

export const handleChatwootWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    // Verificar se é uma mensagem criada por um agente (outgoing)
    if (payload.event === 'message_created' && payload.message_type === 'outgoing') {
      const inboxId = payload.inbox.id;

      const connection = await prisma.connection.findFirst({
        where: { chatwootInboxId: inboxId }
      });

      if (connection) {
        // Enviar assíncronamente para a Gupshup
        processChatwootMessage(connection, payload).catch(console.error);
      } else {
        console.warn(`Webhook Chatwoot: Conexão não encontrada para o Inbox ID ${inboxId}`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro no webhook Chatwoot:', error);
    res.status(500).send('Internal Server Error');
  }
};
