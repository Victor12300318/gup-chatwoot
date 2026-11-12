# Especificação Técnica: Integração Direta com WhatsApp Cloud API (Meta) & Typebot

## 1. Visão Geral
Este documento especifica a implementação de uma nova modalidade de conexão no conector: **WhatsApp Cloud API (Meta)**, permitindo que caixas de entrada nativas do WhatsApp no Chatwoot utilizem o Typebot como bot de atendimento, despachando mensagens de texto, mídias e elementos interativos (botões de resposta rápida e listas) diretamente pela Graph API da Meta, enquanto registram o histórico no Chatwoot por meio de notas privadas.

## 2. Motivação e Objetivos
- O Chatwoot possui integração oficial com o WhatsApp Cloud API (Meta), mas sua API não suporta envio nativo de botões/listas interativos do Typebot.
- Com este novo fluxo:
  1. O cliente envia mensagem para o WhatsApp oficial.
  2. A Meta entrega a mensagem no Chatwoot.
  3. O Chatwoot aciona o webhook do Agent Bot para este conector.
  4. O conector aciona o fluxo no Typebot.
  5. As respostas do Typebot (incluindo botões e listas interativas) são enviadas diretamente pela Meta Graph API.
  6. Para cada mensagem enviada pelo bot, uma Nota Privada (`private: true`) é criada na conversa do Chatwoot, permitindo que os agentes humanos leiam todo o histórico sem que o Chatwoot reenvie as mensagens e gere duplicidade.

## 3. Modelo de Dados (Prisma Schema)
Atualização do modelo `Connection` no arquivo `prisma/schema.prisma`:

```prisma
model Connection {
  id                  String   @id @default(uuid())
  provider            String   @default("gupshup") // "gupshup" | "whatsapp_cloud"
  
  // Gupshup (Opcional quando provider for whatsapp_cloud)
  gupshupSourcePhone  String?
  gupshupAppName      String?
  gupshupApiKey       String?
  
  // WhatsApp Cloud API Meta (Opcional quando provider for gupshup)
  whatsappPhoneId     String?  // Meta Phone Number ID
  whatsappToken       String?  // Meta Permanent Access Token
  whatsappSourcePhone String?  // Número do WhatsApp para exibição

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
```

## 4. Validação (Zod Schema)
No arquivo `src/schemas/connection.schema.ts`:
- Adicionar campo `provider: z.enum(['gupshup', 'whatsapp_cloud']).default('gupshup')`.
- Campos condicionais:
  - Se `provider === 'gupshup'`: valida `gupshupSourcePhone`, `gupshupAppName`, `gupshupApiKey`.
  - Se `provider === 'whatsapp_cloud'`: valida `whatsappPhoneId`, `whatsappToken`, `chatwootInboxId`.

## 5. Serviço Meta Graph API (`src/services/whatsapp-cloud.service.ts`)
Implementação das chamadas para `https://graph.facebook.com/v21.0/{whatsappPhoneId}/messages` com `Authorization: Bearer {whatsappToken}`:
1. **Envio de Texto**:
   - `type: "text"`, payload com `{ body: text }`.
2. **Envio de Mídias**:
   - `type: "image" | "audio" | "video" | "document"`, payload com `{ link: url }`.
3. **Botões Interativos (Quick Reply)**:
   - Para menus de até 3 opções curtas (<= 20 caracteres):
   - `type: "interactive"`, `interactive: { type: "button", body: { text: ... }, action: { buttons: [...] } }`.
4. **Listas Interativas (Menu Picker)**:
   - Para menus com mais de 3 opções ou textos longos:
   - `type: "interactive"`, `interactive: { type: "list", body: { text: ... }, action: { button: "Ver Opções", sections: [...] } }`.

## 6. Integração no Typebot (`src/services/typebot.service.ts`)
- No método `runTypebotFlow`:
  - Verificar `connection.provider`:
    - Se `connection.provider === 'whatsapp_cloud'`:
      - Disparar mensagens e elementos interativos via `sendWhatsAppCloudMessage(...)`.
      - Registrar espelhamento no Chatwoot via `createPrivateNote(...)`.
    - Se `connection.provider === 'gupshup'`:
      - Manter fluxo existente chamando `sendGupshupMessage(...)` e `createPrivateNote(...)`.

## 7. Frontend e Painel Web (`public/index.html`)
- Modal de criação de rotas:
  - Radio button ou seletor de `Provider`: `Gupshup` ou `WhatsApp Cloud API (Meta)`.
  - Alternância dinâmica dos campos com JavaScript:
    - Oculta Gupshup e exibe campos da Meta quando selecionado WhatsApp Cloud.
- Listagem de Conexões:
  - Badge identificador (`[GUPSHUP]` ou `[META CLOUD]`).
  - Exibição do identificador principal e da URL de Webhook do Agent Bot.
