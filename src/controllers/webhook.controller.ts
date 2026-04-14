import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { processGupshupMessage } from '../services/chatwoot.service';
import { processChatwootMessage } from '../services/gupshup.service';

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
        // Enviar assíncronamente para o Chatwoot
        processGupshupMessage(connection, payload).catch(err => {
          console.error('Erro ao processar mensagem Gupshup -> Chatwoot:', err);
        });
      } else {
        console.warn(`Webhook Gupshup: Conexão não encontrada para o App "${appName}". Verifique se o nome do App no conector bate com o do painel da Gupshup.`);
      }
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

    // Verificar se é uma mensagem criada por um agente (outgoing)
    if (payload.event === 'message_created' && payload.message_type === 'outgoing') {
      const inboxId = payload.inbox.id;
      console.log(`Buscando conexão para o Inbox ID Chatwoot: ${inboxId}`);

      const connection = await prisma.connection.findFirst({
        where: { chatwootInboxId: inboxId }
      });

      if (connection) {
        console.log(`Conexão encontrada para o Inbox ${inboxId}. Enviando resposta para Gupshup...`);
        // Enviar assíncronamente para a Gupshup
        processChatwootMessage(connection, payload).catch(err => {
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
