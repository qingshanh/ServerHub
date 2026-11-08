import { api } from './api.js';

// 全局应用状态
const state = {
  items: [],
  servers: [],
  categories: [],
  settings: {
    siteTitle: 'ServerHub',
    subtitle: '多服务器自建项目与服务统一管理入口',
    defaultView: 'server',
    preferInternal: false,
    theme: 'dark'
  },
  searchQuery: '',
  selectedServer: 'all',
  selectedCategory: 'all',
  viewMode: 'server', // 'server' | 'category' | 'flat'
  preferInternal: false,
  pingMap: {}, // url -> { online: bool, latency: num, status: num, loading: bool }
  editingItem: null,
  isFetchingMeta: false,
  isPingingAll: false
};

// 预定义服务器颜色提取
function getServerColor(serverName) {
  const found = state.servers.find(s => s.name === serverName);
  if (found && found.color) return found.color;
  return '#6366f1';
}

// 简易 Toast 通知
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

// 复制到剪贴板
async function copyText(text, successMsg = '已复制到剪贴板') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg, 'success');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(successMsg, 'success');
  }
}

// 加载全量数据
async function loadData() {
  try {
    const res = await api.getData();
    if (res.success && res.data) {
      state.items = res.data.items || [];
      state.servers = res.data.servers || [];
      state.categories = res.data.categories || [];
      if (res.data.settings) {
        state.settings = { ...state.settings, ...res.data.settings };
        state.viewMode = state.settings.defaultView || 'server';
        state.preferInternal = Boolean(state.settings.preferInternal);
      }
      renderHeaderStats();
      renderFilterChips();
      renderContent();
    }
  } catch (err) {
    showToast(`加载数据失败: ${err.message}`, 'error');
  }
}

// 渲染顶部统计
function renderHeaderStats() {
  const totalItemsEl = document.getElementById('stat-total-items');
  const totalServersEl = document.getElementById('stat-total-servers');
  const onlineCountEl = document.getElementById('stat-online-count');
  const siteTitleEl = document.getElementById('site-title-display');
  const siteSubEl = document.getElementById('site-sub-display');

  if (totalItemsEl) totalItemsEl.textContent = state.items.length;
  if (totalServersEl) totalServersEl.textContent = state.servers.length;
  if (siteTitleEl) siteTitleEl.textContent = state.settings.siteTitle || 'ServerHub';
  if (siteSubEl) siteSubEl.textContent = state.settings.subtitle || '多服务器自建项目聚合';

  let onlineCount = 0;
  for (const it of state.items) {
    const targetUrl = (state.preferInternal && it.internalUrl) ? it.internalUrl : it.url;
    if (state.pingMap[targetUrl]?.online) {
      onlineCount++;
    }
  }
  if (onlineCountEl) onlineCountEl.textContent = onlineCount;

  const internalToggleBtn = document.getElementById('toggle-internal-mode');
  if (internalToggleBtn) {
    if (state.preferInternal) {
      internalToggleBtn.classList.add('active');
      internalToggleBtn.innerHTML = '⚡ 内网直连模式';
    } else {
      internalToggleBtn.classList.remove('active');
      internalToggleBtn.innerHTML = '🌐 公网访问模式';
    }
  }
}

