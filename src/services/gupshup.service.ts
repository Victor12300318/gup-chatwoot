import axios from 'axios';
import { Connection } from '@prisma/client';

export const processChatwootMessage = async (connection: Connection, chatwootPayload: any) => {
  try {
    // Tenta pegar o telefone de vários lugares possíveis no payload do Chatwoot
    let customerPhone = 
      chatwootPayload.conversation?.contact_inbox?.source_id || 
      chatwootPayload.meta?.sender?.phone_number || // Padrão no conversation_updated
      chatwootPayload.conversation?.meta?.sender?.phone_number ||
      chatwootPayload.sender?.phone_number ||
      chatwootPayload.conversation?.contact?.phone_number;

    if (!customerPhone) {
      console.error('Número de telefone do cliente não encontrado no payload do Chatwoot.');
      return;
    }

    customerPhone = customerPhone.replace(/\D/g, '');
    
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
