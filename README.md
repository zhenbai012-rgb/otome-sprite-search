# 近月立绘搜索

近月少女的礼仪 / 少女理论系列角色立绘检索站。

**网站：<https://zhenbai012-rgb.github.io/otome-sprite-search/>**

- 收录 10,099 张游戏立绘和数张有官方出处的公开图片，涵盖 39 位角色。
- 支持角色中文名、日文名、常用简称、服装、镜头、表情代码和文件名搜索。
- 可分享筛选结果和单张图片的链接；手机与电脑均可使用。
- 角色和背景页面提供动态画面、随机推荐、图片翻页、浏览密度切换和收藏。动态效果可关闭；收藏保存在当前浏览器中。
- 首页提供实时渲染的立体档案阵列，每次从剧情 CG 或场景背景中随机选出 10 张，仅预加载当前和相邻缩略图。预览随档案升起，可点击、拖动或使用方向键切换；手机使用竖屏构图、滑动切图和展开式筛选，最多渲染 120 帧，离屏或切到后台时暂停。图片详情和下载位于下方图库。三维效果基于 [Three.js r183](https://github.com/mrdoob/three.js/tree/r183)，许可证见 `dist/vendor/three/LICENSE.txt`；无法启用 WebGL 时显示平面档案预览。
- 首屏只初始化可见的档案展示，原先被覆盖的静态横幅、人物图、花瓣画布与视差监听已移除。推荐图片、检索列表及完整立绘索引进入对应区域后再加载；分享图片弹窗打开时不在背后初始化 3D。现有场景被弹窗遮住时暂停渲染，平面回退图只在确实需要时读取。
- 网页使用透明 WebP 预览。原尺寸 PNG 按「角色 → 版本 → 服装」细分为 [195 个下载包](https://github.com/zhenbai012-rgb/otome-sprite-search/releases/tag/sprites-named-v1)，同款服装的姿态和表情差分放在一起。角色目录可逐包选择；单张预览直接链接到对应服装包。
- 官方图片保留原始文件，并附来源页和官方图片地址；组合图单独标注。
- 角色检索按游戏立绘、剧情 CG、日文标题 / Logo、标题人物图层及官方素材分类，同时收录 670 张经核对的剧情 CG、12 张日文标题 / Logo 和 11 张标题人物图层。CG 按路线角色整理；露骨成人 CG 不收录。
- 新增作品、类型与画幅筛选。服装选项随角色和作品联动；服装与镜头始终可选，在 CG / 标题模式选用时自动切换到游戏立绘。角色、版本、作品与背景场景使用中文显示，原始日文名称保留为搜索别名或来源信息。
- CG 与标题图片均保留完整原始画布。CG 按场景细分为 287 个包，六部作品各有一个标题资源包（合计 293 包），同时提供单张原尺寸 PNG。标题包包含全部 123 张原始组成图层；部分标题由多层动画构成，按原图层导出。
- [背景图库](https://zhenbai012-rgb.github.io/otome-sprite-search/backgrounds/)收录 652 张独立图片，包含 591 张场景 / 大幅背景和 11 张标题背景。标题背景从角色检索移到此处，保留完整原图与透明图层。可按作品、地点、类别与场景名称搜索，原始代码仍可检索。
- 背景按「作品 → 地点 → 场景」整理，新增樱公馆、巴黎街头、青山天空公寓等地点筛选；下载分为 459 个包（包括 6 个标题背景包），单包不超过 32 MiB。
- 全站 10,751 张图片提供中文显示名与下载文件名。116 张原先归为“作品素材”的 CG 补充了经脚本与画面核对的角色。原始代码仍可搜索，旧分享链接与图片地址继续可用。
- [台词搜索](https://zhenbai012-rgb.github.io/otome-sprite-search/dialogue/)覆盖六部作品，提供 114,620 段中文文本与日文原文。支持片段、简繁、全半角、标点差异、少量错字与空格关键词，可按作品、路线、人物及台词 / 旁白 / 选项筛选。全部匹配位置均可分页查看。
- 点击台词可查看前后文、作品、路线、场景标题、日期、前置选项及对应背景、立绘和头像，并分享定位到该段的链接。共通场景保留多条路线；选项追溯有条件时会标注。只排除游戏明确标记的成人区间，普通回想和同一条路线的其他剧情仍可检索。
- CG 卡片标注线路，线路名也可搜索。打开 CG 后可选择作品、语言及出现位置，查看入口选项和原文，再展开与台词搜索共用的连续阅读、实时画面和组成素材。670 张 CG 均有核对状态：575 张直接对应公开台词帧，89 张通过脚本、场景预载、同场景差分或结尾演出关联；6 张红叶相关图未找到脚本引用，保留待核对标记。间接关联不会冒充本图的准确台词帧，CG 原图与差分仍完整保留。

## 批量命名

维护 [`scripts/naming-rules.json`](scripts/naming-rules.json)，然后运行：

```sh
python scripts/name-catalog.py
python scripts/check-naming.py
python scripts/stamp-assets.py
```

背景按场景族设置一次名称，自动覆盖同地点的全部差分和六部作品中的引用；现有 122 个场景族。195 组立绘服装各维护一条规则，再从角色、版本、服装和差分字段生成名称，例如 `樱小路露娜_米色校服_远景_姿态01_表情01.png`。CG 使用角色与场景描述，没有确认的事件名称使用场景编号。

网页、搜索、单张下载、场景包及来源清单同步更新。完整映射可下载 [`dist/data/naming-index.csv`](dist/data/naming-index.csv)，含资源 ID、中文名、下载名、作品、原始代码和资源路径。场景描述用于检索，不冒充官方 CG 标题。未确认名称的服装保留编号。

存储路径与资源 ID 保持稳定。立绘服装包内使用中文文件夹与图片名；GitHub Release 的 ZIP 地址沿用 ASCII 名称。以后修改命名规则，可用已有 PNG 包重新命名，无需再次解包游戏或处理像素：

```sh
python scripts/repack-sprite-names.py INPUT_ZIP_DIRECTORY EMPTY_OUTPUT_DIRECTORY
```

该步骤复制原有 PNG 字节，核对每张图片的 SHA-256、分包归属与 ZIP 完整性，输出新的公共分包清单；重新上传后同步清单即可。

## 本地运行

无需安装前端依赖，也不需要账号或 API 密钥。

```sh
python scripts/prepare-previews.py
python -m http.server 8789
```

打开 <http://localhost:8789/dist/>。

台词检索位于 `/dist/dialogue/`。中文索引随 Pages 发布；日文索引、场景上下文和素材目录保存在 `dialogue-data/`，构建时用 `python scripts/prepare-dialogue-data.py` 复制到网站内，按需读取并校验内容哈希。匹配在浏览器的独立工作线程内进行，查询内容不上传。详情页资料和头像缩略图均与网站同源；完整头像保存在 `dialogue-assets/`，保持画布与透明通道。

结果中的正文独立滚动，向上、向下分批接续文本，插入前文时保持阅读位置。可确认的唯一前后场景会连续接入，多条分支列出入口供选择，不按文件名猜测剧情次序。可返回命中原句或当前场景开头；手机默认显示正文，可用「画面」切换素材和选项。`reading.json` 由已有公开文本及原版控制脚本生成，不复制正文、不改动现有搜索索引；单独更新时运行 `python scripts/dialogue/reading.py --texts <本地 texts.json>`（或用 `--routes` 读取已更新的路线元数据）。

台词画面使用浏览器 SVG 实时合成现有背景、立绘和原版对话框，支持坐标、锚点、缩放、翻转、层级、透明度、色调与基础镜头缩放，不保存逐句截图。图库立绘已裁去透明边，渲染通过原图的 alpha 边界恢复完整画布位置。原始边界由 `SpriteBoundsTool.cs` 在内存中读取游戏资源并核验原文件哈希，结果保存在私有 `sprite-bounds.jsonl`；`attach-render-assets.py --input <提取目录>` 可单独更新公开素材目录。原版共享对话框使用 `build-ui.py` 转换并验证透明通道，保存在 `dist/dialogue/ui/`。复杂三维演出及无法唯一确定的分支标为近似，可选择分支画面；放大预览支持左右键逐句查看。

文本整理使用 `scripts/dialogue/compile.py`，输入本地静态提取的原版和汉化文本，不运行游戏程序。按作品、语言导出的原始脚本及逐段「台词与画面.csv」保存在输入目录的 `整理文本/`，不发布未过滤的本地文本。旧版汉化资源分别用 CP932 读取引擎指令、GBK 读取译文，恢复自定义字体的姓名与语音分隔符；新版本保留 UTF-8 / UTF-16。

画面由引擎资源路径、增量指令、可见性与条件分支追踪，并按最新封包的原始哈希连接到图库。后日谈与番外同时读取 AVG2 / include2 初始化；先运行 `extract-layout-context.py --input <提取目录>` 补齐私有引擎配置，再编译文本。`map-gallery-pixels.py --input <提取目录>` 可按解码后的尺寸及 RGBA 哈希核对已有公开 CG，只有逐像素相同的资源才补上关联。文件结尾的清屏不覆盖上一句的画面，头像按脚本状态保留，不根据说话人名称或旁白额外过滤；缺少坐标时使用原版对话框的头像位置。超长台词在原对话框内分页，工具栏切换页码，放大后也可用 PageUp / PageDown；正文始终保留完整原文。

自动头像读取原版 Face_RepID / Face_RepFile / Face_PosList 规则，按当前说话人和已载入立绘的服装、表情选择对应头像。场外人物的隐藏立绘也参与头像选择；自动模式下明确指定的头像优先用于当前一句，下一句恢复自动切换。按原版 disp:once / keep 控制单句与持续显示，保留已载入的头像状态。头像选择在编译时完成，浏览器直接合成已有素材。场景首句不借用下一句才出场的人物。

无法唯一判定的分支会列出候选素材；尚未匹配的演出图层或动态跳转会提示，详情不是游戏画面的完整重放。路线入口由控制脚本解析，前置选项不自动当作唯一攻略。`node scripts/audit-dialogue-visuals.cjs` 可按作品统计空白预览及缺失原因。

CG 与剧情的反向索引由 `python scripts/build-cg-story.py` 从已过滤的场景资料生成；首次更新原脚本证据可加 `--input <本地提取目录>`。`scripts/cg-script-references.json` 仅保存相对脚本位置、资源指令及控制流程证据，不复制完整脚本。编译文本或更新 CG 后运行生成器，再运行 `python scripts/stamp-assets.py`。`node scripts/check-cg-story.cjs` 检查全部 CG 跳转、原文边界、素材分支和引用证据。剧情索引只在打开 CG 时载入，阅读器只在展开时载入，不生成逐帧图片。

简繁归一使用 [OpenCC](https://github.com/BYVoid/OpenCC) 的 `TSCharacters` 字表，原字表与 Apache 2.0 许可证保存在 `dist/vendor/opencc/`。

如需本地测试背景原图和场景包，从仓库根目录运行 `python -m http.server 8791`，打开 <http://localhost:8791/dist/backgrounds/>。背景原图在 `originals/backgrounds/`，与网页预览分开保存；公开网站通过仓库原图地址读取。

## 项目结构

```text
dist/                   可直接发布的静态网站
  index.html            页面
  app.js / styles.css   搜索逻辑与样式
  experience.js / experience.css  页面互动与视觉样式
  archive-stage.js / archive-stage.css  互动档案
  archive-scene.js / vendor/three/  三维场景及 Three.js 许可证
  mobile.css / mobile-ui.js  移动端布局、触屏筛选与滑动预览
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
  dialogue/             台词页面、中文索引、匹配工作线程与头像缩略图
dialogue-data/          日文索引、场景详情、素材映射与覆盖报告
dialogue-assets/        台词中实际使用的完整头像预览
originals/backgrounds/  641 张原尺寸 PNG，按内容哈希保存
originals/cg/           CG 与标题素材的 793 张原尺寸 PNG
cg-assets/              完整画布的 CG / 标题 WebP 预览与缩略图
scripts/                索引生成与完整性检查
.github/workflows/      GitHub Pages 自动部署
```

原始游戏封包、程序、解包缓存、本地绝对路径和账号凭据不在仓库中。图像文件按内容哈希命名，分目录保存。每次推送到 `main` 后会检查全部图片引用，再部署 `dist/`。

验证命令：

```sh
python scripts/prepare-previews.py
python scripts/check-site.py
python scripts/check-backgrounds.py
python scripts/check-artwork.py
python scripts/check-naming.py
python scripts/check-dialogue.py
python scripts/test-dialogue-compiler.py
node scripts/test-dialogue-search.cjs
node --check dist/app.js
node --check dist/experience.js
node --check dist/archive-stage.js
node --check dist/mobile-ui.js
node --check --input-type=module < dist/archive-scene.js
node --check dist/backgrounds/app.js
node --check dist/backgrounds/zip-store.js
node --check dist/artwork-downloads.js
```

`scripts/build-catalog.py --help` 说明如何从外部索引与图片映射更新公共目录。修改索引后也应更新 `dist/data/downloads.json` 中的原图包校验信息。

`scripts/update-costume-packs.py costume-packs.json` 可将 Release 的公共分包清单同步到网页，并核对所有立绘恰好归入一个服装包。此前的整角色下载包保留在 `originals-v1` Release。

`python scripts/classify-title-assets.py` 按素材类别生成标题背景索引，不复制原图；修改后运行 `python scripts/stamp-assets.py` 更新入口页的缓存版本。

## 来源与许可

这是非官方资料索引。图片版权属于 Navel 等各原权利人；图片、角色和原作品不适用本项目的代码许可。公开网页素材的出处见网站卡片及 [`dist/data/sources.json`](dist/data/sources.json)。代码以 [MIT](LICENSE) 许可发布。
