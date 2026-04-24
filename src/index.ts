import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import adminRoutes from './routes/admin.routes';
import webhookRoutes from './routes/webhook.routes';
import { startWorkers } from './workers/message.worker';

dotenv.config();

// Start background workers
startWorkers();

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
});
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // Webhooks can have high volume
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Rotas da API
app.use('/api/connections', apiLimiter, adminRoutes);
app.use('/webhooks', webhookLimiter, webhookRoutes);

// Healthcheck extremamente rápido para o Easypanel
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Servir os arquivos estáticos do React (Frontend)
const frontendPath = path.join(__dirname, '../public');
app.use(express.static(frontendPath));

// Fallback para o React Router funcionar (Qualquer rota não achada cai no index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Força o binding no IPv4 0.0.0.0
app.listen(Number(port), '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${port}`);
  
  // Garante que o processo não morra imediatamente
  process.send && process.send('ready');
});

// Tratamento amigável para sinais de encerramento do Docker/Easypanel
process.on('SIGTERM', () => {
  console.log('Sinal SIGTERM recebido. Encerrando servidor graciosamente...');
  process.exit(0);
});
