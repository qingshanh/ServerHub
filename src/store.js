import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_FILE = path.resolve('data', 'projects.json');
const EXAMPLE_FILE = path.resolve('data', 'projects.example.json');

const DEFAULT_DATA = {
  version: 1,
  updatedAt: new Date().toISOString(),
  settings: {
    siteTitle: 'ServerHub - 我的服务器项目聚合',
    subtitle: '多服务器自建项目与服务统一管理入口',
    defaultView: 'server',
    preferInternal: false,
    theme: 'dark'
  },
  servers: [
    { id: 'srv-1', name: '我的主服务器', color: '#6366f1', description: '自建核心服务' }
  ],
  categories: [
    { id: 'cat-1', name: '默认分类', icon: 'folder' }
  ],
  items: []
};

const COLOR_PALETTE = [
  '#6366f1', '#10b981', '#3b82f6', '#f59e0b',
  '#ec4899', '#06b6d4', '#8b5cf6', '#14b8a6',
  '#f97316', '#84cc16'
];

let cachedData = null;

async function ensureDataLoaded() {
  if (cachedData) return cachedData;
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    cachedData = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
      // 优先从 example 模板初始化
      try {
        const exampleRaw = await fs.readFile(EXAMPLE_FILE, 'utf8');
        cachedData = JSON.parse(exampleRaw);
      } catch {
        cachedData = JSON.parse(JSON.stringify(DEFAULT_DATA));
      }
      await persistData();
    } else {
      throw err;
    }
  }
  return cachedData;
}

