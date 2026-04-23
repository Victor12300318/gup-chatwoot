import axios from 'axios';
import { Connection } from '@prisma/client';
import FormData from 'form-data';

export const processGupshupMessage = async (connection: Connection, gupshupPayload: any) => {
  try {
    const customerPhone = gupshupPayload.payload.source;
    const customerName = gupshupPayload.payload.sender?.name || customerPhone;
    
    // Extrai o conteúdo da mensagem baseado no tipo (text, image, etc)
    let content = '';
    let typebotContent = ''; // Conteudo limpo para o Typebot (ex: URL direta)
    const messageType = gupshupPayload.payload.type;
    
    if (messageType === 'text') {
      content = gupshupPayload.payload.payload.text;
      typebotContent = content;
    } else if (messageType === 'button_reply' || messageType === 'list_reply' || messageType === 'quick_reply') {
      // Prioridade máxima para o valor "escondido" (postbackText ou id) para não quebrar o Typebot
      // Se o postbackText existir, usamos ele como conteúdo real da resposta
      content = gupshupPayload.payload.payload.postbackText || gupshupPayload.payload.payload.title || gupshupPayload.payload.payload.reply || '[Botão/Lista Clicado]';
      typebotContent = content;
    } else if (messageType === 'image') {
      content = `[Imagem] ${gupshupPayload.payload.payload.url}`;
      typebotContent = gupshupPayload.payload.payload.url;
    } else if (messageType === 'document') {
      content = `[Documento] ${gupshupPayload.payload.payload.url}`;
      typebotContent = gupshupPayload.payload.payload.url;
    } else {
      content = `[Mensagem tipo ${messageType}]`;
      typebotContent = content;
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
    
    // Tenta buscar conversas abertas ou pendentes deste contato neste inbox
    const conversations = await axios.get(`${baseUrl}/contacts/${contactId}/conversations`, { headers });
    const existingConversation = conversations.data.payload.find(
      (conv: any) => conv.inbox_id === connection.chatwootInboxId && (conv.status === 'open' || conv.status === 'pending')
    );

    if (existingConversation) {
      conversationId = existingConversation.id;
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
      message_type: 'incoming',
      private: false,
      source_id: gupshupPayload.payload.id // ID da mensagem no Gupshup para evitar duplicação no Chatwoot
    };

    if (content) {
      messagePayload.content = content;
    }

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
        if (content) {
          formData.append('content', content);
        }
        formData.append('message_type', 'incoming');
        if (gupshupPayload.payload.id) {
          formData.append('source_id', gupshupPayload.payload.id);
        }
        
        // No Node.js com a biblioteca form-data:
        formData.append('attachments[]', buffer, {
          filename: fileName,
          contentType: contentType as string
        });

        await axios.post(messageUrl, formData, {
          headers: {
            ...headers,
            ...formData.getHeaders()
          }
        });
        console.log(`Mensagem com anexo enviada ao Chatwoot!`);
      } catch (mediaError) {
        console.error('Erro ao processar anexo, enviando como texto apenas:', mediaError);
        
        // Remove attachments if media processing fails and just send content
        if (content) {
          await axios.post(messageUrl, { ...messagePayload, content }, { headers });
        }
      }
    } else if (content) {
      await axios.post(messageUrl, messagePayload, { headers });
    }

    console.log(`Mensagem de ${customerPhone} processada com sucesso!`);
    
    // Retorna a conversationId e o status para podermos checar no fluxo do Typebot
    // Se encontramos uma conversa existente ou criamos uma nova (que nasce como 'pending' no Chatwoot via API por padrão ou 'open' dependendo da config)
    const currentStatus = existingConversation ? existingConversation.status : 'pending';
    
    return { conversationId, status: currentStatus, content: typebotContent };
  } catch (error: any) {
    console.error('Erro ao processar mensagem para o Chatwoot:', error?.response?.data || error.message);
    return null;
  }
};

export const getConversationStatus = async (connection: Connection, conversationId: number): Promise<string | null> => {
  try {
    const baseUrl = `${connection.chatwootUrl}/api/v1/accounts/${connection.chatwootAccountId}`;
    const response = await axios.get(`${baseUrl}/conversations/${conversationId}`, {
      headers: { api_access_token: connection.chatwootAccessToken }
    });
    return response.data.status;
  } catch (error) {
    console.error('Erro ao buscar status da conversa no Chatwoot:', error);
    return null;
  }
};

export const createPrivateNote = async (connection: Connection, conversationId: number, content: string) => {
  try {
    const baseUrl = `${connection.chatwootUrl}/api/v1/accounts/${connection.chatwootAccountId}`;
    await axios.post(`${baseUrl}/conversations/${conversationId}/messages`, {
      content: `🤖 [BOT]: ${content}`,
      message_type: 'outgoing',
      private: true
    }, {
      headers: { api_access_token: connection.chatwootAccessToken }
    });
  } catch (error) {
    console.error('Erro ao criar nota privada no Chatwoot:', error);
  }
};
