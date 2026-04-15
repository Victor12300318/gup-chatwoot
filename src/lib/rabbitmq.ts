import * as amqp from 'amqplib';

let connection: any = null;
let channel: any = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

export const QUEUES = {
  GUPSHUP_INCOMING: 'gupshup_incoming_queue',
  CHATWOOT_OUTGOING: 'chatwoot_outgoing_queue'
};

export const connectRabbitMQ = async () => {
  try {
    if (!connection) {
      console.log(`Conectando ao RabbitMQ: ${RABBITMQ_URL}`);
      const conn = await amqp.connect(RABBITMQ_URL);
      connection = conn;
      
      conn.on('error', (err: any) => {
        console.error('RabbitMQ Connection Error:', err);
        connection = null;
        channel = null;
      });

      conn.on('close', () => {
        console.warn('RabbitMQ Connection Closed. Reconnecting...');
        connection = null;
        channel = null;
        setTimeout(connectRabbitMQ, 5000);
      });
    }

    if (!channel && connection) {
      const ch = await connection.createChannel();
      channel = ch;
      
      // Assert queues
      await ch.assertQueue(QUEUES.GUPSHUP_INCOMING, { durable: true });
      await ch.assertQueue(QUEUES.CHATWOOT_OUTGOING, { durable: true });
      
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
    const ch = channel;
    if (ch) {
      const buffer = Buffer.from(JSON.stringify(message));
      ch.sendToQueue(queue, buffer, { persistent: true });
      console.log(`[RABBITMQ] Mensagem publicada na fila: ${queue}`);
    } else {
      console.error(`Falha ao publicar na fila ${queue}: Canal indisponível.`);
    }
  } catch (error) {
    console.error(`Erro ao publicar mensagem na fila ${queue}:`, error);
  }
};

export const getChannel = () => channel;
