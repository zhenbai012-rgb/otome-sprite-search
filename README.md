# 近月立绘搜索

近月少女的礼仪 / 少女理论系列角色立绘检索站。

**网站：<https://zhenbai012-rgb.github.io/otome-sprite-search/>**

- 收录 9,399 张游戏立绘和 7 张有官方出处的公开图片，涵盖 39 位角色。
- 支持角色中文名、日文名、常用简称、服装、镜头、表情代码和文件名搜索。
- 可分享筛选结果和单张图片的链接；手机与电脑均可使用。
- 网页使用透明 WebP 预览。完整原始 PNG 按角色分类放在 [Releases](https://github.com/zhenbai012-rgb/otome-sprite-search/releases/tag/originals-v1)，共 41 个包（39 位角色与 2 个资源组），包含全部差分和校验清单。
- 官方图片保留原始文件，并附来源页和官方图片地址；组合图单独标注。

## 本地运行

无需安装前端依赖，也不需要账号或 API 密钥。

```sh
python -m http.server 8789 --directory dist
```

打开 <http://localhost:8789>。

## 项目结构

```text
dist/                   可直接发布的静态网站
  index.html            页面
  app.js / styles.css   搜索逻辑与样式
  catalog-data.js        角色与官方素材索引
  game-data.js           游戏立绘索引
  assets/               透明网页预览与缩略图
  data/sources.json     官方来源清单
  data/downloads.json   原图包链接与 SHA-256
scripts/                索引生成与完整性检查
.github/workflows/      GitHub Pages 自动部署
```

原始游戏封包、程序、解包缓存、本地绝对路径和账号凭据不在仓库中。图像文件按内容哈希命名，分目录保存。每次推送到 `main` 后会检查全部图片引用，再部署 `dist/`。

验证命令：

```sh
python scripts/check-site.py
node --check dist/app.js
```

`scripts/build-catalog.py --help` 说明如何从外部索引与图片映射更新公共目录。修改索引后也应更新 `dist/data/downloads.json` 中的原图包校验信息。

## 来源与许可

这是非官方资料索引。图片版权属于 Navel 等各原权利人；图片、角色和原作品不适用本项目的代码许可。公开网页素材的出处见网站卡片及 [`dist/data/sources.json`](dist/data/sources.json)。代码以 [MIT](LICENSE) 许可发布。