// 渲染筛选胶囊与删除按钮
function renderFilterChips() {
  const serverChipsContainer = document.getElementById('server-filter-chips');
  if (!serverChipsContainer) return;

  const serverNames = ['all', ...state.servers.map(s => s.name)];
  let unusedCount = 0;

  const chipsHtml = serverNames.map(name => {
    const isAll = name === 'all';
    const label = isAll ? '全部服务器' : name;
    const count = isAll ? state.items.length : state.items.filter(it => it.server === name).length;
    const isActive = state.selectedServer === name;
    const color = isAll ? 'var(--accent)' : getServerColor(name);

    if (!isAll && count === 0) {
      unusedCount++;
    }

    // 若非全部且数量为 0，展示删除叉号
    const deleteBtn = (!isAll && count === 0)
      ? `<button class="chip-delete-btn" data-delete-server="${escapeHtml(name)}" title="删除此无用服务器标签">×</button>`
      : '';

    return `
      <div class="filter-chip ${isActive ? 'active' : ''}" data-server="${escapeHtml(name)}">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};"></span>
        <span class="chip-label">${escapeHtml(label)}</span>
        <span style="opacity:0.6;font-size:0.75rem;">(${count})</span>
        ${deleteBtn}
      </div>
    `;
  }).join('');

  // 如果有未使用的标签，追加一个一键清理空标签的小按钮
  const cleanBtn = unusedCount > 0
    ? `<button class="chip-clean-btn" id="btn-quick-cleanup-tags" title="清除所有 0 个服务的空服务器标签">🧹 清理 ${unusedCount} 个空标签</button>`
    : '';

  serverChipsContainer.innerHTML = chipsHtml + cleanBtn;

  // 绑定胶囊切换事件
  serverChipsContainer.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (e.target.closest('.chip-delete-btn')) return; // 点叉号不触发切换
      state.selectedServer = chip.getAttribute('data-server');
      renderFilterChips();
      renderContent();
    });
  });

  // 绑定单个删除事件
  serverChipsContainer.querySelectorAll('.chip-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const serverName = btn.getAttribute('data-delete-server');
      if (!confirm(`确定删除无用服务器标签 "${serverName}" 吗？`)) return;

      try {
        await api.deleteServer(serverName);
        showToast(`已删除服务器标签: ${serverName}`, 'success');
        if (state.selectedServer === serverName) state.selectedServer = 'all';
        await loadData();
      } catch (err) {
        showToast(`删除失败: ${err.message}`, 'error');
      }
    });
  });

  // 绑定快捷清理事件
  document.getElementById('btn-quick-cleanup-tags')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const res = await api.cleanUnusedTags();
      const count = (res.removedServers?.length || 0) + (res.removedCategories?.length || 0);
      showToast(`已清理 ${count} 个无用空标签`, 'success');
      state.selectedServer = 'all';
      await loadData();
    } catch (err) {
      showToast(`清理失败: ${err.message}`, 'error');
    }
  });

  // 更新视图切换按钮样式
  document.querySelectorAll('.view-btn').forEach(btn => {
    const mode = btn.getAttribute('data-view');
    if (mode === state.viewMode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// 过滤后的项目列表
function getFilteredItems() {
  return state.items.filter(item => {
    if (state.selectedServer !== 'all' && item.server !== state.selectedServer) {
      return false;
    }
    if (state.selectedCategory !== 'all' && item.category !== state.selectedCategory) {
      return false;
    }
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const matchTitle = (item.title || '').toLowerCase().includes(q);
      const matchUrl = (item.url || '').toLowerCase().includes(q);
      const matchInternal = (item.internalUrl || '').toLowerCase().includes(q);
      const matchDesc = (item.description || '').toLowerCase().includes(q);
      const matchNotes = (item.notes || '').toLowerCase().includes(q);
      const matchServer = (item.server || '').toLowerCase().includes(q);
      const matchCategory = (item.category || '').toLowerCase().includes(q);
      return matchTitle || matchUrl || matchInternal || matchDesc || matchNotes || matchServer || matchCategory;
    }
    return true;
  });
}

// 生成单个项目卡片
function renderItemCard(item) {
  const activeUrl = (state.preferInternal && item.internalUrl) ? item.internalUrl : item.url;
  const isInternalActive = state.preferInternal && Boolean(item.internalUrl);
  const serverColor = getServerColor(item.server);

  const pingInfo = state.pingMap[activeUrl] || { online: null, latency: 0, loading: false };
  let statusClass = 'unknown';
  let statusTitle = '未探活 (点击重新检测)';

  if (pingInfo.loading) {
    statusClass = 'pending';
    statusTitle = '正在检测连通性...';
  } else if (pingInfo.online === true) {
    statusClass = 'online';
    statusTitle = `在线 · 延迟 ${pingInfo.latency}ms (点击刷新)`;
  } else if (pingInfo.online === false) {
    statusClass = 'offline';
    statusTitle = `离线 / 无法连通 (点击重试)`;
  }

  const initial = (item.title || item.url || '?').trim().charAt(0).toUpperCase();
  const iconHtml = item.icon
    ? `<img src="${escapeHtml(item.icon)}" class="card-icon-img" onerror="this.onerror=null;this.parentElement.innerHTML='${initial}';" alt="icon">`
    : initial;

  return `
    <div class="project-card" data-id="${item.id}">
      <div>
        <div class="card-top">
          <div class="card-icon-wrap" style="background: linear-gradient(135deg, ${serverColor}33, ${serverColor}11); border-color: ${serverColor}55;">
            ${iconHtml}
          </div>
          <div class="card-header-text">
            <div class="card-title-row">
              <span class="status-indicator ${statusClass}" title="${statusTitle}" data-ping-url="${escapeHtml(activeUrl)}" data-item-id="${item.id}"></span>
              <a href="${escapeHtml(activeUrl)}" target="_blank" rel="noopener noreferrer" class="card-title" title="${escapeHtml(item.title)}">
                ${escapeHtml(item.title || item.url)}
              </a>
            </div>
            <a href="${escapeHtml(activeUrl)}" target="_blank" rel="noopener noreferrer" class="card-url" title="${escapeHtml(activeUrl)}">
              ${isInternalActive ? '<span style="color:#10b981;">[内网] </span>' : ''}${escapeHtml(activeUrl)}
            </a>
          </div>
        </div>

        <div class="card-desc" title="${escapeHtml(item.description || '暂无描述')}">
          ${escapeHtml(item.description || '暂无详细描述')}
        </div>

        <div class="card-tags">
          <span class="tag-server" style="color: ${serverColor}; border-color: ${serverColor}66;">
            ${escapeHtml(item.server || '未分配')}
          </span>
          <span class="tag-category">
            ${escapeHtml(item.category || '默认分类')}
          </span>
          ${item.internalUrl ? `<span class="tag-category" title="内网地址: ${escapeHtml(item.internalUrl)}" style="cursor:help;">🏠 双通</span>` : ''}
        </div>

        ${item.notes ? `
          <div class="card-notes-drawer" id="notes-${item.id}">
            <button class="notes-copy-btn" data-copy="${escapeHtml(item.notes)}" title="复制备注">复制</button>
            <div class="notes-content">${escapeHtml(item.notes)}</div>
          </div>
        ` : ''}
      </div>

      <div class="card-footer">
        <div class="footer-left">
          ${item.notes ? `
            <button class="btn-card-action btn-toggle-notes" data-target="notes-${item.id}">
              <span>📝 备忘</span>
            </button>
          ` : '<span style="font-size:0.75rem;color:var(--text-faint);">无备忘</span>'}
        </div>
        <div class="footer-right">
          <button class="btn-card-action btn-copy-url" data-url="${escapeHtml(activeUrl)}" title="复制访问网址">
            <span>🔗 链接</span>
          </button>
          <button class="btn-card-action btn-edit-item" data-id="${item.id}" title="编辑项目">
            <span>✏️ 编辑</span>
          </button>
          <button class="btn-card-action danger btn-delete-item" data-id="${item.id}" title="删除项目">
            <span>🗑️</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// 渲染主内容区
function renderContent() {
  const container = document.getElementById('main-content-area');
  if (!container) return;

  const items = getFilteredItems();

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <h3>没有找到匹配的项目</h3>
        <p style="margin-top: 0.5rem; font-size: 0.88rem;">可以尝试清空搜索条件，或者点击上方“+ 添加项目”录入新服务</p>
      </div>
    `;
    return;
  }

  let html = '';

  if (state.viewMode === 'server') {
    const groups = {};
    for (const item of items) {
      const s = item.server || '未分配服务器';
      if (!groups[s]) groups[s] = [];
      groups[s].push(item);
    }

    for (const [serverName, groupItems] of Object.entries(groups)) {
      const serverColor = getServerColor(serverName);
      const serverObj = state.servers.find(s => s.name === serverName);
      const desc = serverObj?.description ? `· ${serverObj.description}` : '';

      html += `
        <div class="group-section">
          <div class="group-header">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${serverColor};box-shadow:0 0 10px ${serverColor}99;"></span>
            <h2 class="group-title">${escapeHtml(serverName)}</h2>
            <span class="group-badge">${groupItems.length} 个服务</span>
            <span class="group-desc">${escapeHtml(desc)}</span>
          </div>
          <div class="cards-grid">
            ${groupItems.map(renderItemCard).join('')}
          </div>
        </div>
      `;
    }
  } else if (state.viewMode === 'category') {
    const groups = {};
    for (const item of items) {
      const c = item.category || '默认分类';
      if (!groups[c]) groups[c] = [];
      groups[c].push(item);
    }

    for (const [catName, groupItems] of Object.entries(groups)) {
      html += `
        <div class="group-section">
          <div class="group-header">
            <h2 class="group-title">🏷️ ${escapeHtml(catName)}</h2>
            <span class="group-badge">${groupItems.length} 个服务</span>
          </div>
          <div class="cards-grid">
            ${groupItems.map(renderItemCard).join('')}
          </div>
        </div>
      `;
    }
  } else {
    html = `
      <div class="cards-grid">
        ${items.map(renderItemCard).join('')}
      </div>
    `;
  }

  container.innerHTML = html;
  bindCardEvents(container);
}

// 绑定卡片交互
function bindCardEvents(container) {
  container.querySelectorAll('.btn-toggle-notes').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const drawer = document.getElementById(targetId);
      if (drawer) drawer.classList.toggle('open');
    });
  });

  container.querySelectorAll('.btn-copy-url').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const u = btn.getAttribute('data-url');
      copyText(u, '网址已复制到剪贴板');
    });
  });

  container.querySelectorAll('.notes-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const t = btn.getAttribute('data-copy');
      copyText(t, '备忘内容已复制');
    });
  });

  container.querySelectorAll('.status-indicator').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = el.getAttribute('data-ping-url');
      if (!url) return;

      state.pingMap[url] = { loading: true };
      renderHeaderStats();
      renderContent();

      try {
        const res = await api.ping(url);
        state.pingMap[url] = {
          online: res.online,
          latency: res.latency,
          status: res.status,
          loading: false
        };
        showToast(res.online ? `探活正常 (${res.latency}ms)` : '服务离线或超时', res.online ? 'success' : 'error');
      } catch (err) {
        state.pingMap[url] = { online: false, latency: 0, loading: false };
        showToast(`探测失败: ${err.message}`, 'error');
      }
      renderHeaderStats();
      renderContent();
    });
  });

  container.querySelectorAll('.btn-edit-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const item = state.items.find(it => it.id === id);
      if (item) openItemModal(item);
    });
  });

  container.querySelectorAll('.btn-delete-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const item = state.items.find(it => it.id === id);
      if (!item) return;

      if (!confirm(`确定要删除项目 "${item.title || item.url}" 吗？`)) return;

      try {
        await api.deleteItem(id);
        state.items = state.items.filter(it => it.id !== id);
        showToast('项目已成功删除', 'success');
        renderHeaderStats();
        renderFilterChips();
        renderContent();
      } catch (err) {
        showToast(`删除失败: ${err.message}`, 'error');
      }
    });
  });
}

