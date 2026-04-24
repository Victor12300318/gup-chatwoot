import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/queue';
import { processGupshupMessage } from '../services/chatwoot.service';
import { processChatwootMessage } from '../services/gupshup.service';
import { runTypebotFlow } from '../services/typebot.service';
import { prisma } from '../prisma';

export const startWorkers = () => {
  console.log('👷 Workers iniciados. Aguardando mensagens nas filas...');

  // Worker: Gupshup -> Chatwoot
  new Worker('chatwoot-queue', async (job: Job) => {
    const { connectionId, payload } = job.data;
    const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
    if (connection) {
      await processGupshupMessage(connection, payload);
    }
  }, { connection: redisConnection, concurrency: 5 });

  // Worker: Chatwoot -> Gupshup
  new Worker('gupshup-queue', async (job: Job) => {
    const { connectionId, payload } = job.data;
    const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
    if (connection) {
      await processChatwootMessage(connection, payload);
    }
  }, { connection: redisConnection, concurrency: 5 });

  // Worker: Bot Typebot
  new Worker('typebot-queue', async (job: Job) => {
    const { connectionId, conversationId, customerPhone, messageContent } = job.data;
    const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
    if (connection) {
      await runTypebotFlow(connection, conversationId, customerPhone, messageContent);
    }
  }, { connection: redisConnection, concurrency: 5 });
};
