import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './check-project.mjs';

const root = path.resolve(projectRoot, process.argv[2] || 'dist');
if (root !== path.join(projectRoot, 'dist')) throw Error('Preview only the generated login introduction in dist/. Use the authentication server for protected pages.');
const port = Number(process.env.PREVIEW_PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    const stat = await fs.stat(file);
    const finalFile = stat.isDirectory() ? path.join(file, 'index.html') : file;
    const bytes = await fs.readFile(finalFile);
    response.writeHead(200, { 'Content-Type': mime[path.extname(finalFile)] || 'application/octet-stream', 'Content-Length': bytes.byteLength, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); response.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Static client preview: http://127.0.0.1:${port}\nThis preview has no authentication backend.`));
