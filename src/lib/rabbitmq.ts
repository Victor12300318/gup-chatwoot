import * as amqp from 'amqplib';
import { Connection, Channel } from 'amqplib';

let connection: Connection | null = null;
let channel: Channel | null = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

export const QUEUES = {
  GUPSHUP_INCOMING: 'gupshup_incoming_queue',
  CHATWOOT_OUTGOING: 'chatwoot_outgoing_queue'
};

export const connectRabbitMQ = async () => {
  try {
    if (!connection) {
      console.log(`Conectando ao RabbitMQ: ${RABBITMQ_URL}`);
      connection = await amqp.connect(RABBITMQ_URL);
      
      connection.on('error', (err) => {
        console.error('RabbitMQ Connection Error:', err);
        connection = null;
        channel = null;
      });

      connection.on('close', () => {
        console.warn('RabbitMQ Connection Closed. Reconnecting...');
        connection = null;
        channel = null;
        setTimeout(connectRabbitMQ, 5000);
      });
    }

    if (!channel && connection) {
      channel = await connection.createChannel();
      
      // Assert queues
      await channel.assertQueue(QUEUES.GUPSHUP_INCOMING, { durable: true });
      await channel.assertQueue(QUEUES.CHATWOOT_OUTGOING, { durable: true });
      
      console.log('RabbitMQ Conectado e Filas configuradas com sucesso.');
    }
  } catch (error) {
    console.error('Erro crítico ao conectar no RabbitMQ:', error);
    setTimeout(connectRabbitMQ, 5000);
  }
};

export const publishMessage = async (queue: string, message: any) => {
  try {
    if (!channel) await connectRabbitMQ();
    if (channel) {
      const buffer = Buffer.from(JSON.stringify(message));
      channel.sendToQueue(queue, buffer, { persistent: true });
    } else {
      console.error(`Falha ao publicar na fila ${queue}: Canal indisponível.`);
    }
  } catch (error) {
    console.error(`Erro ao publicar mensagem na fila ${queue}:`, error);
  }
};

export const getChannel = () => channel;
