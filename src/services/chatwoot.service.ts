import axios from 'axios';
import { Connection } from '@prisma/client';

export const processGupshupMessage = async (connection: Connection, gupshupPayload: any) => {
  try {
    const customerPhone = gupshupPayload.payload.source;
    const customerName = gupshupPayload.payload.sender?.name || customerPhone;
    
    // Extrai o conteúdo da mensagem baseado no tipo (text, image, etc)
    let content = '';
    const messageType = gupshupPayload.payload.type;
    
    if (messageType === 'text') {
      content = gupshupPayload.payload.payload.text;
    } else if (messageType === 'image') {
      content = `[Imagem] ${gupshupPayload.payload.payload.url}`;
    } else if (messageType === 'document') {
      content = `[Documento] ${gupshupPayload.payload.payload.url}`;
    } else {
      content = `[Mensagem tipo ${messageType}]`;
    }

    const headers = {
      api_access_token: connection.chatwootAccessToken,
      'Content-Type': 'application/json'
    };

    const baseUrl = `${connection.chatwootUrl}/api/v1/accounts/${connection.chatwootAccountId}`;

    // 1. Procurar ou criar o Contato
    let contactId: number;
    let sourceId: string;

    const contactSearch = await axios.get(`${baseUrl}/contacts/search`, {
      params: { q: customerPhone },
      headers
    });

    if (contactSearch.data.payload.length > 0) {
      const contact = contactSearch.data.payload[0];
      contactId = contact.id;
      
      // Checar se ele já tem um contact_inbox para esta caixa
      const contactInbox = contact.contact_inboxes.find((ci: any) => ci.inbox.id === connection.chatwootInboxId);
      if (contactInbox) {
        sourceId = contactInbox.source_id;
      } else {
        // Criar contact inbox
        const newContactInbox = await axios.post(`${baseUrl}/contacts/${contactId}/contact_inboxes`, {
          inbox_id: connection.chatwootInboxId,
          source_id: customerPhone // Usar telefone como source_id para facilitar
        }, { headers });
        sourceId = newContactInbox.data.source_id;
      }
    } else {
      // Criar Contato
      const createContact = await axios.post(`${baseUrl}/contacts`, {
        inbox_id: connection.chatwootInboxId,
        name: customerName,
        phone_number: `+${customerPhone.replace(/\D/g, '')}`,
        identifier: customerPhone
      }, { headers });
      
      contactId = createContact.data.payload.contact.id;
      sourceId = createContact.data.payload.contact_inbox.source_id;
    }

    // 2. Procurar ou criar Conversa
    let conversationId: number;
    
    // Tenta buscar conversas abertas deste contato neste inbox
    const conversations = await axios.get(`${baseUrl}/contacts/${contactId}/conversations`, { headers });
    const openConversation = conversations.data.payload.find(
      (conv: any) => conv.inbox_id === connection.chatwootInboxId && conv.status === 'open'
    );

    if (openConversation) {
      conversationId = openConversation.id;
    } else {
      // Criar Conversa
      const createConversation = await axios.post(`${baseUrl}/conversations`, {
        source_id: sourceId,
        inbox_id: connection.chatwootInboxId,
        contact_id: contactId
      }, { headers });
      conversationId = createConversation.data.id;
    }

    // 3. Criar a Mensagem na Conversa
    const messagePayload: any = {
      content: content,
      message_type: 'incoming',
      private: false
    };

    const messageUrl = `${baseUrl}/conversations/${conversationId}/messages`;

    // Se for uma mídia, vamos tentar enviar como anexo
    if (messageType !== 'text' && gupshupPayload.payload.payload.url) {
      try {
        const fileUrl = gupshupPayload.payload.payload.url;
        console.log(`Baixando mídia da Gupshup: ${fileUrl}`);
        
        const fileResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(fileResponse.data);
        
        // Extrair nome do arquivo da URL ou gerar um
        const fileName = fileUrl.split('/').pop() || `file_${Date.now()}`;
        const contentType = fileResponse.headers['content-type'] || 'application/octet-stream';

        const formData = new FormData();
        formData.append('content', content);
        formData.append('message_type', 'incoming');
        
        // No Node.js com Axios, para enviar arquivos via FormData:
        const blob = new Blob([buffer], { type: contentType });
        formData.append('attachments[]', blob, fileName);

        await axios.post(messageUrl, formData, {
          headers: {
            ...headers,
            'Content-Type': 'multipart/form-data'
          }
        });
        console.log(`Mensagem com anexo enviada ao Chatwoot!`);
      } catch (mediaError) {
        console.error('Erro ao processar anexo, enviando como texto apenas:', mediaError);
        await axios.post(messageUrl, messagePayload, { headers });
      }
    } else {
      await axios.post(messageUrl, messagePayload, { headers });
    }

    console.log(`Mensagem de ${customerPhone} processada com sucesso!`);
  } catch (error: any) {
    console.error('Erro ao processar mensagem para o Chatwoot:', error?.response?.data || error.message);
  }
};
