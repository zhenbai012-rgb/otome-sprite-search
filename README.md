# 近月立绘搜索

近月少女的礼仪 / 少女理论系列角色立绘检索站。

**网站：<https://zhenbai012-rgb.github.io/otome-sprite-search/>**

- 收录 9,399 张游戏立绘和 7 张有官方出处的公开图片，涵盖 39 位角色。
- 支持角色中文名、日文名、常用简称、服装、镜头、表情代码和文件名搜索。
- 可分享筛选结果和单张图片的链接；手机与电脑均可使用。
- 角色和背景页面提供动态画面、随机推荐、图片翻页、浏览密度切换和收藏。动态效果可关闭；收藏保存在当前浏览器中。
- 网页使用透明 WebP 预览。原尺寸 PNG 按「角色 → 版本 → 服装」细分为 [195 个下载包](https://github.com/zhenbai012-rgb/otome-sprite-search/releases/tag/sprites-costumes-v1)，同款服装的姿态和表情差分放在一起。角色目录可逐包选择；单张预览直接链接到对应服装包。
- 官方图片保留原始文件，并附来源页和官方图片地址；组合图单独标注。
- 角色检索按游戏立绘、剧情 CG、日文标题 / Logo、标题人物图层及官方素材分类，同时收录 670 张经核对的剧情 CG、12 张日文标题 / Logo 和 11 张标题人物图层。CG 按路线角色整理；露骨成人 CG 不收录。
- 新增作品、类型与画幅筛选。服装选项随角色和作品联动；服装与镜头始终可选，在 CG / 标题模式选用时自动切换到游戏立绘。角色、版本、作品与背景场景使用中文显示，原始日文名称保留为搜索别名或来源信息。
- CG 与标题图片均保留完整原始画布。CG 按场景细分为 287 个包，六部作品各有一个标题资源包（合计 293 包），同时提供单张原尺寸 PNG。标题包包含全部 123 张原始组成图层；部分标题由多层动画构成，按原图层导出。
- [背景图库](https://zhenbai012-rgb.github.io/otome-sprite-search/backgrounds/)收录 652 张独立图片，包含 591 张场景 / 大幅背景和 11 张标题背景。标题背景从角色检索移到此处，保留完整原图与透明图层。可按作品、类别与场景代码搜索。
- 背景按「作品 → 类别 → 场景」细分为 459 个包（包括 6 个标题背景包）；较大的场景继续分为不超过 32 MiB 的小包。浏览器读取所选原图后生成 ZIP，包含清单与原尺寸 PNG，也可单张下载。

## 本地运行

无需安装前端依赖，也不需要账号或 API 密钥。

```sh
python -m http.server 8789
```

打开 <http://localhost:8789/dist/>。

如需本地测试背景原图和场景包，从仓库根目录运行 `python -m http.server 8791`，打开 <http://localhost:8791/dist/backgrounds/>。背景原图在 `originals/backgrounds/`，与网页预览分开保存；公开网站通过仓库原图地址读取。

## 项目结构

```text
dist/                   可直接发布的静态网站
  index.html            页面
  app.js / styles.css   搜索逻辑与样式
  experience.js / experience.css  页面互动与视觉样式
  catalog-data.js        角色与官方素材索引
  game-data.js           游戏立绘索引
  cg-data.js             CG、日文标题与场景分包索引
  artwork-downloads.js   原尺寸 PNG 与场景 ZIP 下载
  gallery-nav.css        页面中间的固定图库切换
  backgrounds/title-data.js  标题背景与按作品分包索引
  assets/               透明网页预览与缩略图
  data/sources.json     官方来源清单
  data/downloads.json   原图包链接与 SHA-256
  data/costume-packs.json  195 个服装分包与 SHA-256
  backgrounds/          背景检索、WebP 预览与场景分包索引
originals/backgrounds/  641 张原尺寸 PNG，按内容哈希保存
originals/cg/           CG 与标题素材的 793 张原尺寸 PNG
cg-assets/              完整画布的 CG / 标题 WebP 预览与缩略图
scripts/                索引生成与完整性检查
.github/workflows/      GitHub Pages 自动部署
```

原始游戏封包、程序、解包缓存、本地绝对路径和账号凭据不在仓库中。图像文件按内容哈希命名，分目录保存。每次推送到 `main` 后会检查全部图片引用，再部署 `dist/`。

验证命令：

```sh
python scripts/check-site.py
python scripts/check-backgrounds.py
python scripts/check-artwork.py
node --check dist/app.js
node --check dist/experience.js
node --check dist/backgrounds/app.js
node --check dist/backgrounds/zip-store.js
node --check dist/artwork-downloads.js
```

`scripts/build-catalog.py --help` 说明如何从外部索引与图片映射更新公共目录。修改索引后也应更新 `dist/data/downloads.json` 中的原图包校验信息。

`scripts/update-costume-packs.py costume-packs.json` 可将 Release 的公共分包清单同步到网页，并核对所有立绘恰好归入一个服装包。此前的整角色下载包保留在 `originals-v1` Release。

`python scripts/classify-title-assets.py` 按素材类别生成标题背景索引，不复制原图；修改后运行 `python scripts/stamp-assets.py` 更新入口页的缓存版本。

## 来源与许可

这是非官方资料索引。图片版权属于 Navel 等各原权利人；图片、角色和原作品不适用本项目的代码许可。公开网页素材的出处见网站卡片及 [`dist/data/sources.json`](dist/data/sources.json)。代码以 [MIT](LICENSE) 许可发布。