async function persistData() {
  if (!cachedData) return;
  cachedData.updatedAt = new Date().toISOString();
  const dir = path.dirname(DATA_FILE);
  await fs.mkdir(dir, { recursive: true });
  const tmpFile = `${DATA_FILE}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(cachedData, null, 2), 'utf8');
  await fs.rename(tmpFile, DATA_FILE);
}

function syncMetadata(serverName, categoryName) {
  if (serverName && serverName.trim()) {
    const sName = serverName.trim();
    const exists = cachedData.servers.some(s => s.name === sName);
    if (!exists) {
      const color = COLOR_PALETTE[cachedData.servers.length % COLOR_PALETTE.length];
      cachedData.servers.push({
        id: `srv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: sName,
        color,
        description: ''
      });
    }
  }
  if (categoryName && categoryName.trim()) {
    const cName = categoryName.trim();
    const exists = cachedData.categories.some(c => c.name === cName);
    if (!exists) {
      cachedData.categories.push({
        id: `cat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: cName,
        icon: 'folder'
      });
    }
  }
}

export const store = {
  async getAll() {
    return await ensureDataLoaded();
  },

  async addItem(payload) {
    await ensureDataLoaded();
    const id = `item-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    const maxOrder = cachedData.items.reduce((max, it) => Math.max(max, it.order || 0), 0);

    const item = {
      id,
      title: (payload.title || '').trim() || (payload.url || '').trim(),
      url: (payload.url || '').trim(),
      internalUrl: (payload.internalUrl || '').trim(),
      server: (payload.server || '').trim() || '未分配服务器',
      category: (payload.category || '').trim() || '默认分类',
      description: (payload.description || '').trim(),
      notes: (payload.notes || '').trim(),
      icon: (payload.icon || '').trim(),
      order: typeof payload.order === 'number' ? payload.order : maxOrder + 1,
      createdAt: now,
      updatedAt: now
    };

    syncMetadata(item.server, item.category);
    cachedData.items.push(item);
    await persistData();
    return item;
  },

  async updateItem(id, patch) {
    await ensureDataLoaded();
    const idx = cachedData.items.findIndex(it => it.id === id);
    if (idx === -1) return null;

    const existing = cachedData.items[idx];
    const updated = {
      ...existing,
      ...patch,
      id: existing.id,
      updatedAt: new Date().toISOString()
    };

    if (patch.server) syncMetadata(patch.server, null);
    if (patch.category) syncMetadata(null, patch.category);

    cachedData.items[idx] = updated;
    await persistData();
    return updated;
  },

  async deleteItem(id) {
    await ensureDataLoaded();
    const initialLen = cachedData.items.length;
    cachedData.items = cachedData.items.filter(it => it.id !== id);
    if (cachedData.items.length !== initialLen) {
      await persistData();
      return true;
    }
    return false;
  },

  async deleteServer(nameOrId) {
    await ensureDataLoaded();
    const serverObj = cachedData.servers.find(s => s.id === nameOrId || s.name === nameOrId);
    if (!serverObj) return false;

    for (const it of cachedData.items) {
      if (it.server === serverObj.name) {
        it.server = '未分配服务器';
      }
    }

    cachedData.servers = cachedData.servers.filter(s => s.id !== serverObj.id);
    await persistData();
    return true;
  },

  async deleteCategory(nameOrId) {
    await ensureDataLoaded();
    const catObj = cachedData.categories.find(c => c.id === nameOrId || c.name === nameOrId);
    if (!catObj) return false;

    for (const it of cachedData.items) {
      if (it.category === catObj.name) {
        it.category = '默认分类';
      }
    }

    cachedData.categories = cachedData.categories.filter(c => c.id !== catObj.id);
    await persistData();
    return true;
  },

  async cleanUnusedTags() {
    await ensureDataLoaded();
    const usedServers = new Set(cachedData.items.map(it => it.server).filter(Boolean));
    const usedCategories = new Set(cachedData.items.map(it => it.category).filter(Boolean));

    const removedServers = cachedData.servers.filter(s => !usedServers.has(s.name));
    const removedCategories = cachedData.categories.filter(c => !usedCategories.has(c.name));

    cachedData.servers = cachedData.servers.filter(s => usedServers.has(s.name));
    cachedData.categories = cachedData.categories.filter(c => usedCategories.has(c.name));

    if (cachedData.servers.length === 0) {
      cachedData.servers.push({ id: 'srv-default', name: '默认服务器', color: '#6366f1', description: '' });
    }
    if (cachedData.categories.length === 0) {
      cachedData.categories.push({ id: 'cat-default', name: '默认分类', icon: 'folder' });
    }

    await persistData();
    return {
      removedServers: removedServers.map(s => s.name),
      removedCategories: removedCategories.map(c => c.name)
    };
  },

  async reorder(orderedIds) {
    await ensureDataLoaded();
    if (!Array.isArray(orderedIds)) return false;
    const map = new Map(cachedData.items.map(it => [it.id, it]));
    const nextItems = [];
    let orderIndex = 1;

    for (const id of orderedIds) {
      if (map.has(id)) {
        const item = map.get(id);
        item.order = orderIndex++;
        nextItems.push(item);
        map.delete(id);
      }
    }
    for (const item of map.values()) {
      item.order = orderIndex++;
      nextItems.push(item);
    }

    cachedData.items = nextItems;
    await persistData();
    return true;
  },

  async updateSettings(settingsPatch) {
    await ensureDataLoaded();
    cachedData.settings = {
      ...cachedData.settings,
      ...settingsPatch
    };
    await persistData();
    return cachedData.settings;
  },

  async importData(data, mode = 'replace') {
    await ensureDataLoaded();
    if (!data || typeof data !== 'object') {
      throw new Error('导入数据格式不正确，需为有效 JSON 对象');
    }

    if (mode === 'replace') {
      cachedData = {
        version: 1,
        updatedAt: new Date().toISOString(),
        settings: { ...DEFAULT_DATA.settings, ...(data.settings || {}) },
        servers: Array.isArray(data.servers) ? data.servers : DEFAULT_DATA.servers,
        categories: Array.isArray(data.categories) ? data.categories : DEFAULT_DATA.categories,
        items: Array.isArray(data.items) ? data.items : []
      };
    } else {
      const existingUrls = new Set(cachedData.items.map(it => it.url));
      const newItems = Array.isArray(data.items) ? data.items : [];
      let maxOrder = cachedData.items.reduce((max, it) => Math.max(max, it.order || 0), 0);

      for (const item of newItems) {
        if (!item.url) continue;
        if (!existingUrls.has(item.url)) {
          const freshItem = {
            id: `item-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            title: item.title || item.url,
            url: item.url,
            internalUrl: item.internalUrl || '',
            server: item.server || '未分配服务器',
            category: item.category || '默认分类',
            description: item.description || '',
            notes: item.notes || '',
            icon: item.icon || '',
            order: ++maxOrder,
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          syncMetadata(freshItem.server, freshItem.category);
          cachedData.items.push(freshItem);
        }
      }
    }

    await persistData();
    return cachedData;
  },

  async resetToDefault() {
    try {
      const exampleRaw = await fs.readFile(EXAMPLE_FILE, 'utf8');
      cachedData = JSON.parse(exampleRaw);
    } catch {
      cachedData = JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    await persistData();
    return cachedData;
  }
};
