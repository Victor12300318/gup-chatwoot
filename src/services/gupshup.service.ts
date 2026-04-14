import axios from 'axios';
import { Connection } from '@prisma/client';

export const processChatwootMessage = async (connection: Connection, chatwootPayload: any) => {
  try {
    // Tenta pegar o telefone de vários lugares possíveis no payload do Chatwoot
    // Dá preferência explícita para o phone_number para evitar pegar UUIDs do source_id
    let customerPhone = 
      chatwootPayload.meta?.sender?.phone_number || // Padrão no conversation_updated
      chatwootPayload.conversation?.meta?.sender?.phone_number ||
      chatwootPayload.sender?.phone_number ||
      chatwootPayload.conversation?.contact?.phone_number ||
      chatwootPayload.conversation?.contact_inbox?.source_id;

    if (!customerPhone) {
      console.error('Número de telefone do cliente não encontrado no payload do Chatwoot.');
      return;
    }

    // Limpa o número para deixar apenas dígitos
    customerPhone = customerPhone.replace(/\D/g, '');

    // Se o telefone gerado tiver mais que 15 dígitos ou menos de 8, provavelmente é um UUID filtrado
    if (customerPhone.length > 15 || customerPhone.length < 8) {
      console.error(`O telefone extraído parece ser inválido ou um UUID: ${customerPhone}`);
      return;
    }
    
    const content = chatwootPayload.content || '';
    const attachments = chatwootPayload.attachments;

    console.log(`Preparando envio Gupshup para: ${customerPhone} via App: ${connection.gupshupAppName}`);

    // Configuração base da Gupshup
    const baseParams = {
      channel: 'whatsapp',
      source: connection.gupshupSourcePhone,
      destination: customerPhone,
      'src.name': connection.gupshupAppName,
    };

    const sendGupshup = async (messageObject: any) => {
      const params = new URLSearchParams();
      Object.entries(baseParams).forEach(([key, value]) => params.append(key, value));
      params.append('message', JSON.stringify(messageObject));

      return axios.post('https://api.gupshup.io/wa/api/v1/msg', params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'apikey': connection.gupshupApiKey
        }
      });
    };

    // 1. Se houver anexos, envia cada um
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        let type = 'file';
        if (attachment.file_type === 'image') type = 'image';
        if (attachment.file_type === 'audio') type = 'audio';
        if (attachment.file_type === 'video') type = 'video';

        const messageObject: any = {
          type: type,
          url: attachment.data_url
        };

        // Se for imagem ou arquivo e tiver legenda (caption), adicionamos
        if (content && (type === 'image' || type === 'file')) {
          messageObject.caption = content;
        }

        const res = await sendGupshup(messageObject);
        console.log(`Anexo (${type}) enviado para Gupshup:`, res.data);
      }
    } 
    // 2. Se não houver anexos, envia apenas o texto
    else if (content) {
      const messageObject = {
        type: 'text',
        text: content
      };
      const res = await sendGupshup(messageObject);
      console.log('Texto enviado para Gupshup:', res.data);
    }

    console.log(`Processamento concluído para ${customerPhone}`);
  } catch (error: any) {
    console.error('Erro ao enviar mensagem para a Gupshup:', error?.response?.data || error.message);
  }
};
