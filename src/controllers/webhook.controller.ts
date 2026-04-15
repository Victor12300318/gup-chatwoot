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
    console.log('Webhook Chatwoot recebido:', payload.event);

    // 1. Ignora notas privadas (do Bot) para evitar loop infinito
    if (payload.private === true) {
      return res.status(200).send('OK');
    }

    const isMessageCreated = payload.event === 'message_created';
    const isConversationUpdated = payload.event === 'conversation_updated';
    
    let isOutgoing = false;
    let isIncoming = false;
    let messageData = payload;

    // 2. Detectar se a mensagem é do cliente (Incoming) ou do Agente (Outgoing)
    if (isMessageCreated) {
      // message_type: 0 (incoming), 1 (outgoing)
      if (payload.message_type === 'outgoing' || payload.message_type === 1) {
        isOutgoing = true;
      } else if (payload.message_type === 'incoming' || payload.message_type === 0) {
        isIncoming = true;
      }
    } else if (isConversationUpdated && payload.messages && payload.messages.length > 0) {
      const lastMessage = payload.messages[payload.messages.length - 1];
      if (lastMessage.message_type === 1 || lastMessage.message_type === 'outgoing') {
        isOutgoing = true;
        messageData = { ...payload, ...lastMessage };
      }
    }

    // 3. Buscar Conexão baseada no Inbox ID
    const inboxId = payload.inbox_id || (payload.inbox && payload.inbox.id);
    if (!inboxId) return res.status(200).send('OK');

    const connection = await prisma.connection.findFirst({
      where: { chatwootInboxId: Number(inboxId) }
    });

    if (!connection) return res.status(200).send('OK');

    // 4. Ação: Enviar Resposta Humana para o WhatsApp (Gupshup)
    if (isOutgoing) {
      processChatwootMessage(connection, messageData).catch(err => {
        console.error('Erro ao processar mensagem Chatwoot -> Gupshup:', err);
      });
    }

    // 5. Ação: Disparar Typebot (Se for mensagem do cliente e conversa estiver Pendente)
    if (isIncoming && connection.typebotEnabled) {
      // Verificamos o status da conversa
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
          console.log(`[BOT] Acionando Typebot para ${customerPhone} na conversa ${conversationId}`);
          
          runTypebotFlow(connection, conversationId, customerPhone, messageContent).catch(err => {
            console.error('Erro no fluxo do Typebot acionado pelo Chatwoot:', err);
          });
        }
      } else {
        console.log(`[BOT] Conversa ${payload.conversation?.id} não está pendente (status: ${conversationStatus}). Ignorando bot.`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro crítico no webhook Chatwoot:', error);
    res.status(500).send('Internal Server Error');
  }
};
