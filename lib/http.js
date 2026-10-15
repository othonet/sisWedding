import { timingSafeEqual } from 'node:crypto';

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

export function requireAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD || (process.env.VERCEL ? '' : 'admin');
  if (!expected) throw new HttpError(500, 'Configure ADMIN_PASSWORD nas variáveis de ambiente.');
  const given = String(req.headers['x-admin-key'] || '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(401, 'Senha inválida.');
  }
}
