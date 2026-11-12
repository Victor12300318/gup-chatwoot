# WhatsApp Cloud API (Meta) & Typebot Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar o provedor WhatsApp Cloud API (Meta) como alternativa ao Gupshup, permitindo que caixas nativas da Meta no Chatwoot usem o Typebot com botões e listas interativos enviados via Meta Graph API e espelhados no Chatwoot como notas privadas.

**Architecture:** O conector suportará múltiplos provedores via campo `provider` no modelo `Connection`. Quando o webhook do Chatwoot Agent Bot for acionado, o fluxo do Typebot verificará o provedor e, caso seja `whatsapp_cloud`, despachará textos, mídias e menus interativos pela Meta Graph API oficial (`https://graph.facebook.com/v21.0/{phone_number_id}/messages`) e criará uma nota privada na conversa do Chatwoot.

**Tech Stack:** Node.js (v20+), TypeScript, Express, Prisma ORM, PostgreSQL, Axios, Zod, Vanilla HTML/CSS/JS (Cyber/Brutalist UI).

## Global Constraints
- Nenhuma dependência externa nova necessária (utilizar `axios` e `zod` já instalados).
- Não quebrar conexões e rotas existentes da Gupshup (retrocompatibilidade 100%).
- Manter tipagem estrita no TypeScript sem erros de compilação (`tsc`).

---

### Task 1: Prisma Schema & Model Migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Connection` model com campos:
  - `provider: String @default("gupshup")`
  - `gupshupSourcePhone: String?`
  - `gupshupAppName: String?`
  - `gupshupApiKey: String?`
  - `whatsappPhoneId: String?`
  - `whatsappToken: String?`
  - `whatsappSourcePhone: String?`

- [ ] **Step 1: Atualizar `prisma/schema.prisma`**

