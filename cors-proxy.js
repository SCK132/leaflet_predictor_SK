/**
 * CORS Proxy & Static File Server
 * 
 * - ポート3000で静的ファイル (index.html, css/, js/ 等) を配信
 * - /api/ へのリクエストを Docker Tawhiri (localhost:8080) へプロキシ
 * 
 * 使い方:
 *   node cors-proxy.js
 *   ブラウザで http://localhost:3000 を開く
 * 
 * 環境変数:
 *   PORT           - サーバーポート (デフォルト: 3000)
 *   TAWHIRI_HOST   - Tawhiri APIのホスト (デフォルト: localhost)
 *   TAWHIRI_PORT   - Tawhiri APIのポート (デフォルト: 8000)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// --- Configuration ---
const PORT = parseInt(process.env.PORT || '3000', 10);
const TAWHIRI_HOST = process.env.TAWHIRI_HOST || 'localhost';
const TAWHIRI_PORT = parseInt(process.env.TAWHIRI_PORT || '8000', 10);
const STATIC_DIR = __dirname; // Serve files from the same directory as this script

// MIME types for static file serving
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
};

/**
 * Proxy an incoming request to the Tawhiri Docker API
 */
function proxyToTawhiri(req, res) {
    // Strip the /api prefix and forward the rest
    const parsedUrl = url.parse(req.url);
    // /api/v1/?foo=bar → /api/v1/?foo=bar (keep as-is for Tawhiri)
    const targetPath = parsedUrl.path; // includes query string

    const options = {
        hostname: TAWHIRI_HOST,
        port: TAWHIRI_PORT,
        path: targetPath,
        method: req.method,
        headers: {
            ...req.headers,
            host: `${TAWHIRI_HOST}:${TAWHIRI_PORT}`, // Override host header
        },
    };

    const proxyReq = http.request(options, (proxyRes) => {
        // Add CORS headers to the response
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error(`[Proxy Error] ${err.message}`);
        res.writeHead(502, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({
            error: {
                description: `Tawhiri API unreachable (${TAWHIRI_HOST}:${TAWHIRI_PORT}): ${err.message}`,
            },
        }));
    });

    req.pipe(proxyReq);
}

/**
 * Serve a static file from disk
 */
function serveStaticFile(req, res) {
    const parsedUrl = url.parse(req.url);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Default to index.html
    if (pathname === '/') pathname = '/index.html';

    // Security: prevent directory traversal
    const filePath = path.join(STATIC_DIR, pathname);
    if (!filePath.startsWith(STATIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: ' + pathname);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
}

// --- Create Server ---
const server = http.createServer((req, res) => {
    // Handle CORS preflight for API requests
    if (req.method === 'OPTIONS' && req.url.startsWith('/api/')) {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        });
        res.end();
        return;
    }

    // Route: /api/* → Proxy to Tawhiri Docker
    if (req.url.startsWith('/api/')) {
        console.log(`[Proxy] ${req.method} ${req.url} → ${TAWHIRI_HOST}:${TAWHIRI_PORT}`);
        proxyToTawhiri(req, res);
        return;
    }

    // Route: Everything else → Static files
    serveStaticFile(req, res);
});

server.listen(PORT, () => {
    console.log('');
    console.log('===========================================');
    console.log('  Leaflet Predictor - Dev Server');
    console.log('===========================================');
    console.log(`  Static files : http://localhost:${PORT}/`);
    console.log(`  API proxy    : http://localhost:${PORT}/api/v1/ → http://${TAWHIRI_HOST}:${TAWHIRI_PORT}/api/v1/`);
    console.log('');
    console.log('  ブラウザで http://localhost:' + PORT + ' を開いてください');
    console.log('===========================================');
    console.log('');
});