// 批量一键探活
async function runPingAll() {
  if (state.isPingingAll) return;
  state.isPingingAll = true;

  const pingBtn = document.getElementById('btn-ping-all');
  if (pingBtn) pingBtn.innerHTML = '⏳ 正在探活...';

  const urlsToPing = state.items.map(it => {
    return (state.preferInternal && it.internalUrl) ? it.internalUrl : it.url;
  }).filter(Boolean);

  for (const u of urlsToPing) {
    state.pingMap[u] = { loading: true };
  }
  renderContent();

  try {
    const res = await api.pingAll(urlsToPing);
    if (res.results) {
      for (const [u, r] of Object.entries(res.results)) {
        state.pingMap[u] = {
          online: r.online,
          latency: r.latency,
          status: r.status,
          loading: false
        };
      }
    }
    showToast('全部服务探活检测完毕', 'success');
  } catch (err) {
    showToast(`批量探活异常: ${err.message}`, 'error');
  } finally {
    state.isPingingAll = false;
    if (pingBtn) pingBtn.innerHTML = '⚡ 一键探活';
    renderHeaderStats();
    renderContent();
  }
}

// 打开添加/编辑模态框
function openItemModal(item = null) {
  state.editingItem = item;
  const modal = document.getElementById('item-modal');
  const titleEl = document.getElementById('item-modal-title');
  const form = document.getElementById('item-form');

  if (!modal || !form) return;

  titleEl.textContent = item ? '编辑项目' : '添加新部署项目';

  document.getElementById('input-url').value = item?.url || '';
  document.getElementById('input-internal-url').value = item?.internalUrl || '';
  document.getElementById('input-title').value = item?.title || '';
  document.getElementById('input-server').value = item?.server || '';
  document.getElementById('input-category').value = item?.category || '';
  document.getElementById('input-description').value = item?.description || '';
  document.getElementById('input-notes').value = item?.notes || '';
  document.getElementById('input-icon').value = item?.icon || '';

  updateDatalists();

  modal.classList.add('open');
  document.getElementById('input-url').focus();
}

