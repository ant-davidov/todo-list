import { createService } from './service.js';
import { databaseStore } from './store.js';
import { consumeRateLimit } from './rate-limit.js';

function clientIp(req, trustedIp) {
  if (typeof trustedIp === 'string' && trustedIp.trim()) return trustedIp.trim();
  const headers = req.headers || {};
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

export async function handle(req, res, action, trustedIp, store) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization');
  const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (!['GET', 'POST', 'PUT'].includes(req.method) || (action === 'profile' && req.method === 'PUT') || (action === 'tasks' && req.method === 'POST')) {
    res.setHeader('Allow', action === 'profile' ? 'GET, POST' : 'GET, PUT');
    return send(405, { error: 'Метод не поддерживается.' });
  }

  const ip = clientIp(req, trustedIp);
  const requestLimit = consumeRateLimit(`request:${ip}`, 120, 60_000);
  if (!requestLimit.allowed) {
    res.setHeader('Retry-After', String(requestLimit.retryAfter));
    return send(429, { error: 'Слишком много запросов. Повторите позже.' });
  }
  if (action === 'profile' && req.method === 'POST') {
    const profileLimit = consumeRateLimit(`profile:${ip}`, 10, 60 * 60_000);
    if (!profileLimit.allowed) {
      res.setHeader('Retry-After', String(profileLimit.retryAfter));
      return send(429, { error: 'С этого IP создано слишком много профилей. Повторите позже.' });
    }
  }

  let body;
  if (req.method === 'PUT') {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'Неверный формат запроса.' });
    try {
      const raw = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
      if (!raw || Buffer.byteLength(raw) > 512000) return send(413, { error: 'Список слишком большой.' });
      body = JSON.parse(raw);
    } catch { return send(400, { error: 'Неверный формат запроса.' }); }
  }
  try {
    const service = createService(store ?? databaseStore());
    const response = await service({ action, method: req.method, authorization: req.headers.authorization, body });
    send(response.status, response.body);
  } catch (error) {
    // Do not log credentials, GUIDs, task contents, or database connection strings.
    console.error('Task API unavailable', { action, code: typeof error.code === 'string' ? error.code : 'unavailable' });
    send(503, { error: 'Сервис временно недоступен. Попробуйте позже.' });
  }
}
