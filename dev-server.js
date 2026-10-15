// Servidor local que imita a Vercel: arquivos de /public + funções de /api.
// Uso: npm run dev  →  http://localhost:3000
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
// Variáveis locais (ADMIN_PASSWORD, DATABASE_URL...) — o .env não vai para o git
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const app = express();
app.use(express.json());

app.all('/api/*route', async (req, res) => {
  const route = [].concat(req.params.route).join('/');
  const file = path.join(root, 'api', `${route}.js`);
  if (!/^[\w/-]+$/.test(route) || !existsSync(file)) {
    return res.status(404).json({ error: 'Rota não encontrada.' });
  }
  const { default: fn } = await import(pathToFileURL(file).href);
  return fn(req, res);
});

app.use(express.static(path.join(root, 'public'), { extensions: ['html'] }));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`sisWedding em http://localhost:${port}`));
