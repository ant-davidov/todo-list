const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const page = path.join(__dirname, 'dist', 'index.html');
const port = Number(process.env.PORT) || 4173;

http.createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/index.html') {
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
    response.end(content);
  });
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}`));
