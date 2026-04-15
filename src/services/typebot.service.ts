import axios from 'axios';
import { Connection } from '@prisma/client';
import { prisma } from '../prisma';
import { sendGupshupMessage } from './gupshup.service';
import { createPrivateNote } from './chatwoot.service';

export interface TypebotResponse {
  sessionId?: string;
  messages?: any[];
  input?: any;
}

const getTypebotHeaders = (connection: Connection) => {
  const headers: any = { 'Content-Type': 'application/json' };
  if (connection.typebotToken) {
    headers['Authorization'] = `Bearer ${connection.typebotToken}`;
  }
  return headers;
};

export const startTypebotSession = async (connection: Connection, message: string): Promise<TypebotResponse | null> => {
  try {
    const url = `${connection.typebotUrl}/api/v1/typebots/${connection.typebotId}/startChat`;
    const payload = {
      message: { type: 'text', text: message },
      isStreamEnabled: false
    };

    const response = await axios.post(url, payload, { headers: getTypebotHeaders(connection), timeout: 30000 });
    return response.data;
  } catch (error: any) {
    console.error('Erro ao iniciar Typebot session:', error?.response?.data || error.message);
    return null;
  }
};

export const continueTypebotSession = async (connection: Connection, sessionId: string, message: string): Promise<{ response: any, data: TypebotResponse | null }> => {
  try {
    const url = `${connection.typebotUrl}/api/v1/sessions/${sessionId}/continueChat`;
    const payload = {
      message: { type: 'text', text: message }
    };

    const response = await axios.post(url, payload, { headers: getTypebotHeaders(connection), timeout: 30000 });
    return { response, data: response.data };
  } catch (error: any) {
    console.error('Erro ao continuar Typebot session:', error?.response?.data || error.message);
    return { response: error?.response, data: null };
  }
};

export const parseTypebotRichText = (richTextList: any[]): string => {
  if (!richTextList || !Array.isArray(richTextList)) return '';

  const finalText: string[] = [];

  for (const block of richTextList) {
    let blockContent = '';
    const children = block.children || [];

    for (const child of children) {
      let text = child.text || '';

      if (child.bold) text = `*${text}*`;
      if (child.italic) text = `_${text}_`;
      if (child.strikethrough) text = `~${text}~`;

      blockContent += text;
    }
    finalText.push(blockContent);
  }

  return finalText.join('\n');
};

