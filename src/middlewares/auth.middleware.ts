import { Request, Response, NextFunction } from 'express';

export const requireAdminAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!process.env.ADMIN_API_KEY) {
    console.warn('WARNING: ADMIN_API_KEY is not set in environment variables. Authentication is bypassed!');
    return next();
  }

  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }

  next();
};
