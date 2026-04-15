import { getChannel, connectRabbitMQ, QUEUES } from '../lib/rabbitmq';
import { prisma } from '../prisma';
import { processGupshupMessage } from '../services/chatwoot.service';
import { processChatwootMessage } from '../services/gupshup.service';
import { runTypebotFlow } from '../services/typebot.service';

export const startWorker = async () => {
  try {
    await connectRabbitMQ();
    const channel = getChannel();

    if (!channel) {
      console.error('RabbitMQ Channel não está disponível. Retentando em 5 segundos...');
      setTimeout(startWorker, 5000);
      return;
    }

    console.log('Worker iniciado. Aguardando mensagens nas filas...');

    // Consumir fila Gupshup (Entrada)
    channel.consume(QUEUES.GUPSHUP_INCOMING, async (msg: any) => {
      if (msg !== null) {
        try {
          const payload = JSON.parse(msg.content.toString());
          const appName = payload.app;
          const customerPhone = payload.payload.source;

          console.log(`[WORKER] Processando mensagem Gupshup de ${customerPhone} para o App ${appName}...`);

          const connection = await prisma.connection.findFirst({
            where: { gupshupAppName: appName }
          });

          if (connection) {
            const chatwootData = await processGupshupMessage(connection, payload);
            
            if (chatwootData && chatwootData.status === 'pending' && connection.typebotEnabled) {
              console.log(`[WORKER] Conversa ${chatwootData.conversationId} pendente. Acionando Typebot...`);
              await runTypebotFlow(connection, chatwootData.conversationId, customerPhone, chatwootData.content);
            }
          } else {
            console.warn(`[WORKER] Conexão não encontrada para o App "${appName}".`);
          }

          // Acknowledge apenas se processou com sucesso (ou se tratou o erro esperado)
          channel.ack(msg);
        } catch (error) {
          console.error('[WORKER] Erro ao processar mensagem Gupshup:', error);
          // Rejeita a mensagem para a fila (re-queue) para tentar de novo
          channel.nack(msg, false, true); 
        }
      }
    });

    // Consumir fila Chatwoot (Saída)
    channel.consume(QUEUES.CHATWOOT_OUTGOING, async (msg: any) => {
      if (msg !== null) {
        try {
          console.log('[WORKER] Mensagem retirada da fila Chatwoot (Saída).');
          const payload = JSON.parse(msg.content.toString());
          const inboxId = payload.inbox_id || (payload.inbox && payload.inbox.id);

          console.log(`[WORKER] Processando mensagem Chatwoot do Inbox ${inboxId}...`);

          if (inboxId) {
            const connection = await prisma.connection.findFirst({
              where: { chatwootInboxId: Number(inboxId) }
            });

            if (connection) {
              await processChatwootMessage(connection, payload);
            } else {
              console.warn(`[WORKER] Conexão não encontrada para o Inbox ID ${inboxId}`);
            }
          }

          channel.ack(msg);
        } catch (error) {
          console.error('[WORKER] Erro ao processar mensagem Chatwoot:', error);
          channel.nack(msg, false, true);
        }
      }
    });

  } catch (error) {
    console.error('Erro ao iniciar worker:', error);
    setTimeout(startWorker, 5000);
  }
};
