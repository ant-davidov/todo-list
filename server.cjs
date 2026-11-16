const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const page = path.join(__dirname, 'dist', 'index.html');
const port = Number(process.env.PORT) || 4173;
const localMode = process.argv.includes('--local');
let localStorePromise;
function getLocalStore() {
  return localStorePromise ||= import('./lib/local-store.js').then(({ localStore }) => localStore(path.join(__dirname, '.local', 'tasks.json')));
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  if (pathname === '/api/profile' || pathname === '/api/tasks') {
    try {
      const chunks = []; let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 512000) {
          response.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'Список слишком большой.' }));
          return;
        }
        chunks.push(chunk);
      }
      request.body = Buffer.concat(chunks).toString();
      if (localMode) {
        const { handle } = await import('./lib/http.js');
        await handle(request, response, pathname === '/api/profile' ? 'profile' : 'tasks', request.socket.remoteAddress, await getLocalStore());
      } else {
        const { default: handler } = await import(pathname === '/api/profile' ? './api/profile.js' : './api/tasks.js');
        await handler(request, response, request.socket.remoteAddress);
      }
    } catch {
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Не удалось выполнить запрос.' }));
    }
    return;
  }
  if ((request.method !== 'GET' && request.method !== 'HEAD') || (pathname !== '/' && pathname !== '/index.html')) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  fs.readFile(page, (error, content) => {
    if (error) {
      response.writeHead(500);
      response.end('Unable to load the page');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const html = localMode ? content.toString('utf8').replace('</header>', '</header><p class="date" role="note">Локальный режим. Создайте пользователя для этого компьютера. Задачи с опубликованного сайта здесь недоступны.</p>') : content;
    response.end(request.method === 'HEAD' ? undefined : html);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`http://localhost:${port}`);
  if (localMode) console.log('Local mode: tasks are saved in .local/tasks.json; published-site data is separate.');
});

module.exports = server;
