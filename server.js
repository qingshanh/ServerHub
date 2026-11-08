import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import os from 'node:os';
import { store } from './src/store.js';
import { fetchSiteMeta } from './src/meta-fetcher.js';
import { pingUrl } from './src/pinger.js';

let PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.resolve('public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        req.destroy(new Error('请求体过大 (限制 5MB)'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('非法 JSON 格式'));
      }
    });
    req.on('error', reject);
  });
}

async function handleStatic(req, res, pathname) {
  let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }

  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      return handleStatic(req, res, path.join(pathname, 'index.html'));
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = await fs.readFile(filePath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Internal Server Error');
    }
  }
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS 预检
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  try {
    // API 路由
    if (pathname.startsWith('/api/')) {
      // 1. 获取全量数据
      if (pathname === '/api/data' && method === 'GET') {
        const data = await store.getAll();
        return sendJson(res, 200, { success: true, data });
      }

      // 2. 自动抓取网页元数据 (Title, Icon, Description)
      if (pathname === '/api/meta' && method === 'GET') {
        const targetUrl = reqUrl.searchParams.get('url');
        if (!targetUrl) {
          return sendJson(res, 400, { success: false, message: '请提供 url 参数' });
        }
        const meta = await fetchSiteMeta(targetUrl);
        return sendJson(res, 200, meta);
      }

      // 3. 项目新增
      if (pathname === '/api/items' && method === 'POST') {
        const payload = await parseBody(req);
        if (!payload.url || !payload.url.trim()) {
          return sendJson(res, 400, { success: false, message: '项目网址 (URL) 为必填项' });
        }
        const created = await store.addItem(payload);
        return sendJson(res, 201, { success: true, item: created });
      }

      // 4. 项目编辑
      if (pathname.startsWith('/api/items/') && method === 'PUT') {
        const id = pathname.replace('/api/items/', '');
        const payload = await parseBody(req);
        const updated = await store.updateItem(id, payload);
        if (!updated) {
          return sendJson(res, 404, { success: false, message: '未找到指定项目' });
        }
        return sendJson(res, 200, { success: true, item: updated });
      }

      // 5. 项目删除
      if (pathname.startsWith('/api/items/') && method === 'DELETE') {
        const id = pathname.replace('/api/items/', '');
        const deleted = await store.deleteItem(id);
        if (!deleted) {
          return sendJson(res, 404, { success: false, message: '未找到指定项目' });
        }
        return sendJson(res, 200, { success: true });
      }

      // 6. 删除单个服务器标签
      if (pathname.startsWith('/api/servers/') && method === 'DELETE') {
        const idOrName = decodeURIComponent(pathname.replace('/api/servers/', ''));
        const deleted = await store.deleteServer(idOrName);
        return sendJson(res, 200, { success: deleted });
      }

      // 7. 删除单个分类
      if (pathname.startsWith('/api/categories/') && method === 'DELETE') {
        const idOrName = decodeURIComponent(pathname.replace('/api/categories/', ''));
        const deleted = await store.deleteCategory(idOrName);
        return sendJson(res, 200, { success: deleted });
      }

      // 8. 一键清理所有无引用的空服务器与空分类
      if (pathname === '/api/tags/cleanup' && method === 'POST') {
        const result = await store.cleanUnusedTags();
        return sendJson(res, 200, { success: true, ...result });
      }

      // 9. 重新排序
      if (pathname === '/api/items/reorder' && method === 'POST') {
        const payload = await parseBody(req);
        await store.reorder(payload.orderedIds);
        return sendJson(res, 200, { success: true });
      }

      // 10. 连通性单项探活
      if (pathname === '/api/ping' && method === 'POST') {
        const payload = await parseBody(req);
        if (!payload.url) {
          return sendJson(res, 400, { success: false, message: '缺少 url 参数' });
        }
        const result = await pingUrl(payload.url, payload.timeoutMs || 3000);
        return sendJson(res, 200, { success: true, ...result });
      }

      // 11. 批量并发探活
      if (pathname === '/api/ping-all' && method === 'POST') {
        const payload = await parseBody(req);
        const urls = Array.isArray(payload.urls) ? payload.urls : [];
        const results = {};
        const queue = [...urls];
        const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
          while (queue.length > 0) {
            const u = queue.shift();
            if (u) {
              results[u] = await pingUrl(u, 3000);
            }
          }
        });
        await Promise.all(workers);
        return sendJson(res, 200, { success: true, results });
      }

      // 12. 备份导出
      if (pathname === '/api/backup/export' && method === 'GET') {
        const data = await store.getAll();
        const filename = `serverhub_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        });
        return res.end(JSON.stringify(data, null, 2));
      }

      // 13. 备份恢复
      if (pathname === '/api/backup/import' && method === 'POST') {
        const payload = await parseBody(req);
        const mode = payload.mode === 'merge' ? 'merge' : 'replace';
        const updated = await store.importData(payload.data, mode);
        return sendJson(res, 200, { success: true, data: updated, mode });
      }

      // 14. 重置为演示初始数据
      if (pathname === '/api/backup/reset' && method === 'POST') {
        const resetData = await store.resetToDefault();
        return sendJson(res, 200, { success: true, data: resetData });
      }

      // 15. 更新系统偏好配置
      if (pathname === '/api/settings' && method === 'POST') {
        const payload = await parseBody(req);
        const settings = await store.updateSettings(payload);
        return sendJson(res, 200, { success: true, settings });
      }

      return sendJson(res, 404, { success: false, message: 'API 接口不存在' });
    }

    // 静态前端文件处理
    await handleStatic(req, res, pathname);
  } catch (err) {
    console.error(`[Error] ${method} ${pathname}:`, err);
    sendJson(res, 500, { success: false, message: err.message || '服务器内部错误' });
  }
});

function startServer(port) {
  server.listen(port, HOST, () => {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }

    console.log('='.repeat(56));
    console.log('🚀 ServerHub (多服务器项目聚合平台) 已启动成功！');
    console.log(`📡 本地访问地址:   http://localhost:${port}`);
    if (addresses.length > 0) {
      addresses.forEach(ip => {
        console.log(`🌐 局域网访问:     http://${ip}:${port}`);
      });
    }
    console.log('='.repeat(56));
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[ServerHub] 端口 ${port} 已被占用，正在尝试端口 ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('[ServerHub] 启动发生致命错误:', err);
    }
  });
}

startServer(PORT);