function closeItemModal() {
  const modal = document.getElementById('item-modal');
  if (modal) modal.classList.remove('open');
  state.editingItem = null;
}

function updateDatalists() {
  const serverDatalist = document.getElementById('datalist-servers');
  if (serverDatalist) {
    serverDatalist.innerHTML = state.servers.map(s => `<option value="${escapeHtml(s.name)}"></option>`).join('');
  }
  const categoryDatalist = document.getElementById('datalist-categories');
  if (categoryDatalist) {
    categoryDatalist.innerHTML = state.categories.map(c => `<option value="${escapeHtml(c.name)}"></option>`).join('');
  }
}

// 自动抓取网页元数据
async function triggerAutoFetchMeta() {
  const urlInput = document.getElementById('input-url');
  const titleInput = document.getElementById('input-title');
  const descInput = document.getElementById('input-description');
  const iconInput = document.getElementById('input-icon');
  const fetchBtn = document.getElementById('btn-auto-fetch-meta');

  const rawUrl = urlInput.value.trim();
  if (!rawUrl) {
    showToast('请先输入网址', 'error');
    urlInput.focus();
    return;
  }

  if (state.isFetchingMeta) return;
  state.isFetchingMeta = true;

  if (fetchBtn) fetchBtn.innerHTML = '⏳ 抓取中...';

  try {
    const meta = await api.fetchMeta(rawUrl);
    if (meta.title && !titleInput.value.trim()) {
      titleInput.value = meta.title;
    }
    if (meta.description && !descInput.value.trim()) {
      descInput.value = meta.description;
    }
    if (meta.icon && !iconInput.value.trim()) {
      iconInput.value = meta.icon;
    }

    if (meta.success) {
      showToast(`已成功抓取网站标题: ${meta.title}`, 'success');
    } else {
      showToast(`已解析基础信息 (无法直接连通则使用域名兜底)`, 'info');
    }
  } catch (err) {
    showToast(`抓取请求超时或失败: ${err.message}`, 'error');
  } finally {
    state.isFetchingMeta = false;
    if (fetchBtn) fetchBtn.innerHTML = '⚡ 自动抓取';
  }
}

