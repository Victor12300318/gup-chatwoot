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
      
      const connection = await prisma.connection.findFirst({
        where: { gupshupAppName: appName }
      });

      if (connection) {
        // Apenas processa a mensagem para o Chatwoot.
        // O disparo do Typebot agora é feito via Webhook do Chatwoot (Agent Bot).
        processGupshupMessage(connection, payload).catch(err => {
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
    console.log('Webhook Chatwoot (Sync) recebido:', payload.event);

    // Ignora notas privadas e mensagens do sistema
    if (payload.private === true) {
      return res.status(200).send('OK');
    }

    const isMessageCreated = payload.event === 'message_created';
    const isConversationUpdated = payload.event === 'conversation_updated';
    
    let isOutgoing = false;
    let messageData = payload;

    // Detectar se a mensagem é do Agente (Outgoing)
    if (isMessageCreated) {
      if (payload.message_type === 'outgoing' || payload.message_type === 1) {
        isOutgoing = true;
      }
    } else if (isConversationUpdated && payload.messages && payload.messages.length > 0) {
      const lastMessage = payload.messages[payload.messages.length - 1];
      if (lastMessage.message_type === 1 || lastMessage.message_type === 'outgoing') {
        isOutgoing = true;
        messageData = { ...payload, ...lastMessage };
      }
    }

    if (!isOutgoing) return res.status(200).send('OK');

    const inboxId = payload.inbox_id || (payload.inbox && payload.inbox.id);
    if (!inboxId) return res.status(200).send('OK');

    const connection = await prisma.connection.findFirst({
      where: { chatwootInboxId: Number(inboxId) }
    });

    if (connection) {
      console.log(`[SYNC] Enviando resposta humana para Gupshup: ${connection.gupshupAppName}`);
      processChatwootMessage(connection, messageData).catch(err => {
        console.error('Erro ao processar mensagem Chatwoot -> Gupshup:', err);
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro crítico no webhook Chatwoot Sync:', error);
    res.status(500).send('Internal Server Error');
  }
};

export const handleChatwootBotWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    console.log('Webhook Chatwoot (BOT) recebido:', payload.event);

    // 1. Ignora notas privadas (do prório Bot) para evitar loop infinito
    if (payload.private === true) {
      return res.status(200).send('OK');
    }

    // O Agent Bot geralmente envia apenas o evento message_created para mensagens do cliente
    if (payload.event !== 'message_created') return res.status(200).send('OK');
    
    // Só processa se for mensagem do cliente (incoming)
    if (payload.message_type !== 'incoming' && payload.message_type !== 0) return res.status(200).send('OK');

    // 2. Buscar Conexão baseada no Inbox ID
    const inboxId = payload.inbox_id || (payload.inbox && payload.inbox.id);
    if (!inboxId) return res.status(200).send('OK');

    const connection = await prisma.connection.findFirst({
      where: { chatwootInboxId: Number(inboxId) }
    });

    if (!connection || !connection.typebotEnabled) {
      console.log('[BOT] Conexão não encontrada ou bot desativado.');
      return res.status(200).send('OK');
    }

    // 3. Verificamos o status da conversa (O bot só age se estiver PENDENTE)
    const conversationStatus = payload.conversation?.status;
    
    if (conversationStatus === 'pending') {
      const conversationId = payload.conversation?.id;
      const messageContent = payload.content || '';
      
      // Extrair telefone do contato
      let customerPhone = 
        payload.meta?.sender?.phone_number || 
        payload.conversation?.meta?.sender?.phone_number ||
        payload.sender?.phone_number;

      if (customerPhone && conversationId) {
        customerPhone = customerPhone.replace(/\D/g, '');
        console.log(`[BOT] Acionando Typebot via Agent Bot para ${customerPhone} na conversa ${conversationId}`);
        
        runTypebotFlow(connection, conversationId, customerPhone, messageContent).catch(err => {
          console.error('Erro no fluxo do Typebot acionado pelo Agent Bot:', err);
        });
      }
    } else {
      console.log(`[BOT] Conversa ${payload.conversation?.id} ignorada (status: ${conversationStatus}).`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro crítico no webhook Chatwoot Bot:', error);
    res.status(500).send('Internal Server Error');
  }
};
