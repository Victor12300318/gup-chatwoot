import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.warn('Variável REDIS_URL não definida! O processamento em filas falhará.');
}

const redisConnection = new Redis(redisUrl || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});

// Fila para mensagens vindo da Gupshup em direção ao Chatwoot
export const chatwootQueue = new Queue('chatwoot-queue', { connection: redisConnection });

// Fila para mensagens vindo do Chatwoot (ou Bot) em direção à Gupshup
export const gupshupQueue = new Queue('gupshup-queue', { connection: redisConnection });

// Fila para disparo de bots Typebot
export const typebotQueue = new Queue('typebot-queue', { connection: redisConnection });

export { redisConnection };
