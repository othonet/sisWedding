import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Envolve um handler (req, res) com tratamento de método e de erros.
export function handler(methods) {
  return async (req, res) => {
    const fn = methods[req.method];
    if (!fn) {
      res.setHeader('Allow', Object.keys(methods).join(', '));
      return res.status(405).json({ error: 'Método não permitido.' });
    }
    try {
      res.setHeader('Cache-Control', 'no-store');
      const data = await fn(req, res);
      if (!res.headersSent) res.status(200).json(data ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message, ...err.extra });
      }
      console.error(err);
      res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
    }
  };
}

export function body(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { throw new HttpError(400, 'JSON inválido.'); }
  }
  return b;
}

export function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

// ---------- Autenticação do painel ----------
// Usuário e senha vêm das variáveis ADMIN_USER (padrão "admin") e ADMIN_PASSWORD.
// O login devolve um token assinado (HMAC) válido por 12 horas; trocar a senha
// invalida todos os tokens emitidos.

const SESSION_HOURS = 12;

function adminCredentials() {
  const user = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new HttpError(500, 'Configure ADMIN_PASSWORD nas variáveis de ambiente.');
  return { user, password };
}

function secret() {
  const { user, password } = adminCredentials();
  return process.env.SESSION_SECRET || createHash('sha256').update(`sisWedding:${user}:${password}`).digest();
}

function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function login(username, password) {
  const creds = adminCredentials();
  const userOk = safeEqual(String(username ?? '').trim().toLowerCase(), creds.user.toLowerCase());
  const passOk = safeEqual(password ?? '', creds.password);
  if (!userOk || !passOk) return null;
  const exp = Date.now() + SESSION_HOURS * 3600e3;
  const payload = Buffer.from(JSON.stringify({ u: creds.user, exp })).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, user: creds.user, expiresAt: exp };
}

export function requireAdmin(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    throw new HttpError(401, 'Sessão inválida. Entre novamente.');
  }
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { data = null; }
  if (!data || !(data.exp > Date.now())) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
  return data.u;
}
