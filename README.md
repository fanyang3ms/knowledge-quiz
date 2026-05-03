# 知识记忆 PWA

暗黑科技风格的渐进式 Web App，帮你巩固从读书 / 播客中积累的知识。

## 在线访问

部署到 GitHub Pages 后，访问：`https://<你的用户名>.github.io/<仓库名>/`

## 功能

- 📚 **知识库** — 8 种富展示形式的知识卡片（表格 / 柱图 / 流程图 / 公式 / Checklist / 对比 / 大数字 / 文字）
- ✏️ **刷题** — 选择题 + 判断题，按主题或随机出题
- 🔁 **错题本** — 自动收集错题，支持专项练习
- 📊 **统计** — 各主题正确率、连续打卡天数
- 🧠 **间隔重复** — SM-2 算法调度复习
- ⚙️ **可配置** — 每次测验题数可调
- 📱 **可装到手机桌面** — PWA，完全离线运行

## 本地运行

```bash
python -m http.server 8000
```

打开 `http://localhost:8000`。

## 部署到 GitHub Pages

仓库 Settings → Pages → Source 选 `Deploy from a branch` → Branch 选 `main` / 路径 `/ (root)` → Save。
等 1-2 分钟，访问 `https://<用户名>.github.io/<仓库名>/`。

## 数据存储

- 题库 / 卡片：随 App 加载，由 Service Worker 离线缓存
- 答题记录 / 统计 / 错题：浏览器 LocalStorage（绑定到域名 + 浏览器）

> 部署到 GitHub Pages 后，URL 是固定域名，数据不会因为电脑换 IP 而丢失。
