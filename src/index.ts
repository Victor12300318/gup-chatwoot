import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import adminRoutes from './routes/admin.routes';
import webhookRoutes from './routes/webhook.routes';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Rotas da API
app.use('/api/connections', adminRoutes);
app.use('/webhooks', webhookRoutes);

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
