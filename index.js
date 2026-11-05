addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const MAX_HISTORY = 100 // 历史记录上限

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/') {
    // 主页，提供 HTML 界面
    return new Response(htmlTemplate, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  } else if (path === '/save' && request.method === 'POST') {
    // 保存剪贴板内容（?id=xxx 时为编辑已有历史记录）
    const content = await request.text();
    if (!content) {
      return new Response('内容为空', { status: 400 });
    }
    const editId = url.searchParams.get('id');
    let history = JSON.parse(await JTB.get('history') || '[]');
    if (editId) {
      const item = history.find(h => h.id === editId);
      if (!item) {
        return new Response('记录不存在', { status: 404 });
      }
      item.text = content;
      item.ts = Date.now();
    } else {
      // 与最新记录相同则仅刷新时间，避免重复
      if (history[0] && history[0].text === content) {
        history[0].ts = Date.now();
      } else {
        history.unshift({ id: generateUUID(), ts: Date.now(), text: content });
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
      }
    }
    await JTB.put('clipboard', content);
    await JTB.put('history', JSON.stringify(history));
    return new Response('好的');
  } else if (path === '/read' && request.method === 'GET') {
    // 读取剪贴板内容
    const content = await JTB.get("clipboard");
    if (content) {
      return new Response(content);
    } else {
      return new Response('剪贴板为空', { status: 404 });
    }
  } else if (path === '/history' && request.method === 'GET') {
    // 历史记录列表（返回摘要）
    const history = JSON.parse(await JTB.get('history') || '[]');
    const list = history.map(h => ({ id: h.id, ts: h.ts, preview: h.text.slice(0, 100) }));
    return new Response(JSON.stringify(list), {
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    });
  } else if (path === '/history' && request.method === 'DELETE') {
    // 清空历史记录
    await JTB.delete('history');
    return new Response('好的');
  } else if (path.startsWith('/item/')) {
    // 单条历史记录：GET 读取全文 / DELETE 删除
    const id = path.substring(6);
    const history = JSON.parse(await JTB.get('history') || '[]');
    const idx = history.findIndex(h => h.id === id);
    if (idx < 0) {
      return new Response('记录不存在', { status: 404 });
    }
    if (request.method === 'GET') {
      return new Response(history[idx].text);
    } else if (request.method === 'DELETE') {
      history.splice(idx, 1);
      await JTB.put('history', JSON.stringify(history));
      return new Response('好的');
    }
  } else if (path === '/manifest.json') {
    return new Response(manifestContent, {
      headers: { 'Content-Type': 'application/json' },
    });
  } else if (path === '/share' && request.method === 'POST') {
    // 分享剪贴板内容
    const content = await JTB.get("clipboard");
    if (!content) {
      return new Response('剪贴板为空', { status: 400 });
    }

    const { maxViews, validMinutes } = await request.json();
    const shareId = generateUUID();
    const expireAt = validMinutes ? Date.now() + validMinutes * 60 * 1000 : null;

    await JTB.put(shareId, JSON.stringify({ content, maxViews, expireAt, views: 0 }), { expirationTtl: validMinutes ? validMinutes * 60 : undefined });

    const shareUrl = `${url.origin}/s/${shareId}`;
    return new Response(JSON.stringify({ shareUrl }));
  } else if (path.startsWith('/s/') && request.method === 'GET') {
    // 查看分享的剪贴板内容
    const shareId = path.substring(3);
    const data = await JTB.get(shareId);

    if (!data) {
      return new Response('分享链接无效或已过期', { status: 404 });
    }

    const { content, maxViews, expireAt, views } = JSON.parse(data);

    if (expireAt && Date.now() > expireAt) {
      await JTB.delete(shareId); // 过期则删除
      return new Response('分享链接已过期', { status: 403 });
    }

    if (maxViews && views >= maxViews) {
      await JTB.delete(shareId); // 达到最大查看次数则删除
      return new Response('分享链接已达到最大查看次数', { status: 403 });
    }

    // 更新查看次数
    await JTB.put(shareId, JSON.stringify({ content, maxViews, expireAt, views: views + 1 }));

    return new Response(content);
  }

  // 其他路径返回 404
  return new Response('未找到', { status: 404 });
}