Editar `prisma/schema.prisma`:
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Connection {
  id                  String   @id @default(uuid())
  provider            String   @default("gupshup") // "gupshup" | "whatsapp_cloud"
  
  // Gupshup
  gupshupSourcePhone  String?
  gupshupAppName      String?
  gupshupApiKey       String?
  
  // WhatsApp Cloud API (Meta)
  whatsappPhoneId     String?
  whatsappToken       String?
  whatsappSourcePhone String?

  // Chatwoot
  chatwootUrl         String
  chatwootAccountId   Int
  chatwootInboxId     Int
  chatwootAccessToken String
  chatwootHmacToken   String?

  // Typebot
  typebotEnabled      Boolean  @default(false)
  typebotUrl          String?
  typebotId           String?
  typebotToken        String?

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model TypebotSession {
  id                     String   @id @default(uuid())
  phoneNumber            String   @unique
  typebotSessionId       String
  updatedAt              DateTime @updatedAt
}
```

- [ ] **Step 2: Gerar novo Prisma Client**

Executar: `npx prisma generate`
Esperado: `✔ Generated Prisma Client` com exit code 0.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(prisma): add whatsapp cloud api fields and make gupshup fields optional"
```

---

### Task 2: Zod Validation Schema & Admin Controller

**Files:**
- Modify: `src/schemas/connection.schema.ts`
- Modify: `src/controllers/admin.controller.ts`

**Interfaces:**
- Consumes: `Connection` do `@prisma/client`
- Produces: `CreateConnectionSchema` com validação condicional para `gupshup` e `whatsapp_cloud`.

- [ ] **Step 1: Atualizar `src/schemas/connection.schema.ts`**

Implementar schema com validação condicional (superRefine):
```typescript
import { z } from 'zod';

export const CreateConnectionSchema = z.object({
  provider: z.enum(['gupshup', 'whatsapp_cloud']).default('gupshup'),
  
  // Gupshup
  gupshupSourcePhone: z.string().optional().nullable(),
  gupshupAppName: z.string().optional().nullable(),
  gupshupApiKey: z.string().optional().nullable(),

  // WhatsApp Cloud API
  whatsappPhoneId: z.string().optional().nullable(),
  whatsappToken: z.string().optional().nullable(),
  whatsappSourcePhone: z.string().optional().nullable(),

  // Chatwoot
  chatwootUrl: z.string().url('Invalid Chatwoot URL'),
  chatwootAccountId: z.union([z.string(), z.number()]).transform(val => Number(val)),
  chatwootAccessToken: z.string().min(1, 'Chatwoot Access Token is required'),
  chatwootInboxId: z.union([z.string(), z.number()]).transform(val => Number(val)).optional(),
  chatwootHmacToken: z.string().optional().nullable(),
  autoCreateInbox: z.boolean().optional(),

  // Typebot
  typebotEnabled: z.boolean().optional(),
  typebotUrl: z.string().url('Invalid Typebot URL').optional().nullable(),
  typebotId: z.string().optional().nullable(),
  typebotToken: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.provider === 'gupshup') {
    if (!data.gupshupSourcePhone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Gupshup Source Phone is required', path: ['gupshupSourcePhone'] });
    }
    if (!data.gupshupAppName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Gupshup App Name is required', path: ['gupshupAppName'] });
    }
    if (!data.gupshupApiKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Gupshup API Key is required', path: ['gupshupApiKey'] });
    }
  } else if (data.provider === 'whatsapp_cloud') {
    if (!data.whatsappPhoneId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Meta Phone Number ID is required', path: ['whatsappPhoneId'] });
    }
    if (!data.whatsappToken) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Meta Access Token is required', path: ['whatsappToken'] });
    }
    if (!data.chatwootInboxId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Chatwoot Inbox ID is required for WhatsApp Cloud API', path: ['chatwootInboxId'] });
    }
  }
});

export const UpdateConnectionSchema = CreateConnectionSchema.partial();
```

- [ ] **Step 2: Atualizar `src/controllers/admin.controller.ts`**

Ajustar `createConnection` e `updateConnection` para salvar `provider`, `whatsappPhoneId`, `whatsappToken` e `whatsappSourcePhone`, além de ignorar `autoCreateInbox` quando for `whatsapp_cloud`:
```typescript
// No createConnection:
const provider = data.provider || 'gupshup';
let chatwootInboxId = data.chatwootInboxId;

if (provider === 'gupshup' && data.autoCreateInbox) {
  // auto-criação atual
}

const newConnection = await prisma.connection.create({
  data: {
    provider,
    gupshupSourcePhone: data.gupshupSourcePhone || null,
    gupshupAppName: data.gupshupAppName || null,
    gupshupApiKey: data.gupshupApiKey || null,
    whatsappPhoneId: data.whatsappPhoneId || null,
    whatsappToken: data.whatsappToken || null,
    whatsappSourcePhone: data.whatsappSourcePhone || null,
    chatwootUrl: data.chatwootUrl,
    chatwootAccountId: Number(data.chatwootAccountId),
    chatwootInboxId: Number(chatwootInboxId),
    chatwootAccessToken: data.chatwootAccessToken,
    chatwootHmacToken: data.chatwootHmacToken || null,
    typebotEnabled: Boolean(data.typebotEnabled),
    typebotUrl: data.typebotUrl || null,
    typebotId: data.typebotId || null,
    typebotToken: data.typebotToken || null,
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/schemas/connection.schema.ts src/controllers/admin.controller.ts
git commit -m "feat(api): add whatsapp cloud validation and connection controller support"
```

---

### Task 3: Meta WhatsApp Cloud API Service

**Files:**
- Create: `src/services/whatsapp-cloud.service.ts`

**Interfaces:**
- Produces: `sendWhatsAppCloudMessage(connection: Connection, toPhone: string, payload: any): Promise<boolean>`

- [ ] **Step 1: Criar `src/services/whatsapp-cloud.service.ts`**

Implementar métodos para envio de texto, mídia (image, audio, video, document) e mensagens interativas (buttons/quick reply e list) usando `https://graph.facebook.com/v21.0/{phone_number_id}/messages`:

```typescript
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
```

- [ ] **Step 2: Verificar compilação**

Executar: `npm run build`
Esperado: Exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/whatsapp-cloud.service.ts
git commit -m "feat(meta): implement whatsapp cloud api service with interactive buttons and lists"
```

---

### Task 4: Typebot Dispatcher Integration

**Files:**
- Modify: `src/services/typebot.service.ts`

**Interfaces:**
- Consumes: `sendWhatsAppCloudMessage` de `src/services/whatsapp-cloud.service.ts`
- Consumes: `sendGupshupMessage` de `src/services/gupshup.service.ts`

- [ ] **Step 1: Atualizar `runTypebotFlow` em `src/services/typebot.service.ts`**

Importar `sendWhatsAppCloudMessage` e rotear o envio de mensagens:
```typescript
import { sendWhatsAppCloudMessage } from './whatsapp-cloud.service';

// Na hora de enviar mensagens acumuladas:
for (const m of messagesQueue) {
  if (connection.provider === 'whatsapp_cloud') {
    if (m.type === 'text') {
      await sendWhatsAppCloudMessage(connection, customerPhone, { type: 'text', text: m.content });
      await createPrivateNote(connection, conversationId, m.content);
    } else {
      let mediaType = m.type;
      if (m.type === 'file') mediaType = 'document';
      await sendWhatsAppCloudMessage(connection, customerPhone, { type: mediaType, url: m.content });
      await createPrivateNote(connection, conversationId, `[Mídia enviada pelo Bot: ${m.content}]`);
    }
  } else {
    // Gupshup original
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
}

// Na hora de enviar mensagens interativas (botões/listas):
if (hasInput) {
  // Se for whatsapp_cloud:
  if (connection.provider === 'whatsapp_cloud') {
    if (!forceList) {
      const options = items.map((item: any) => ({
        title: (item.content || '').substring(0, 20),
        postbackText: item.content
      }));
      await sendWhatsAppCloudMessage(connection, customerPhone, {
        type: 'quick_reply',
        content: { text: inputBodyText },
        options
      });
      await createPrivateNote(connection, conversationId, `[Botões]: ${options.map((o: any) => o.title).join(', ')}`);
    } else {
      const rows = items.slice(0, 10).map((item: any, index: number) => ({
        title: (item.content || '').substring(0, 24),
        description: (item.content || '').length > 24 ? (item.content || '').substring(0, 72) : undefined,
        postbackText: item.content
      }));
      await sendWhatsAppCloudMessage(connection, customerPhone, {
        type: 'list',
        title: 'Menu',
        body: inputBodyText,
        buttonText: 'Ver Opções',
        sectionTitle: 'Escolha',
        items: rows
      });
      await createPrivateNote(connection, conversationId, `[Lista]: ${rows.map((r: any) => r.title).join(', ')}`);
    }
  } else {
    // Gupshup original
    // ...
  }
}
```

- [ ] **Step 2: Verificar compilação**

Executar: `npm run build`
Esperado: Exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/typebot.service.ts
git commit -m "feat(typebot): dispatch to whatsapp cloud api with private notes when provider is whatsapp_cloud"
```

---

### Task 5: Frontend UI & Connections Dashboard

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Adicionar seletor de Provider e campos da Meta no formulário modal**

Editar `public/index.html`:
- Adicionar no topo do form:
  ```html
  <div class="form-group">
    <label>Provider</label>
    <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
      <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: var(--text-main);">
        <input type="radio" name="provider" value="gupshup" checked onchange="toggleProviderFields()"> Gupshup
      </label>
      <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: var(--text-main);">
        <input type="radio" name="provider" value="whatsapp_cloud" onchange="toggleProviderFields()"> WhatsApp Cloud API (Meta)
      </label>
    </div>
  </div>
  ```
- Separar grupos `#gupshupFields` e `#metaFields`.
- Em `#metaFields`:
  - `Meta Phone Number ID` (required quando whatsapp_cloud)
  - `Meta Access Token` (required quando whatsapp_cloud)
  - `WhatsApp Phone Number` (opcional/identificador)
- No grid de cards:
  - Exibir tag com estilo: `[GUPSHUP]` ou `[META CLOUD]`.
  - Exibir a URL do Webhook do Agent Bot para o Chatwoot: `https://seu-dominio/webhooks/chatwoot/bot`.

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat(ui): add provider switch, whatsapp cloud fields, and agent bot webhook helper"
```

---

### Task 6: Final Verification, Build & Push

- [ ] **Step 1: Compilar TypeScript**

Executar: `npm run build`
Esperado: Exit code 0, sem erros.

- [ ] **Step 2: Push para a branch `main`**

Executar: `git push origin main`
Esperado: Push concluído com sucesso.
