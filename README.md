# Paste - 在线剪贴板

基于 Cloudflare Workers + KV 的在线剪贴板，支持多设备同步文本、历史记录管理与限时分享链接。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kkzdq/paste)

## 功能特性

- **多设备同步**：一个浏览器随时访问你的剪贴板内容
- **剪贴板历史**：每次保存自动存入历史记录（按时间倒序，上限 100 条），随时回看
- **历史编辑**：点击任意一条历史记录即可载入继续编辑，保存后同步更新云端剪贴板
- **灵活管理**：支持删除单条记录或一键清空历史；内容与最新记录相同时自动去重，只刷新时间
- **安全分享**：生成带查看次数上限和有效期的分享链接，到期或超次自动销毁
- **自动暗黑模式**：跟随系统外观自动切换
- **响应式设计**：PC / 手机端体验一致，支持添加到主屏幕（PWA）
- **持久化存储**：数据存于 Cloudflare KV

## 技术栈

- Cloudflare Workers（无服务器函数）
- Cloudflare KV（键值存储，KV 绑定名：`JTB`）
- wrangler 配置（`wrangler.jsonc`，支持一键部署与 Git 自动更新）
- 原生 HTML / CSS / JavaScript + Font Awesome 图标

## 部署

### 方式一：一键部署（推荐，支持自动更新）

1. 点击上方 **Deploy to Cloudflare Workers** 按钮。
2. 登录 Cloudflare 并授权 GitHub 访问，选择本仓库。
3. Cloudflare 会读取仓库中的 `wrangler.jsonc`，自动创建 Worker 和 `JTB` KV 命名空间并完成绑定（如提示确认资源，直接确认即可）。
4. 点击 Deploy 完成，获得访问地址。

通过这种方式部署时，Cloudflare 会连接你的 GitHub 仓库：**之后每次 push 代码到仓库，Cloudflare 都会自动重新构建并部署**，无需手动操作。

### 方式二：手动部署（不自动更新）

1. **创建 Worker**：登录 Cloudflare 控制台 → Workers & Pages → Create application → Create Worker，命名为 `paste`（或其他名称）。

2. **绑定 KV**：进入 Worker 的 Settings → Variables → KV Namespace Bindings → Add binding：
   - Variable name：`JTB`
   - KV namespace：选择已有命名空间或新建一个

3. **部署代码**：打开 Worker 的 Quick edit（在线编辑器），用本仓库 `index.js` 的完整内容替换原代码，点击 Save and deploy。

> 手动粘贴代码的方式不会关联 GitHub，仓库更新后需要自己手动复制粘贴更新。
>
> 已有旧版数据可无缝升级：原 `clipboard` 键继续作为当前剪贴板使用，历史记录从新保存开始累积。

## API 说明

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/save` | 保存内容为当前剪贴板，并写入历史记录（`?id=xxx` 时为编辑指定历史记录） |
| GET | `/read` | 读取当前剪贴板内容 |
| GET | `/history` | 历史记录列表（id、时间、前 100 字摘要） |
| DELETE | `/history` | 清空全部历史记录 |
| GET | `/item/:id` | 读取某条历史记录全文 |
| DELETE | `/item/:id` | 删除某条历史记录 |
| POST | `/share` | 生成分享链接，参数：`maxViews`（最大查看次数）、`validMinutes`（有效期分钟数） |
| GET | `/s/:id` | 访问分享内容 |

## 使用方法

1. 访问 Worker URL，在文本框粘贴内容，点击「保存到云端」——内容会同时存入历史记录。
2. 换设备后点击「从云端读取」即可同步，或点击「复制到本地」。
3. 点击「历史记录」查看所有已保存内容：点击任意一条进入编辑，改完保存即可；也可删除单条或清空全部。
4. 主界面随时可输入新内容另存，不会丢失之前的历史。
5. 点击「分享」生成限时/限次分享链接。

## License

MIT
