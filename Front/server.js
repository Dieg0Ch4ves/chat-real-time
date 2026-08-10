const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 5173);
const API_URL = process.env.API_URL || 'http://localhost:3000';
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || API_URL;

const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function serveStatic(req, res) {
  const requested = decodeURIComponent(req.url.split('?')[0]);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const filePath = path.join(PUBLIC_DIR, relative);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { message: 'Acesso negado' });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { message: `Não encontrado: ${relative}` });
      return;
    }

    const type = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
}

function proxyToApi(req, res) {
  const target = new URL(API_URL);
  const client = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host };
  delete headers['accept-encoding'];

  const proxyRequest = client.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: req.url.replace(/^\/api/, '') || '/',
      headers,
    },
    (proxyResponse) => {
      res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(res);
    },
  );

  proxyRequest.on('error', (error) => {
    sendJson(res, 502, {
      message: `Backend inacessível em ${API_URL}. Ele está rodando? (${error.message})`,
    });
  });

  req.pipe(proxyRequest);
}

const server = http.createServer((req, res) => {
  if (req.url === '/config') {
    sendJson(res, 200, { apiUrl: PUBLIC_API_URL });
    return;
  }

  if (req.url.startsWith('/api')) {
    proxyToApi(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Front de testes em http://localhost:${PORT}`);
  console.log(`Proxy /api -> ${API_URL}`);
  console.log(`WebSocket (navegador) -> ${PUBLIC_API_URL}`);
});
