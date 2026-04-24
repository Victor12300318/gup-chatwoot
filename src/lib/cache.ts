import NodeCache from 'node-cache';
import { prisma } from '../prisma';

// Cache válido por 1 hora
const cache = new NodeCache({ stdTTL: 3600 });

export const getCachedConnectionByApp = async (appName: string) => {
  const cacheKey = `conn_app_${appName}`;
  let connection = cache.get(cacheKey);

  if (!connection) {
    connection = await prisma.connection.findFirst({
      where: { gupshupAppName: appName }
    });
    if (connection) {
      cache.set(cacheKey, connection);
    }
  }

  return connection as any;
};

export const getCachedConnectionByInbox = async (inboxId: number) => {
  const cacheKey = `conn_inbox_${inboxId}`;
  let connection = cache.get(cacheKey);

  if (!connection) {
    connection = await prisma.connection.findFirst({
      where: { chatwootInboxId: inboxId }
    });
    if (connection) {
      cache.set(cacheKey, connection);
    }
  }

  return connection as any;
};

export const getCachedConnectionById = async (id: string) => {
  const cacheKey = `conn_id_${id}`;
  let connection = cache.get(cacheKey);

  if (!connection) {
    connection = await prisma.connection.findUnique({
      where: { id }
    });
    if (connection) {
      cache.set(cacheKey, connection);
    }
  }

  return connection as any;
};

export const clearConnectionCache = () => {
  cache.flushAll();
};
