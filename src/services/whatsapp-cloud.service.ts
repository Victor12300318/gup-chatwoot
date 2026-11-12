import axios from 'axios';
import { Connection } from '@prisma/client';

export interface WhatsAppInteractiveButton {
  id: string;
  title: string;
}

export interface WhatsAppInteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

export const sendWhatsAppCloudMessage = async (
  connection: Connection,
  toPhone: string,
  messageData: any
): Promise<boolean> => {
  if (!connection.whatsappPhoneId || !connection.whatsappToken) {
    console.error('[META] Conexão não possui whatsappPhoneId ou whatsappToken configurado.');
    return false;
  }

  // Sanitiza número: apenas números (com DDI e DDD)
  const recipient = toPhone.replace(/\D/g, '');
  const url = `https://graph.facebook.com/v21.0/${connection.whatsappPhoneId}/messages`;

  let body: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
  };

  if (messageData.type === 'text') {
    body.type = 'text';
    body.text = { preview_url: false, body: messageData.text };
  } else if (['image', 'audio', 'video', 'document'].includes(messageData.type)) {
    body.type = messageData.type;
    body[messageData.type] = {
      link: messageData.url,
      ...(messageData.caption ? { caption: messageData.caption } : {})
    };
  } else if (messageData.type === 'quick_reply') {
    // Botões de Resposta Rápida (Até 3 botões)
    const options = messageData.options || [];
    body.type = 'interactive';
    body.interactive = {
      type: 'button',
      body: { text: messageData.content?.text || 'Escolha uma opção:' },
      action: {
        buttons: options.slice(0, 3).map((opt: any, index: number) => ({
          type: 'reply',
          reply: {
            id: `btn_${index + 1}`,
            title: (opt.title || opt.postbackText || '').substring(0, 20)
          }
        }))
      }
    };
  } else if (messageData.type === 'list') {
    // Menu de Lista (Até 10 opções)
    const items = messageData.items || [];
    body.type = 'interactive';
    body.interactive = {
      type: 'list',
      header: messageData.title ? { type: 'text', text: messageData.title.substring(0, 60) } : undefined,
      body: { text: messageData.body ? messageData.body.substring(0, 1024) : 'Escolha uma das opções abaixo:' },
      action: {
        button: (messageData.buttonText || 'Ver Opções').substring(0, 20),
        sections: [
          {
            title: (messageData.sectionTitle || 'Opções').substring(0, 24),
            rows: items.slice(0, 10).map((item: any, index: number) => ({
              id: `row_${index + 1}`,
              title: (item.title || item.postbackText || '').substring(0, 24),
              description: item.description ? item.description.substring(0, 72) : undefined
            }))
          }
        ]
      }
    };
  } else {
    console.warn(`[META] Tipo de mensagem não suportado: ${messageData.type}`);
    return false;
  }

  try {
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${connection.whatsappToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });
    console.log(`[META] Mensagem enviada com sucesso para ${recipient}: ${res.data?.messages?.[0]?.id}`);
    return true;
  } catch (err: any) {
    console.error(`[META] Erro ao enviar mensagem para ${recipient}:`, err?.response?.data || err.message);
    return false;
  }
};
