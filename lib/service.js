import { createHash, randomUUID } from 'node:crypto';

export const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const result = (status, body) => ({ status, body });

function validateTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length > 500) return null;
  const ids = new Set();
  const date = value => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  for (const task of tasks) {
    if (!task || !guidPattern.test(task.id) || ids.has(task.id.toLowerCase()) || typeof task.text !== 'string' || !task.text.trim() || task.text.length > 250 || typeof task.done !== 'boolean' || !date(task.createdAt) || !date(task.completedAt) || (!task.done && task.completedAt !== null)) return null;
    ids.add(task.id.toLowerCase());
  }
  return tasks.map(({ id, text, done, createdAt, completedAt }) => ({ id: id.toLowerCase(), text: text.trim(), done, createdAt: createdAt ? new Date(createdAt).toISOString() : null, completedAt: completedAt ? new Date(completedAt).toISOString() : null }));
}

export function createService(store) {
  return async function service({ action, method, authorization = '', body }) {
    const allowed = action === 'profile' ? ['POST', 'GET'] : ['GET', 'PUT'];
    if (!allowed.includes(method)) return result(405, { error: 'Метод не поддерживается.' });
    if (action === 'profile' && method === 'POST') {
      const guid = randomUUID();
      const hash = createHash('sha256').update(guid).digest('hex');
      const profile = await store.create(hash);
      return result(201, { guid, ...profile });
    }
    const guid = authorization.match(/^Bearer (.+)$/i)?.[1]?.trim().toLowerCase();
    if (!guid || !guidPattern.test(guid)) return result(401, { error: 'Введите корректный код пользователя.' });
    const hash = createHash('sha256').update(guid).digest('hex');
    if (method === 'PUT') {
      if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= 2147483647) return result(400, { error: 'Не удалось сохранить список. Обновите страницу.' });
      const tasks = validateTasks(body.tasks);
      if (!tasks) return result(400, { error: 'Проверьте задачи: не более 500 задач и 250 символов в каждой.' });
      const updated = await store.update(hash, body.revision, tasks);
      if (updated) return result(200, updated);
      const existing = await store.find(hash);
      return existing ? result(409, { error: 'Список изменился на другом устройстве. Он обновлён — повторите действие.' }) : result(404, { error: 'Пользователь не найден. Проверьте код.' });
    }
    const profile = await store.find(hash);
    return profile ? result(200, profile) : result(404, { error: 'Пользователь не найден. Проверьте код.' });
  };
}
