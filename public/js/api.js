// ServerHub 前端 API 通信层

const BASE = '';

async function request(endpoint, options = {}) {
  const url = `${BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const res = await fetch(url, config);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const errData = await res.json();
      if (errData && errData.message) msg = errData.message;
    } catch {}
    throw new Error(msg);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  return await res.text();
}

export const api = {
  async getData() {
    return await request('/api/data');
  },

  async fetchMeta(targetUrl) {
    return await request(`/api/meta?url=${encodeURIComponent(targetUrl)}`);
  },

  async createItem(payload) {
    return await request('/api/items', {
      method: 'POST',
      body: payload
    });
  },

  async updateItem(id, payload) {
    return await request(`/api/items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: payload
    });
  },

  async deleteItem(id) {
    return await request(`/api/items/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  async deleteServer(nameOrId) {
    return await request(`/api/servers/${encodeURIComponent(nameOrId)}`, {
      method: 'DELETE'
    });
  },

  async deleteCategory(nameOrId) {
    return await request(`/api/categories/${encodeURIComponent(nameOrId)}`, {
      method: 'DELETE'
    });
  },

  async cleanUnusedTags() {
    return await request('/api/tags/cleanup', {
      method: 'POST'
    });
  },

  async reorder(orderedIds) {
    return await request('/api/items/reorder', {
      method: 'POST',
      body: { orderedIds }
    });
  },

  async ping(url) {
    return await request('/api/ping', {
      method: 'POST',
      body: { url }
    });
  },

  async pingAll(urls) {
    return await request('/api/ping-all', {
      method: 'POST',
      body: { urls }
    });
  },

  async importBackup(data, mode = 'replace') {
    return await request('/api/backup/import', {
      method: 'POST',
      body: { data, mode }
    });
  },

  async resetDefault() {
    return await request('/api/backup/reset', {
      method: 'POST'
    });
  },

  async updateSettings(settings) {
    return await request('/api/settings', {
      method: 'POST',
      body: settings
    });
  },

  getExportUrl() {
    return `${BASE}/api/backup/export`;
  }
};
