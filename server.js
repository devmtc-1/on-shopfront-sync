// server.js - ES Modules 版本
import { createServer } from 'http';

console.log('=== Starting Shopify App (ES Modules) ===');

const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      app: 'On Shopfront Sync'
    }));
    return;
  }
  
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <!DOCTYPE html>
    <html>
      <head><title>Shopify App</title></head>
      <body>
        <h1>Shopify App Running</h1>
        <p>Production Environment</p>
        <p>URL: ${process.env.APP_URL || 'Not set'}</p>
      </body>
    </html>
  `);
});

server.listen(port, host, () => {
  console.log(`✅ Server running on http://${host}:${port}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'production'}`);
});