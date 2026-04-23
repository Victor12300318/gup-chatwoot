import { Request, Response } from 'express';
import { prisma } from '../prisma';
import axios from 'axios';

export const getConnections = async (req: Request, res: Response) => {
  try {
    const connections = await prisma.connection.findMany();
    res.json(connections);
  } catch (error) {
    console.error('Error fetching connections:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getConnection = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const connection = await prisma.connection.findUnique({ where: { id } });
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    res.json(connection);
  } catch (error) {
    console.error('Error fetching connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createConnection = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    
    // Basic validation
    if (!data.gupshupSourcePhone || !data.gupshupAppName || !data.gupshupApiKey || !data.chatwootUrl || !data.chatwootAccountId || !data.chatwootAccessToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let chatwootInboxId = data.chatwootInboxId;

    // Auto-create Inbox in Chatwoot if requested
    if (data.autoCreateInbox) {
      const baseUrl = req.protocol + '://' + req.get('host');
      const webhookUrl = `${baseUrl}/webhooks/chatwoot`;

      try {
        const createInboxResponse = await axios.post(
          `${data.chatwootUrl}/api/v1/accounts/${data.chatwootAccountId}/inboxes`,
          {
            name: `Gupshup +${data.gupshupSourcePhone} (${data.gupshupAppName})`,
            channel: {
              type: 'api',
              webhook_url: webhookUrl
            }
          },
          {
            headers: {
              'api_access_token': data.chatwootAccessToken,
              'Content-Type': 'application/json'
            }
          }
        );
        chatwootInboxId = createInboxResponse.data.id;
        console.log(`Auto-created API Inbox #${chatwootInboxId} in Chatwoot successfully.`);
      } catch (inboxError: any) {
        console.error('Failed to auto-create inbox in Chatwoot:', inboxError?.response?.data || inboxError.message);
        return res.status(400).json({ error: 'Failed to auto-create inbox in Chatwoot. Check Chatwoot URL and Access Token.' });
      }
    }

    if (!chatwootInboxId) {
      return res.status(400).json({ error: 'Missing Chatwoot Inbox ID' });
    }

    const newConnection = await prisma.connection.create({
      data: {
        gupshupSourcePhone: data.gupshupSourcePhone,
        gupshupAppName: data.gupshupAppName,
        gupshupApiKey: data.gupshupApiKey,
        chatwootUrl: data.chatwootUrl,
        chatwootAccountId: Number(data.chatwootAccountId),
        chatwootInboxId: Number(chatwootInboxId),
        chatwootAccessToken: data.chatwootAccessToken,
        chatwootHmacToken: data.chatwootHmacToken,
        typebotEnabled: Boolean(data.typebotEnabled),
        typebotUrl: data.typebotUrl || null,
        typebotId: data.typebotId || null,
        typebotToken: data.typebotToken || null,
      }
    });

    res.status(201).json(newConnection);
  } catch (error) {
    console.error('Error creating connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateConnection = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const connection = await prisma.connection.update({
      where: { id },
      data: {
        gupshupSourcePhone: data.gupshupSourcePhone,
        gupshupAppName: data.gupshupAppName,
        gupshupApiKey: data.gupshupApiKey,
        chatwootUrl: data.chatwootUrl,
        chatwootAccountId: Number(data.chatwootAccountId),
        chatwootInboxId: Number(data.chatwootInboxId),
        chatwootAccessToken: data.chatwootAccessToken,
        chatwootHmacToken: data.chatwootHmacToken,
        typebotEnabled: Boolean(data.typebotEnabled),
        typebotUrl: data.typebotUrl || null,
        typebotId: data.typebotId || null,
        typebotToken: data.typebotToken || null,
      }
    });
    res.json(connection);
  } catch (error) {
    console.error('Error updating connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteConnection = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.connection.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
