import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const INSECURE_HTTPS_AGENT = new https.Agent({
  rejectUnauthorized: false
});

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function normalizeUrl(rawUrl) {
  let trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'http://' + trimmed;
  }
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function fetchPageBuffer(targetUrl, maxRedirects = 4, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (e) {
      return reject(e);
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const reqOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: (parsedUrl.pathname || '/') + (parsedUrl.search || ''),
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Connection': 'close'
      },
      agent: isHttps ? INSECURE_HTTPS_AGENT : undefined,
      timeout: timeoutMs
    };

    const req = client.request(reqOptions, (res) => {
      // 301/302/307/308 重定向处理
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) {
          return reject(new Error('重定向次数过多'));
        }
        const nextUrl = new URL(res.headers.location, targetUrl).href;
        res.resume(); // 释放流
        return resolve(fetchPageBuffer(nextUrl, maxRedirects - 1, timeoutMs));
      }

      const chunks = [];
      let totalLength = 0;
      const MAX_BYTES = 512 * 1024; // 最多读取 512KB 前文即可，防止巨型文件耗内存

      res.on('data', (chunk) => {
        chunks.push(chunk);
        totalLength += chunk.length;
        if (totalLength > MAX_BYTES) {
          req.destroy();
        }
      });

      res.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: res.headers['content-type'] || '',
          finalUrl: targetUrl,
          statusCode: res.statusCode
        });
      });

      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new Error(`连接请求超时 (${timeoutMs}ms)`));
    });

    req.on('error', reject);
    req.end();
  });
}

function detectCharset(contentType, sampleHtml) {
  let charset = 'utf-8';
  if (contentType) {
    const match = contentType.match(/charset=([a-zA-Z0-9_-]+)/i);
    if (match) return match[1].toLowerCase();
  }
  if (sampleHtml) {
    const matchMeta = sampleHtml.match(/<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i);
    if (matchMeta) return matchMeta[1].toLowerCase();
    const matchHttpEquiv = sampleHtml.match(/<meta[^>]+http-equiv=["']content-type["'][^>]+content=["'][^"']*charset=([a-zA-Z0-9_-]+)/i);
    if (matchHttpEquiv) return matchHttpEquiv[1].toLowerCase();
  }
  return charset;
}

function parseHtmlMetadata(html, baseUrl) {
  // Title
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = decodeHtmlEntities(titleMatch[1]);
  } else {
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (ogTitle) title = decodeHtmlEntities(ogTitle[1]);
  }

  // Description
  let description = '';
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (descMatch && descMatch[1]) {
    description = decodeHtmlEntities(descMatch[1]);
  }

  // Favicon
  let icon = '';
  const iconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ||
                    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i) ||
                    html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i);
  if (iconMatch && iconMatch[1]) {
    try {
      icon = new URL(iconMatch[1], baseUrl).href;
    } catch {
      icon = '';
    }
  }

  if (!icon) {
    try {
      const u = new URL(baseUrl);
      icon = `${u.protocol}//${u.host}/favicon.ico`;
    } catch {
      icon = '';
    }
  }

  return { title, description, icon };
}

export async function fetchSiteMeta(rawUrl) {
  const parsed = normalizeUrl(rawUrl);
  if (!parsed) {
    return {
      success: false,
      error: '无效的网址格式',
      title: '',
      description: '',
      icon: '',
      url: rawUrl
    };
  }

  const cleanUrl = parsed.href;
  const fallbackTitle = parsed.hostname;

  try {
    const { buffer, contentType, finalUrl } = await fetchPageBuffer(cleanUrl, 4, 4500);

    // 先用 utf-8 解码一个样本找 meta charset
    const utf8Sample = buffer.subarray(0, 4096).toString('utf8');
    const charset = detectCharset(contentType, utf8Sample);

    let html = '';
    try {
      const decoder = new TextDecoder(charset.includes('gb') ? 'gbk' : 'utf-8', { fatal: false });
      html = decoder.decode(buffer);
    } catch {
      html = buffer.toString('utf8');
    }

    const meta = parseHtmlMetadata(html, finalUrl);

    return {
      success: true,
      url: finalUrl,
      title: meta.title || fallbackTitle,
      description: meta.description || '',
      icon: meta.icon || '',
      fallbackTitle
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || '网络连接超时或无法访问',
      url: cleanUrl,
      title: fallbackTitle,
      description: '',
      icon: `${parsed.protocol}//${parsed.host}/favicon.ico`,
      fallbackTitle
    };
  }
}
