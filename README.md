<div align="center">

# 🌐 ServerHub

**多服务器已部署项目聚合导航与轻量运维资产管理平台**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![Zero-Dependency](https://img.shields.io/badge/Dependencies-Zero-brightgreen.svg)](package.json)

*专为拥有多台云服务器、VPS、家庭 NAS 或自建内网主机的开发者打造的高颜值开箱即用聚合面板。*

[功能特性](#-核心特性) • [快速上手](#-快速上手) • [Docker 部署](#-docker-部署) • [脱敏与安全备份](#-数据脱敏与安全备份)

</div>

---

## 🌟 核心特性

- 🏷️ **多服务器与多分类双视角**
  - **服务器维度**：每个项目绑定所属服务器标签（如 `阿里云香港`、`腾讯云广州`、`甲骨文首尔`、`家庭NAS`、`serv00` 等），支持自定义机器主题色与说明。
  - **灵活标签管理**：支持一键清理所有 (0) 个项目的空标签，支持自由删除、重命名服务器与分类。
  - **一键切换视图**：支持【按服务器分组】、【按分类分组】以及【无分组平铺】三种展示模式。
- ⚡ **极简录入与智能抓取**
  - **必填项仅有网址 (URL)**，其余信息全自动获取或自由选填。
  - **自动抓取网页元数据**：输入网址后失焦或点击「⚡ 自动抓取」，服务端自动解析目标站点的 `<title>`、`og:title`、描述和 Favicon 图标。
  - **网络兼容性**：支持内网自签名证书忽略、UTF-8 / GBK 编码智能解码与 4.5 秒严格超时保护。
- 🏠 **内网 / 公网双通道直连**
  - 支持为项目同时配置公网域名和内网直连地址（如 `192.168.1.x` 或 Tailscale/WireGuard IP）。
  - 顶部开关一键在「🌐 公网访问模式」与「⚡ 内网直连模式」之间切换。
- 📝 **运维备忘抽屉 (Notes)**
  - 每个项目卡片内置可展开的运维备注抽屉，存放映射端口、宿主机目录、反向代理提示、账号备忘等。
  - 支持一键快捷复制，兼具书签导航与服务器运维知识库功能。
- 🟢 **服务健康在线探活 (Health Check)**
  - 卡片直观展示状态灯（绿色在线 / 红色离线 / 黄色检测中 / 灰色未探活）。
  - 支持单卡片点击探活，也支持顶部「⚡ 一键探活」高并发批量检测全网服务并返回毫秒延迟。
- 💾 **一键导入导出与灾备恢复**
  - **全量导出**：一键生成带时间戳的标准 `serverhub_backup_*.json` 文件。
  - **灵活导入**：支持「覆盖恢复 (Replace)」与「增量合并 (Merge)」，换服务器或重装环境 1 秒恢复。
- 🚀 **零依赖与极简自包含架构**
  - 原生 Node.js 全栈构建，**无需 `npm install` 任何重型第三方库**，源码极简、启动耗时 0.05 秒。
  - 数据采用原子化写入单一 JSON 文件 (`data/projects.json`)，复制文件即可完成整站迁移。

---

## 🚀 快速上手

### 方式一：本地 / 服务器直接运行 (推荐，需 Node.js 18+)

```bash
# 1. 克隆代码仓库
git clone https://github.com/qingshanh/ServerHub.git
cd ServerHub

# 2. 启动服务 (零依赖，无需 npm install)
node server.js
```

启动后在浏览器打开：`http://localhost:3000`

若要指定端口或自定义监听地址：
```bash
PORT=8080 node server.js
```

---

## 🐳 Docker 部署

### 使用 Docker Compose (推荐)

创建或使用项目根目录的 `docker-compose.yml`：

```yaml
version: "3.8"

services:
  serverhub:
    image: node:22-alpine
    container_name: serverhub
    restart: unless-stopped
    working_dir: /app
    volumes:
      - ./:/app
      - ./data:/app/data
    ports:
      - "3000:3000"
    command: node server.js
    environment:
      - PORT=3000
      - HOST=0.0.0.0
      - TZ=Asia/Shanghai
```

运行命令：
```bash
docker-compose up -d
```

---

## 📂 项目结构

```text
├── data/
│   ├── projects.example.json # 脱敏演示模板（提交至仓库作为默认范例）
│   └── projects.json         # 用户真实本地持久化数据（已被 .gitignore 忽略保护）
├── public/
│   ├── css/
│   │   └── style.css         # 现代 Glassmorphism 设计系统（支持深色/明亮模式）
│   ├── js/
│   │   ├── api.js            # 前后端 API 通信层
│   │   └── app.js            # 响应式前端交互、快捷键检索与弹窗管理
│   ├── favicon.svg           # 品牌矢量图标
│   └── index.html            # 主界面单页
├── src/
│   ├── meta-fetcher.js       # 网页标题、描述与 Favicon 抓取解析器
│   ├── pinger.js             # 服务健康与延迟探测器
│   └── store.js              # 数据安全持久化与 CRUD 存储层
├── test/
│   └── verify.js             # 自动化测试与接口验证套件
├── server.js                 # 原生 HTTP 服务入口（内置端口冲突自动递增）
├── Dockerfile                # 轻量 Alpine 容器镜像定义
├── docker-compose.yml        # 一键编排文件
├── package.json              # 项目元信息
├── LICENSE                   # MIT 开源许可证
└── README.md                 # 项目文档
```

---

## 🔒 数据脱敏与安全备份

1. **隐私安全隔离**：
   - 本项目通过 `.gitignore` 默认排除了 `data/projects.json`。
   - 用户添加的私有服务器域名、局域网内网 IP、管理账号与运维备忘**绝不会被误提交至 Git 仓库**。
2. **灾备与迁移**：
   - 随时在网页右上角点击「💾 备份/导入」->「下载备份 JSON 文件」。
   - 在新机器上启动 ServerHub 后，点击「覆盖恢复」上传即可秒级恢复所有项目。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