// 保存表单
async function handleSaveItem(e) {
  e.preventDefault();
  const url = document.getElementById('input-url').value.trim();
  const internalUrl = document.getElementById('input-internal-url').value.trim();
  const title = document.getElementById('input-title').value.trim();
  const server = document.getElementById('input-server').value.trim() || '未分配服务器';
  const category = document.getElementById('input-category').value.trim() || '默认分类';
  const description = document.getElementById('input-description').value.trim();
  const notes = document.getElementById('input-notes').value.trim();
  const icon = document.getElementById('input-icon').value.trim();

  if (!url) {
    showToast('网址为必填项', 'error');
    return;
  }

  const payload = { url, internalUrl, title, server, category, description, notes, icon };

  try {
    if (state.editingItem) {
      const res = await api.updateItem(state.editingItem.id, payload);
      const idx = state.items.findIndex(it => it.id === state.editingItem.id);
      if (idx !== -1) state.items[idx] = res.item;
      showToast('项目修改成功', 'success');
    } else {
      const res = await api.createItem(payload);
      state.items.push(res.item);
      showToast('新项目添加成功', 'success');
    }

    await loadData();
    closeItemModal();
  } catch (err) {
    showToast(`保存失败: ${err.message}`, 'error');
  }
}

// 标签与服务器管理弹窗
function openTagsModal() {
  const modal = document.getElementById('tags-modal');
  if (!modal) return;

  const serversListEl = document.getElementById('mgr-servers-list');
  const catListEl = document.getElementById('mgr-categories-list');

  // 渲染服务器列表
  if (serversListEl) {
    if (state.servers.length === 0) {
      serversListEl.innerHTML = '<div style="color:var(--text-faint);font-size:0.85rem;padding:0.5rem;">暂无服务器标签</div>';
    } else {
      serversListEl.innerHTML = state.servers.map(s => {
        const count = state.items.filter(it => it.server === s.name).length;
        return `
          <div class="tag-mgr-item">
            <div class="tag-mgr-left">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color || '#6366f1'};"></span>
              <strong>${escapeHtml(s.name)}</strong>
              <span class="tag-mgr-count">${count} 个项目</span>
            </div>
            <button class="btn-card-action danger btn-del-server-tag" data-server="${escapeHtml(s.name)}" title="删除此服务器标签">
              🗑️ 删除
            </button>
          </div>
        `;
      }).join('');
    }
  }

  // 渲染分类列表
  if (catListEl) {
    if (state.categories.length === 0) {
      catListEl.innerHTML = '<div style="color:var(--text-faint);font-size:0.85rem;padding:0.5rem;">暂无业务分类</div>';
    } else {
      catListEl.innerHTML = state.categories.map(c => {
        const count = state.items.filter(it => it.category === c.name).length;
        return `
          <div class="tag-mgr-item">
            <div class="tag-mgr-left">
              <span>🏷️</span>
              <strong>${escapeHtml(c.name)}</strong>
              <span class="tag-mgr-count">${count} 个项目</span>
            </div>
            <button class="btn-card-action danger btn-del-category-tag" data-cat="${escapeHtml(c.name)}" title="删除此分类">
              🗑️ 删除
            </button>
          </div>
        `;
      }).join('');
    }
  }

  // 绑定弹窗内删除事件
  serversListEl?.querySelectorAll('.btn-del-server-tag').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sName = btn.getAttribute('data-server');
      if (!confirm(`确定要删除服务器标签 "${sName}" 吗？关联的项目将被标记为"未分配服务器"`)) return;
      try {
        await api.deleteServer(sName);
        showToast(`已删除服务器: ${sName}`, 'success');
        await loadData();
        openTagsModal(); // 刷新弹窗
      } catch (err) {
        showToast(`删除失败: ${err.message}`, 'error');
      }
    });
  });

  catListEl?.querySelectorAll('.btn-del-category-tag').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cName = btn.getAttribute('data-cat');
      if (!confirm(`确定要删除分类 "${cName}" 吗？关联的项目将被标记为"默认分类"`)) return;
      try {
        await api.deleteCategory(cName);
        showToast(`已删除分类: ${cName}`, 'success');
        await loadData();
        openTagsModal();
      } catch (err) {
        showToast(`删除失败: ${err.message}`, 'error');
      }
    });
  });

  modal.classList.add('open');
}

