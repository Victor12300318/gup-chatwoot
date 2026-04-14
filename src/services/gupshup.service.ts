import axios from 'axios';
import { Connection } from '@prisma/client';

export const processChatwootMessage = async (connection: Connection, chatwootPayload: any) => {
  try {
    const customerPhone = chatwootPayload.sender?.phone_number?.replace(/\D/g, ''); // Limpa o número
    
    if (!customerPhone) {
      console.error('Número de telefone do cliente não encontrado no payload do Chatwoot.');
      return;
    }

    const content = chatwootPayload.content;

    // Se a mensagem for nula (pode ser um anexo sem texto, tratar depois)
    if (!content) {
      console.warn('Mensagem do Chatwoot sem conteúdo (possível anexo), não enviada.');
      return;
    }

    // Prepara payload no formato URL Encoded esperado pela Gupshup
    const params = new URLSearchParams();
    params.append('channel', 'whatsapp');
    params.append('source', connection.gupshupSourcePhone);
    params.append('destination', customerPhone);
    params.append('src.name', connection.gupshupAppName);
    
    // Objeto message do Gupshup
    const messageObject = {
      type: 'text',
      text: content
    };
    params.append('message', JSON.stringify(messageObject));

    await axios.post('https://api.gupshup.io/wa/api/v1/msg', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apikey': connection.gupshupApiKey
      }
    });

    console.log(`Mensagem enviada do Chatwoot para a Gupshup (destino: ${customerPhone}) com sucesso!`);
  } catch (error: any) {
    console.error('Erro ao enviar mensagem para a Gupshup:', error?.response?.data || error.message);
  }
};
