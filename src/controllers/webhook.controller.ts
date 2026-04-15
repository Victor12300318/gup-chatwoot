import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { processGupshupMessage } from '../services/chatwoot.service';
import { processChatwootMessage } from '../services/gupshup.service';
import { runTypebotFlow } from '../services/typebot.service';

export const handleGupshupWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    console.log('Webhook Gupshup recebido:', JSON.stringify(payload, null, 2));

    // Verificando se é um evento de mensagem de entrada do usuário
    if (payload.type === 'message') {
      const appName = payload.app; // A Gupshup envia o nome do App na raiz
      const customerPhone = payload.payload.source; // O numero do cliente
      
      console.log(`Buscando conexão para o App: ${appName}`);
      
      const connection = await prisma.connection.findFirst({
        where: { gupshupAppName: appName }
      });

      if (connection) {
        console.log(`Conexão encontrada para ${appName}. Processando mensagem de ${customerPhone}...`);
        // Enviar para o Chatwoot e esperar o retorno
        processGupshupMessage(connection, payload).then(chatwootData => {
          if (chatwootData && chatwootData.status === 'pending' && connection.typebotEnabled) {
            console.log(`Conversa ${chatwootData.conversationId} está pendente. Iniciando Typebot...`);
            runTypebotFlow(connection, chatwootData.conversationId, customerPhone, chatwootData.content).catch(err => {
              console.error('Erro no fluxo do Typebot:', err);
            });
          }
        }).catch(err => {
          console.error('Erro ao processar mensagem Gupshup -> Chatwoot:', err);
        });
      } else {
        console.warn(`Webhook Gupshup: Conexão não encontrada para o App "${appName}". Verifique se o nome do App no conector bate com o do painel da Gupshup.`);
      }
    } else if (payload.type === 'message-event') {
      // Evento de status de mensagem (enqueued, failed, sent, delivered, read)
      const appName = payload.app;
      const status = payload.payload.type;
      const phone = payload.payload.destination;
      const messageId = payload.payload.id;
      
      console.log(`[Status de Entrega] App: ${appName} | Cliente: ${phone} | Status: ${status.toUpperCase()} | ID: ${messageId}`);
    } else {
      console.log(`Evento Gupshup ignorado (tipo: ${payload.type})`);
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
    console.log('Webhook Chatwoot recebido:', JSON.stringify(payload, null, 2));

    const isMessageCreated = payload.event === 'message_created';
    const isConversationUpdated = payload.event === 'conversation_updated';
    
    let isOutgoing = false;
    let messageData = payload;

    if (isMessageCreated && payload.message_type === 'outgoing') {
      isOutgoing = true;
    } else if (isConversationUpdated && payload.messages && payload.messages.length > 0) {
      // Pega a última mensagem do array
      const lastMessage = payload.messages[payload.messages.length - 1];
      // No Chatwoot, message_type 1 ou 'outgoing' indica mensagem do agente
      if (lastMessage.message_type === 1 || lastMessage.message_type === 'outgoing') {
        isOutgoing = true;
        // Mesclamos o payload original com os dados da mensagem específica
        messageData = { ...payload, ...lastMessage };
      }
    }

    if (isOutgoing) {
      // O ID da inbox pode vir em locais diferentes dependendo do evento
      const inboxId = payload.inbox_id || (payload.inbox && payload.inbox.id);
      
      if (!inboxId) {
        console.error('Inbox ID não encontrado no payload do Chatwoot');
        return res.status(200).send('OK');
      }

      console.log(`Buscando conexão para o Inbox ID Chatwoot: ${inboxId}`);

      const connection = await prisma.connection.findFirst({
        where: { chatwootInboxId: Number(inboxId) }
      });

      if (connection) {
        console.log(`Conexão encontrada para o Inbox ${inboxId}. Enviando para Gupshup...`);
        processChatwootMessage(connection, messageData).catch(err => {
          console.error('Erro ao processar mensagem Chatwoot -> Gupshup:', err);
        });
      } else {
        console.warn(`Webhook Chatwoot: Conexão não encontrada para o Inbox ID ${inboxId}`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro crítico no webhook Chatwoot:', error);
    res.status(500).send('Internal Server Error');
  }
};