function closeTagsModal() {
  const modal = document.getElementById('tags-modal');
  if (modal) modal.classList.remove('open');
}

// 备份弹窗
function openBackupModal() {
  const modal = document.getElementById('backup-modal');
  if (modal) modal.classList.add('open');
}
function closeBackupModal() {
  const modal = document.getElementById('backup-modal');
  if (modal) modal.classList.remove('open');
}

// 工具函数：HTML 转义
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 初始化全局事件
function initEventListeners() {
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      renderContent();
    });
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput?.focus();
    } else if (e.key === '/' && document.activeElement !== searchInput && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      searchInput?.focus();
    } else if (e.key === 'Escape') {
      closeItemModal();
      closeBackupModal();
      closeTagsModal();
    }
  });

  // 项目弹窗
  document.getElementById('btn-add-item')?.addEventListener('click', () => openItemModal());
  document.getElementById('item-modal-close')?.addEventListener('click', closeItemModal);
  document.getElementById('item-modal-cancel')?.addEventListener('click', closeItemModal);
  document.getElementById('item-form')?.addEventListener('submit', handleSaveItem);
  document.getElementById('btn-auto-fetch-meta')?.addEventListener('click', triggerAutoFetchMeta);

  document.getElementById('input-url')?.addEventListener('blur', () => {
    const urlVal = document.getElementById('input-url').value.trim();
    const titleVal = document.getElementById('input-title').value.trim();
    if (urlVal && !titleVal && !state.isFetchingMeta) {
      triggerAutoFetchMeta();
    }
  });

  // 视图模式切换
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.viewMode = btn.getAttribute('data-view');
      renderFilterChips();
      renderContent();
      await api.updateSettings({ defaultView: state.viewMode });
    });
  });

  // 内网模式切换
  document.getElementById('toggle-internal-mode')?.addEventListener('click', async () => {
    state.preferInternal = !state.preferInternal;
    showToast(state.preferInternal ? '已切换为内网直连模式' : '已切换为公网访问模式', 'info');
    renderHeaderStats();
    renderContent();
    await api.updateSettings({ preferInternal: state.preferInternal });
  });

  // 一键探活
  document.getElementById('btn-ping-all')?.addEventListener('click', runPingAll);

  // 标签管理弹窗
  document.getElementById('btn-open-tags')?.addEventListener('click', openTagsModal);
  document.getElementById('tags-modal-close')?.addEventListener('click', closeTagsModal);
  document.getElementById('tags-modal-done')?.addEventListener('click', closeTagsModal);

  // 弹窗内一键清理
  document.getElementById('btn-cleanup-all-tags')?.addEventListener('click', async () => {
    try {
      const res = await api.cleanUnusedTags();
      const count = (res.removedServers?.length || 0) + (res.removedCategories?.length || 0);
      showToast(`已清理 ${count} 个无用空标签`, 'success');
      state.selectedServer = 'all';
      await loadData();
      openTagsModal();
    } catch (err) {
      showToast(`清理失败: ${err.message}`, 'error');
    }
  });

  // 备份与恢复
  document.getElementById('btn-open-backup')?.addEventListener('click', openBackupModal);
  document.getElementById('backup-modal-close')?.addEventListener('click', closeBackupModal);

  document.getElementById('btn-export-backup')?.addEventListener('click', () => {
    window.location.href = api.getExportUrl();
    showToast('备份文件正在下载...', 'success');
  });

  const fileInput = document.getElementById('backup-file-input');
  document.getElementById('btn-import-replace')?.addEventListener('click', () => {
    fileInput.setAttribute('data-mode', 'replace');
    fileInput.click();
  });
  document.getElementById('btn-import-merge')?.addEventListener('click', () => {
    fileInput.setAttribute('data-mode', 'merge');
    fileInput.click();
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const mode = fileInput.getAttribute('data-mode') || 'replace';
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await api.importBackup(parsed, mode);
      showToast(`备份数据${mode === 'merge' ? '增量合并' : '完整恢复'}成功！`, 'success');
      closeBackupModal();
      await loadData();
    } catch (err) {
      showToast(`导入失败: ${err.message}`, 'error');
    } finally {
      fileInput.value = '';
    }
  });

  document.getElementById('btn-reset-default')?.addEventListener('click', async () => {
    if (!confirm('警告：此操作将清空当前数据并恢复为开箱演示数据，确定继续吗？')) return;
    try {
      await api.resetDefault();
      showToast('已成功重置为默认演示数据', 'success');
      closeBackupModal();
      await loadData();
    } catch (err) {
      showToast(`重置失败: ${err.message}`, 'error');
    }
  });

  // 主题切换
  const themeBtn = document.getElementById('btn-toggle-theme');
  const savedTheme = localStorage.getItem('serverhub_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (themeBtn) {
    themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('serverhub_theme', next);
      themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadData();
});
