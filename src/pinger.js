import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const INSECURE_AGENT = new https.Agent({ rejectUnauthorized: false });

export async function pingUrl(rawUrl, timeoutMs = 3000) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { online: false, latency: 0, status: 0, error: '无效 URL' };
  }

  const isHttps = parsed.protocol === 'https:';
  const client = isHttps ? https : http;

  const start = Date.now();

  return new Promise((resolve) => {
    const req = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: (parsed.pathname || '/') + (parsed.search || ''),
        method: 'HEAD',
        headers: {
          'User-Agent': 'ServerHub-Pinger/1.0',
          'Connection': 'close'
        },
        agent: isHttps ? INSECURE_AGENT : undefined,
        timeout: timeoutMs
      },
      (res) => {
        const latency = Date.now() - start;
        res.resume(); // discard
        resolve({
          online: res.statusCode < 500, // 2xx, 3xx, 4xx (例如 401/403 依然代表服务在线存活)
          latency,
          status: res.statusCode,
          error: null
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({
        online: false,
        latency: timeoutMs,
        status: 0,
        error: '探测超时'
      });
    });

    req.on('error', (err) => {
      resolve({
        online: false,
        latency: Date.now() - start,
        status: 0,
        error: err.message || '网络连接错误'
      });
    });

    req.end();
  });
}
