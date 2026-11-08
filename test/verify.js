import assert from 'node:assert';
import http from 'node:http';
import { store } from '../src/store.js';
import { fetchSiteMeta } from '../src/meta-fetcher.js';
import { pingUrl } from '../src/pinger.js';

async function runTests() {
  console.log('--- 1. 测试 Store 数据存取 ---');
  const allData = await store.getAll();
  assert(allData.items.length > 0, '默认数据 items 应该存在');
  assert(allData.servers.length > 0, '默认 servers 应该存在');
  assert(allData.categories.length > 0, '默认 categories 应该存在');
  console.log(`[PASS] Store 成功加载，当前项目数: ${allData.items.length}, 服务器数: ${allData.servers.length}`);

  console.log('--- 2. 测试新增项目与元数据同步 ---');
  const newItem = await store.addItem({
    url: 'https://test.internal.net:8443',
    internalUrl: 'http://192.168.1.99:8080',
    title: '自动化测试服务',
    server: '测试自建节点',
    category: '自动化质检',
    description: '用于单测的临时项目',
    notes: '端口 8080; 用户 admin'
  });
  assert(newItem.id.startsWith('item-'), '新增项目应有规范 ID');
  assert.strictEqual(newItem.server, '测试自建节点');
  assert.strictEqual(newItem.category, '自动化质检');

  const refreshedData = await store.getAll();
  const serverExists = refreshedData.servers.some(s => s.name === '测试自建节点');
  const categoryExists = refreshedData.categories.some(c => c.name === '自动化质检');
  assert(serverExists, '新服务器标签应自动加入 servers 集合');
  assert(categoryExists, '新分类应自动加入 categories 集合');
  console.log('[PASS] 新增与标签/分类同步正常');

  console.log('--- 3. 测试更新与删除 ---');
  const updated = await store.updateItem(newItem.id, {
    description: '已更新的测试描述'
  });
  assert.strictEqual(updated.description, '已更新的测试描述');

  const deleted = await store.deleteItem(newItem.id);
  assert.strictEqual(deleted, true, '删除应成功');
  console.log('[PASS] 更新与删除操作正常');

  console.log('--- 4. 测试本地 Mock 站点 Title 自动抓取 ---');
  // 创建一个微型本地 HTTP 站点用来测试抓取和探活
  const mockServer = http.createServer((req, res) => {
    if (req.url === '/favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'image/x-icon' });
      return res.end('ICON_BYTES');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>测试抓取项目 - 监控大屏</title>
          <meta name="description" content="这是测试站点的自动化描述内容">
          <link rel="icon" href="/favicon.ico">
        </head>
        <body>
          <h1>Welcome to Mock Service</h1>
        </body>
      </html>
    `);
  });

  await new Promise(resolve => mockServer.listen(34567, '127.0.0.1', resolve));

  try {
    const meta = await fetchSiteMeta('http://127.0.0.1:34567');
    assert.strictEqual(meta.success, true, '抓取应该成功');
    assert.strictEqual(meta.title, '测试抓取项目 - 监控大屏', '抓取标题应该完全匹配');
    assert.strictEqual(meta.description, '这是测试站点的自动化描述内容');
    assert(meta.icon.includes('/favicon.ico'), 'Favicon 地址应该匹配');
    console.log('[PASS] 自动抓取网页 Title、Description、Icon 成功！抓取结果:', meta.title);

    console.log('--- 5. 测试服务探活 Pinger ---');
    const pingResult = await pingUrl('http://127.0.0.1:34567');
    assert.strictEqual(pingResult.online, true, 'Mock 服务应该返回在线');
    assert(pingResult.latency >= 0, '延时应为非负数');
    console.log(`[PASS] 探活成功，延迟: ${pingResult.latency}ms`);
  } finally {
    mockServer.close();
  }

  console.log('\n=============================');
  console.log('🎉 所有自动化验证全部通过！');
  console.log('=============================');
}

runTests().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
