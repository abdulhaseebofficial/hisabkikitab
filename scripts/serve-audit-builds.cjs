const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const compiled = JSON.parse(fs.readFileSync('test-results/routing-verification.json'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
for (const [port, folder, changed] of [[4180, 'test-results/before-dist', false], [4181, 'apps/web/dist', true]]) {
  const root = path.resolve(folder);
  http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (changed) {
      const rule = compiled.redirects.find(r => new RegExp(r.src).test(url.pathname));
      if (rule) { res.writeHead(rule.status, { Location: url.pathname.replace(new RegExp(rule.src), rule.headers.Location) + url.search }); return res.end(); }
    }
    let requested = decodeURIComponent(url.pathname);
    const rewrite = changed && compiled.rewrites.find(r => new RegExp(r.src).test(requested));
    if (rewrite) requested = requested.replace(new RegExp(rewrite.src), rewrite.dest).split('?')[0];
    else if (!path.extname(requested)) requested = requested.replace(/\/$/, '') + '/index.html';
    if (requested === '//index.html') requested = '/index.html';
    let file = path.resolve(root, '.' + requested);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
      res.statusCode = 404;
      file = path.join(root, '404.html');
    }
    const content = fs.readFileSync(file);
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    if (url.pathname.startsWith('/assets/')) res.setHeader('Cache-Control', changed ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
    else res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    if (/gzip/.test(req.headers['accept-encoding'] || '') && /\.(html|js|css|svg|xml|txt)$/.test(file)) {
      res.setHeader('Content-Encoding', 'gzip'); res.end(zlib.gzipSync(content));
    } else res.end(content);
  }).listen(port, '127.0.0.1', () => console.log(`${folder}: http://127.0.0.1:${port}`));
}