export const runTypebotFlow = async (connection: Connection, conversationId: number, customerPhone: string, messageContent: string) => {
  if (!connection.typebotEnabled || !connection.typebotUrl || !connection.typebotId) return;

  try {
    // BUSCA SESSÃO PELO TELEFONE (Chave Única para persistência real)
    let sessionRecord = await prisma.typebotSession.findUnique({
      where: { phoneNumber: customerPhone }
    });

    let tbResponseData: TypebotResponse | null = null;

    if (sessionRecord) {
      console.log(`[SESSÃO] Usando sessão existente para ${customerPhone}: ${sessionRecord.typebotSessionId}`);
      const { response, data } = await continueTypebotSession(connection, sessionRecord.typebotSessionId, messageContent);
      
      if (response?.status === 200) {
        tbResponseData = data;
      } else if (response?.status === 404 || response?.status === 403) {
        console.warn(`[SESSÃO] Sessão expirada ou inválida para ${customerPhone}. Reiniciando...`);
        sessionRecord = null;
      } else {
        console.error(`[SESSÃO] Erro inesperado ao continuar sessão para ${customerPhone}:`, response?.status);
        return;
      }
    }

    if (!sessionRecord) {
      console.log(`[SESSÃO] Iniciando novo chat para ${customerPhone}`);
      tbResponseData = await startTypebotSession(connection, messageContent);
      if (tbResponseData && tbResponseData.sessionId) {
        const newSessionId = tbResponseData.sessionId;
        
        await prisma.typebotSession.upsert({
          where: { phoneNumber: customerPhone },
          update: { typebotSessionId: newSessionId },
          create: { phoneNumber: customerPhone, typebotSessionId: newSessionId }
        });
      }
    }

    if (!tbResponseData) return;

    const messagesQueue: any[] = [];
    const tbMessages = tbResponseData.messages || [];

    for (const msg of tbMessages) {
      const msgType = msg.type;
      
      if (msgType === 'text') {
        const richText = msg.content?.richText || [];
        const formattedText = parseTypebotRichText(richText);
        if (formattedText) {
          messagesQueue.push({ type: 'text', content: formattedText });
        }
      } else if (['audio', 'image', 'video', 'file'].includes(msgType)) {
        const url = msg.content?.url;
        if (url) messagesQueue.push({ type: msgType, content: url });
      }
    }

    const inputField = tbResponseData.input;
    let hasInput = false;
    let inputBodyText = 'Selecione uma opção:';

    if (inputField && inputField.type === 'choice input') {
      hasInput = true;
      if (messagesQueue.length > 0 && messagesQueue[messagesQueue.length - 1].type === 'text') {
        const lastMsg = messagesQueue.pop();
        inputBodyText = lastMsg.content;
      }
    }

    // Enviar mensagens acumuladas
    for (const m of messagesQueue) {
      if (m.type === 'text') {
        await sendGupshupMessage(connection, customerPhone, { type: 'text', text: m.content });
        await createPrivateNote(connection, conversationId, m.content);
      } else {
        let gupType = m.type;
        if (m.type === 'file') gupType = 'document';
        await sendGupshupMessage(connection, customerPhone, { type: gupType, url: m.content });
        await createPrivateNote(connection, conversationId, `[Mídia enviada pelo Bot: ${m.content}]`);
      }
    }

    // Enviar Interativo (Botões/Lista) se houver
    if (hasInput) {
      const items = inputField.items || [];
      const qtdItems = items.length;

      if (qtdItems > 0) {
        let interactivePayload: any = {};
        let noteContent = '';

        // Lógica Smart: Se algum item passar de 20 caracteres, forçamos o uso de LISTA
        // mesmo que tenha 3 ou menos itens.
        const anyItemTooLongForButtons = items.some((i: any) => (i.content || '').length > 20);
        const forceList = qtdItems > 3 || anyItemTooLongForButtons;

        if (!forceList) {
          // CASO 1: Botões (Quick Reply) - Máximo 3 opções e texto curto (<20)
          const options = items.map((item: any) => {
            const label = (item.content || '').substring(0, 20);
            return { type: 'text', title: label, postbackText: item.content }; // postbackText sempre completo
          });

          interactivePayload = {
            type: 'quick_reply',
            content: { type: 'text', text: inputBodyText },
            options: options
          };
          noteContent = `[Botões]: ${options.map((o: any) => o.title).join(', ')}`;
        } else {
          // CASO 2: Lista (List Message) - De 1 a 10 opções
          const options = items.slice(0, 10).map((item: any, index: number) => {
            const fullText = item.content || '';
            const needsTruncate = fullText.length > 24;
            
            return {
              title: needsTruncate ? `${index + 1}. ${fullText.substring(0, 20)}...` : fullText,
              description: needsTruncate ? fullText.substring(0, 72) : undefined,
              postbackText: fullText // O Typebot receberá o texto ORIGINAL e COMPLETO
            };
          });

          interactivePayload = {
            type: 'list',
            title: 'Menu',
            body: inputBodyText.substring(0, 1024),
            msgid: `list_${Date.now()}`,
            globalButtons: [{ type: 'text', title: 'Ver Opções' }],
            items: [{ title: 'Escolha', options: options }]
          };
          noteContent = `[Lista]: ${options.map((r: any) => r.title).join(', ')}`;
        }

        await sendGupshupMessage(connection, customerPhone, interactivePayload);
        await createPrivateNote(connection, conversationId, noteContent);
      }
    }
  } catch (error) {
    console.error('Erro no fluxo principal do Typebot:', error);
  }
};
