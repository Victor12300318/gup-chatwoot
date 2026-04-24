import { Request, Response } from 'express';
import crypto from 'crypto';
import { chatwootQueue, gupshupQueue, typebotQueue } from '../lib/queue';
import { getCachedConnectionByApp, getCachedConnectionByInbox } from '../lib/cache';

export const handleGupshupWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    console.log('Webhook Gupshup recebido:', payload?.type);

    if (payload.type === 'message') {
      const appName = payload.app;
      
      const connection = await getCachedConnectionByApp(appName);

      if (connection) {
        // Apenas adiciona a mensagem na fila para o Chatwoot.
        chatwootQueue.add('process-gupshup', {
          connectionId: connection.id,
          payload
        }, {
          removeOnComplete: true,
          removeOnFail: false
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

    // 1. REGRAS DE FILTRO: Só processaremos criação de novas mensagens.
    // Ignoramos conversation_updated para evitar duplicação (o bug estava aqui).
    if (payload.event !== 'message_created') {
      return res.status(200).send('OK');
    }

    // 2. Detectar se a mensagem é do Agente ou do Bot (Outgoing / tipo 1)
    const isOutgoing = payload.message_type === 'outgoing' || payload.message_type === 1;
    
    if (!isOutgoing) {
      return res.status(200).send('OK');
    }

    const inboxId = payload.inbox_id || (payload.inbox && payload.inbox.id);
    if (!inboxId) return res.status(200).send('OK');

    const connection = await getCachedConnectionByInbox(Number(inboxId));

    if (connection) {
      if (connection.chatwootHmacToken) {
        const signature = req.headers['x-chatwoot-signature'] || req.headers['X-Chatwoot-Signature'];
        const rawBody = (req as any).rawBody;
        if (!signature || !rawBody) {
          console.error('[SYNC] Assinatura do webhook ausente.');
          return res.status(401).send('Unauthorized: Signature missing');
        }
        const expectedSignature = crypto
          .createHmac('sha256', connection.chatwootHmacToken)
          .update(rawBody)
          .digest('hex');
        
        if (signature !== expectedSignature) {
          console.error('[SYNC] Assinatura do webhook inválida.');
          return res.status(401).send('Unauthorized: Invalid signature');
        }
      }

      console.log(`[SYNC] Enviando resposta para Gupshup: ${connection.gupshupAppName} (Message ID: ${payload.id})`);
      gupshupQueue.add('process-chatwoot', {
        connectionId: connection.id,
        payload
      }, {
        removeOnComplete: true,
        removeOnFail: false
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

    const connection = await getCachedConnectionByInbox(Number(inboxId));

    if (!connection || !connection.typebotEnabled) {
      console.log('[BOT] Conexão não encontrada ou bot desativado.');
      return res.status(200).send('OK');
    }

    if (connection.chatwootHmacToken) {
      const signature = req.headers['x-chatwoot-signature'] || req.headers['X-Chatwoot-Signature'];
      const rawBody = (req as any).rawBody;
      if (!signature || !rawBody) {
        console.error('[BOT] Assinatura do webhook ausente.');
        return res.status(401).send('Unauthorized: Signature missing');
      }
      const expectedSignature = crypto
        .createHmac('sha256', connection.chatwootHmacToken)
        .update(rawBody)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.error('[BOT] Assinatura do webhook inválida.');
        return res.status(401).send('Unauthorized: Invalid signature');
      }
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
        
        typebotQueue.add('process-typebot', {
          connectionId: connection.id,
          conversationId,
          customerPhone,
          messageContent
        }, {
          removeOnComplete: true,
          removeOnFail: false
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