// 生成 UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const manifestContent = `{
  "name": "在线剪贴板",
  "short_name": "剪贴板",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f4f4f4",
  "theme_color": "#007bff",
  "icons": [
    {
      "src": "https://img.xwyue.com/i/2025/01/06/677b63d2572db.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "https://img.xwyue.com/i/2025/01/06/677b63d2572db.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}`;

const htmlTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <title>在线剪贴板</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="https://img.xwyue.com/i/2025/01/06/677b63d2572db.png">

  <!-- iOS 添加到主屏幕的相关设置 -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Paste">
  <link rel="apple-touch-icon" href="https://img.xwyue.com/i/2025/01/06/677b63d2572db.png">
  <link rel="manifest" href="/manifest.json">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.min.css">

  <style>
    body {
      font-family: 'Helvetica Neue', 'Arial', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      transition: background-color 0.5s ease;
    }
    body.dark-mode {
      background: linear-gradient(135deg, #333 0%, #222 100%);
    }
    h1 {
      color: #2980b9;
      margin-bottom: 20px;
      font-size: 2.5em;
      font-weight: 600;
      opacity: 0;
      animation: fadeIn 1s ease-in-out forwards;
    }
    .dark-mode h1 {
      color: #74a7d2;
    }
    .container {
      background-color: rgba(255, 255, 255, 0.85);
      border-radius: 15px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
      padding: 40px;
      width: 90%;
      max-width: 750px;
      margin: 0 auto;
      transition: background-color 0.5s ease;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4 4'%3E%3Cpath fill='%239C92AC' fill-opacity='0.1' d='M1 3h1v1H1V3zm2-2h1v1H3V1z'%3E%3C/path%3E%3C/svg%3E");
    }
    .dark-mode .container {
      background-color: rgba(51, 51, 51, 0.85);
      box-shadow: 0 4px 10px rgba(255, 255, 255, 0.1);
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4 4'%3E%3Cpath fill='%23CCCCCC' fill-opacity='0.1' d='M1 3h1v1H1V3zm2-2h1v1H3V1z'%3E%3C/path%3E%3C/svg%3E");
    }
    .view { display: none; width: 100%; }
    .view.active { display: block; }
    textarea {
      width: calc(100% - 30px);
      height: 375px;
      margin-bottom: 20px;
      padding: 15px;
      border: none;
      border-radius: 10px;
      font-size: 18px;
      resize: vertical;
      color: #333;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
      background-color: #fff;
      overflow: auto;
      transition: box-shadow 0.3s ease;
    }
    .dark-mode textarea {
      color: #eee;
      box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.1);
      background-color: #444;
    }
    textarea:focus {
      outline: none;
      box-shadow: 0 0 5px 2px #2980b9;
    }
    .dark-mode textarea:focus {
      box-shadow: 0 0 5px 2px #74a7d2;
    }
    button {
      background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
      color: white;
      border: 1px solid #2980b9;
      padding: 10px 12px;
      margin: 4px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 15px;
      transition: all 0.2s ease-in-out;
      display: flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    button:hover {
      background: linear-gradient(135deg, #2980b9 0%, #3498db 100%);
      transform: scale(1.05);
    }
    button:active {
      transform: scale(0.95);
      box-shadow: none;
    }
    button i {
      margin-right: 6px;
      font-size: 15px;
    }
    button.danger {
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      border-color: #c0392b;
    }
    button.danger:hover {
      background: linear-gradient(135deg, #c0392b 0%, #e74c3c 100%);
    }
    .button-group {
      display: flex;
      justify-content: center;
    }

    /* 历史记录列表 */
    #historyList {
      max-height: 60vh;
      overflow: auto;
      margin-bottom: 18px;
    }
    .history-item {
      background: #fff;
      border-radius: 8px;
      padding: 12px 15px;
      margin-bottom: 10px;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      transition: all 0.2s;
      position: relative;
    }
    .history-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
    }
    .dark-mode .history-item {
      background: #444;
    }
    .history-item .meta {
      font-size: 12px;
      color: #888;
      margin-bottom: 4px;
    }
    .history-item .preview {
      font-size: 15px;
      color: #333;
      word-break: break-all;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .dark-mode .history-item .preview {
      color: #eee;
    }
    .history-item .del {
      position: absolute;
      top: 8px;
      right: 10px;
      color: #bbb;
      font-size: 16px;
      padding: 4px;
    }
    .history-item .del:hover {
      color: #e74c3c;
    }
    .empty {
      color: #888;
      text-align: center;
      padding: 30px 0;
    }

    /* 媒体查询：针对小屏幕设备 (例如手机) */
    @media (max-width: 768px) {
      .container {
        padding: 20px;
        width: 90%;
      }
      textarea {
        height: 45vh;
        font-size: 16px;
      }
      button {
        padding: 10px 14px;
        font-size: 14px;
      }
      h1 {
        font-size: 2em;
      }
      .button-group {
        flex-wrap: wrap;
      }
    }

    /* 自定义滚动条 */
    ::-webkit-scrollbar {
      width: 10px;
    }
    ::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    .dark-mode ::-webkit-scrollbar-track {
      background: #333;
    }
    .dark-mode ::-webkit-scrollbar-thumb {
      background: #666;
    }
    .dark-mode ::-webkit-scrollbar-thumb:hover {
      background: #999;
    }

    /* 加载动画 */
    .loading {
      position: relative;
      color: transparent !important;
      pointer-events: none;
    }
    .loading::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 4px solid #fff;
      border-color: #fff transparent #fff transparent;
      animation: loading 1.2s linear infinite;
    }
    @keyframes loading {
      0% {
        transform: translate(-50%, -50%) rotate(0deg);
      }
      100% {
        transform: translate(-50%, -50%) rotate(360deg);
      }
    }

    /* 标题动画 */
    @keyframes fadeIn {
      0% {
        opacity: 0;
        transform: translateY(-20px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }
    /*分享*/
    .modal {
      display: none;
      position: fixed;
      z-index: 1;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      overflow: auto;
      background-color: rgba(0, 0, 0, 0.4);
    }
    .modal-content {
      background-color: #fefefe;
      margin: 15% auto;
      padding: 20px;
      border: 1px solid #888;
      width: 80%;
      max-width: 400px;
      border-radius: 10px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
    }
    .dark-mode .modal-content {
      background-color: #444;
      color: #eee;
      border: 1px solid #666;
    }
    .close {
      color: #aaa;
      float: right;
      font-size: 28px;
      font-weight: bold;
    }
    .close:hover,
    .close:focus {
      color: black;
      text-decoration: none;
      cursor: pointer;
    }
    .dark-mode .close:hover,
    .dark-mode .close:focus {
      color: white;
    }
    .modal-content label {
      display: block;
      margin-bottom: 5px;
    }
    .modal-content input,
    .modal-content button {
      width: calc(100% - 20px);
      padding: 10px;
      margin-bottom: 10px;
      border-radius: 5px;
      border: 1px solid #ccc;
    }
    .dark-mode .modal-content input {
        background-color: #333;
        color: #fff;
        border: 1px solid #666;
    }
    .modal-content button {
      width: 100%;
      background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
      color: white;
      border: none;
      cursor: pointer;
    }
    .modal-content button:hover {
      background: linear-gradient(135deg, #2980b9 0%, #3498db 100%);
    }
    #shareLink {
      margin-top: 10px;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <!-- 主界面 -->
  <div id="mainView" class="view active">
    <div class="container">
      <h1>在线剪贴板</h1>
      <textarea id="clipboard" placeholder="在此处粘贴内容..."></textarea>
      <div class="button-group">
        <button id="saveBtn" title="保存到云端"><i class="fas fa-cloud-upload-alt"></i>保存</button>
        <button id="readBtn" title="从云端读取"><i class="fas fa-cloud-download-alt"></i>读取</button>
        <button id="copyBtn" title="复制到本地"><i class="fas fa-copy"></i>复制</button>
        <button id="historyBtn" title="历史记录"><i class="fas fa-history"></i>历史</button>
        <button id="shareBtn" title="分享"><i class="fas fa-share-alt"></i>分享</button>
      </div>
    </div>
  </div>

  <!-- 历史记录 -->
  <div id="historyView" class="view">
    <div class="container">
      <h1>历史记录</h1>
      <div id="historyList"></div>
      <div class="button-group">
        <button id="backBtn"><i class="fas fa-arrow-left"></i>返回</button>
        <button id="clearBtn" class="danger"><i class="fas fa-trash-alt"></i>清空历史</button>
      </div>
    </div>
  </div>

  <!-- 编辑历史记录 -->
  <div id="editView" class="view">
    <div class="container">
      <h1>编辑记录</h1>
      <textarea id="editTextarea" placeholder="加载中..."></textarea>
      <div class="button-group">
        <button id="editBackBtn"><i class="fas fa-arrow-left"></i>返回</button>
        <button id="editSaveBtn"><i class="fas fa-cloud-upload-alt"></i>保存修改</button>
      </div>
    </div>
  </div>

  <div id="shareModal" class="modal">
    <div class="modal-content">
      <span class="close">&times;</span>
      <h2>分享设置</h2>
      <label for="maxViews">最大查看次数 (留空表示无限制):</label>
      <input type="number" id="maxViews" placeholder="例如: 5">
      <label for="validMinutes">有效时间 (分钟，留空表示永久有效):</label>
      <input type="number" id="validMinutes" placeholder="例如: 60">
      <button id="generateShareLink">生成分享链接</button>
      <div id="shareLink"></div>
    </div>
  </div>
  <script>
    const clipboardTextarea = document.getElementById('clipboard');
    const saveBtn = document.getElementById('saveBtn');
    const readBtn = document.getElementById('readBtn');
    const copyBtn = document.getElementById('copyBtn');
    const shareBtn = document.getElementById('shareBtn');
    const shareModal = document.getElementById('shareModal');
    const closeModalBtn = document.querySelector('.close');
    const generateShareLinkBtn = document.getElementById('generateShareLink');
    const shareLinkDiv = document.getElementById('shareLink');
    const historyList = document.getElementById('historyList');
    const editTextarea = document.getElementById('editTextarea');
    let currentEditId = null; // 当前正在编辑的历史记录 ID

    // 自动检测暗黑模式
    function checkDarkMode() {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    }
    checkDarkMode();
    window.matchMedia('(prefers-color-scheme: dark)').addListener(checkDarkMode);

    // 页面加载后自动读取云端最新记录
    (async () => {
      try {
        const response = await fetch('/read');
        if (response.ok) {
          clipboardTextarea.value = await response.text();
        }
      } catch (e) { /* 离线时忽略 */ }
    })();

    // 视图切换
    function showView(name) {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(name + 'View').classList.add('active');
      window.scrollTo(0, 0);
    }

    // 加载历史记录列表
    async function loadHistory() {
      historyList.innerHTML = '<div class="empty">加载中...</div>';
      const response = await fetch('/history');
      const list = await response.json();
      if (!list.length) {
        historyList.innerHTML = '<div class="empty">暂无历史记录</div>';
        return;
      }
      historyList.innerHTML = '';
      list.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = new Date(item.ts).toLocaleString();
        const preview = document.createElement('div');
        preview.className = 'preview';
        preview.textContent = item.preview;
        const del = document.createElement('i');
        del.className = 'fas fa-times del';
        del.title = '删除此条';
        del.onclick = async (e) => {
          e.stopPropagation();
          if (!confirm('确定删除这条记录吗？')) return;
          await fetch('/item/' + item.id, { method: 'DELETE' });
          loadHistory();
        };
        div.append(meta, preview, del);
        div.onclick = () => openItem(item.id);
        historyList.appendChild(div);
      });
    }

    // 打开某条历史记录进行编辑
    async function openItem(id) {
      const response = await fetch('/item/' + id);
      if (!response.ok) {
        alert('记录不存在或已被删除！');
        return;
      }
      currentEditId = id;
      editTextarea.value = await response.text();
      showView('edit');
    }

    historyBtn.addEventListener('click', () => {
      showView('history');
      loadHistory();
    });

    backBtn.addEventListener('click', () => showView('main'));

    editBackBtn.addEventListener('click', () => {
      showView('history');
      loadHistory();
    });

    clearBtn.addEventListener('click', async () => {
      if (!confirm('确定清空所有历史记录吗？此操作不可恢复！')) return;
      await fetch('/history', { method: 'DELETE' });
      loadHistory();
    });

    editSaveBtn.addEventListener('click', async () => {
      const content = editTextarea.value;
      if (!content) {
        alert('内容为空！');
        return;
      }
      editSaveBtn.classList.add('loading');
      const response = await fetch('/save?id=' + currentEditId, { method: 'POST', body: content });
      editSaveBtn.classList.remove('loading');
      if (response.ok) {
        alert('已保存！');
        showView('history');
        loadHistory();
      } else {
        alert('保存失败！');
      }
    });

    saveBtn.addEventListener('click', async () => {
      const content = clipboardTextarea.value;
      if (content) {
        saveBtn.classList.add('loading');
        const response = await fetch('/save', { method: 'POST', body: content });
        saveBtn.classList.remove('loading');
        if (response.ok) {
          alert('已保存到云端！');
        } else {
          alert('保存失败！');
        }
      } else {
        alert('剪贴板为空！');
      }
    });

    readBtn.addEventListener('click', async () => {
      readBtn.classList.add('loading');
      const response = await fetch('/read');
      readBtn.classList.remove('loading');
      if (response.ok) {
        const content = await response.text();
        clipboardTextarea.value = content;
      } else {
        alert('读取失败或剪贴板为空！');
      }
    });

    copyBtn.addEventListener('click', () => {
      clipboardTextarea.select();
      document.execCommand('copy');
      alert('已复制到本地剪贴板！');
    });

    shareBtn.addEventListener('click', () => {
      shareModal.style.display = 'block';
    });

    closeModalBtn.addEventListener('click', () => {
      shareModal.style.display = 'none';
    });

    generateShareLinkBtn.addEventListener('click', async () => {
      const maxViews = document.getElementById('maxViews').value;
      const validMinutes = document.getElementById('validMinutes').value;

      const response = await fetch('/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          maxViews: maxViews ? parseInt(maxViews) : null,
          validMinutes: validMinutes ? parseInt(validMinutes) : null
        })
      });

      if (response.ok) {
        const { shareUrl } = await response.json();
        shareLinkDiv.innerHTML = \`分享链接: <a href="\${shareUrl}" target="_blank">\${shareUrl}</a>\`;
      } else {
        alert('生成分享链接失败！');
      }
    });

    window.onclick = function(event) {
      if (event.target == shareModal) {
        shareModal.style.display = "none";
      }
    }
  </script>
</body>
</html>
`;
