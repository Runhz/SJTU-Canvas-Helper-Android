# Canvas 随行安卓端：工作台架构与功能排布实施方案

日期：2026-10-28  
适用版本：安卓端 0.8.x 之后的重构线  
目标：在保留录播、课件、作业、AI、手机/平板分栏和玻璃水池的基础上，引入 Dela 中真正有价值的能力，并重做数据层、AI 上下文和界面排布。

## 1. 先确定方向

这不是把 Dela 复刻到安卓端，也不是把安卓端变成通用桌面 Agent。安卓端仍然应该是一款“围绕课程学习过程组织信息”的应用：用户从课程、录播、字幕或课件进入，能够在同一条学习工作流里阅读、提问、记笔记、完成作业和回到原位置。

Dela 当前公开功能包括 Canvas 资料、校园邮箱、课堂回看、课表日历、TODO、水源社区和跨项目/会话/邮件/课程资料的全局搜索；它的内核还把领域能力拆成 Skills，并把 GUI 预览和 Agent 文档读取分成两条路径。[Dela README](https://github.com/Chang-Yo/Dela#readme) 这套拆法值得借鉴。Dela 使用 Electron、SQLite、IMAP/SMTP 和独立文档运行时，依赖规模也说明邮件、文档和社区不是“增加一个页面”就结束的功能。[Dela package.json](https://raw.githubusercontent.com/Chang-Yo/Dela/main/package.json)

本方案的核心原则是：

1. **学习主线优先。** 邮件、社区和日程服务课程学习，不把它们变成互相独立的六个应用。
2. **同一份数据只有一个来源。** 课程、课件、字幕、对话、笔记和待办不再分别保存一份互不认识的副本。
3. **预览与 AI 阅读分离。** 用户看到的是 Canvas 平台预览；AI 使用带版本号和证据范围的本地准备结果，不为了读文件在 APK 内嵌完整 Office 引擎。
4. **默认少加载，按需扩大。** 不自动把整堂字幕、整份 PPT 或所有课程文件塞进每次请求，用户明确选择后才扩大范围。
5. **界面保持克制。** 只保留一个主操作、一个明确的返回路径和一套共享组件；信息密度由层级和空间控制，而不是堆按钮。

## 2. 现有安卓端的真实起点
当前项目是 Tauri 2 + React + Rust + Kotlin：

```text
React（demo/src）
  ├─ 页面、播放器、课件、AI、搜索、分栏和水池 UI
  ├─ localStorage：页面状态、账号外壳、偏好、部分课程快照
  └─ IndexedDB：AI 对话历史、学习资料库、部分可恢复状态

Rust（src-tauri/src）
  ├─ Canvas 请求、作业/课程/录播、AI 传输
  ├─ PDF/Office 文字读取、页面图像和资料上下文
  ├─ learning_context：技能选择、系统提示、上下文裁剪
  └─ native_call：安卓原生能力桥

Kotlin（src-tauri/gen/android）
  ├─ WebView 登录、播放器、平台预览、系统文件和分享
  ├─ DownloadManager 下载任务和删除
  ├─ WorkManager/通知/传感器/截图
  └─ SecureStore 与少量 SQLite（目前主要是下载任务）
```

这套结构已经能支撑当前版本，但新增邮件、搜索、课表、社区和文档能力后会出现四类问题：

- 同一个文件的版本、阅读结果和对话附件可能分别存在不同存储里，退出对话后又重新提取。
- 页面级搜索无法产生统一的“来源、课程、页码、时间点、打开动作”。
- Canvas 作业、本机日程、AI 建议和提醒没有共同的待办对象。
- MUI、手写 CSS、播放器控件和页面级按钮各自决定颜色、圆角和反馈，功能增加后视觉会继续分裂。

因此需要先改“共同基础”，再按功能接入，而不是逐页继续打补丁。

## 3. 目标架构

### 3.1 分层图

```text
┌─────────────────────────────────────────────────────────┐
│ UI Shell：总览 / 课程 / 学习 / 助手 / 更多               │
│ 统一导航、分栏、预览层、通知、搜索入口、设计 Token       │
└─────────────────────────┬───────────────────────────────┘
                          │ typed commands / events
┌─────────────────────────▼───────────────────────────────┐
│ Use Cases（只编排，不直接请求网络）                     │
│ OpenResource · AskAI · Search · Sync · MarkTodo · Note   │
└──────────────┬───────────────────┬──────────────────────┘
               │                   │
┌──────────────▼────────────┐  ┌───▼───────────────────────┐
│ Domain adapters            │  │ AI Context & Skills       │
│ Canvas / mail / timetable  │  │ source manifest           │
│ Shuiyuan / documents       │  │ evidence / scope / budget │
└──────────────┬────────────┘  │ teaching skills / summary │
               │               └───┬───────────────────────┘
┌──────────────▼───────────────────▼────────────────────────┐
│ WorkspaceStore（Rust + SQLite，版本化迁移）               │
│ 课程、文件、版本、证据、字幕、会话、笔记、待办、邮件、   │
│ 社区、搜索索引、同步任务、布局状态和通知                 │
└─────────────────────────┬────────────────────────────────┘
                          │ IPC
┌─────────────────────────▼────────────────────────────────┐
│ Android platform services（Kotlin）                      │
│ Keystore / WorkManager / DownloadManager / WebView /     │
│ Media3 / Notification / Share / sensor / file picker      │
└──────────────────────────────────────────────────────────┘
```

### 3.2 存储边界

新增 `WorkspaceStore`，建议放在 Rust 层，用 SQLite（Android 使用 bundled SQLite），原因是当前业务请求和 AI 上下文已经在 Rust，避免把同一套课程/资料逻辑再复制到 Kotlin。Kotlin 只保留系统服务和需要 Android 生命周期的能力。

存储职责如下：

| 数据 | 新的唯一来源 | localStorage/IndexedDB 的处理 |
| --- | --- | --- |
| 账号索引、课程、文件元数据、作业、日程、下载索引 | WorkspaceStore | 首次启动迁移，之后只读 UI 快照 |
| 文件正文、PDF 页图、字幕分段、解析证据 | WorkspaceStore + 文件缓存目录 | 不再把正文塞进 localStorage；IndexedDB 旧数据迁移后保留只读兼容 |
| AI 会话、轮次、草稿、追问、笔记链接 | WorkspaceStore | 保留现有 key 作为迁移入口，写入统一表 |
| 临时输入框、当前展开状态、动画偏好 | UI 本地状态 | 可以继续用 localStorage |
| 下载实际文件 | Android app-specific files + DownloadManager | Store 只保存任务、版本、路径和状态 |
| 凭据、Cookie、模型 Key | Android Keystore/SecureStore | 绝不进入 Store、日志或 AI 上下文 |

Store 需要带 `schema_version`、迁移日志和账号作用域。所有资源都使用 `account_id + source + remote_id + version` 做唯一键，不能只用文件名。

### 3.3 统一对象模型

```text
Course(id, accountId, code, title, term, teacher, updatedAt)
Resource(id, courseId, kind, name, mime, remoteUrl, version, size, previewState)
ResourceEvidence(id, resourceId, version, kind, page, range, text, imagePath,
                 warning, createdAt)
Transcript(id, recordingId, version, startMs, endMs, text, speaker)
Conversation(id, scope, title, sourceKind, sourceId, updatedAt, summary)
ConversationTurn(id, conversationId, role, text, reasoningSummary, sourceRefs, createdAt)
Note(id, scope, title, body, sourceRefs, positionMs, page, updatedAt)
TodoItem(id, scope, source, courseId, assignmentId, title, dueAt, status,
         editable, calendarEventId, updatedAt)
MailMessage(id, accountId, folder, remoteId, threadId, subject, sender,
            preview, bodyPath, readAt, receivedAt, hasAttachments)
CommunityTopic(id, source, remoteId, category, title, excerpt, bodyPath,
               author, updatedAt, unread)
SearchDocument(id, scope, kind, title, body, anchor, updatedAt)
SyncJob(id, scope, kind, state, attempts, nextRunAt, lastError)
LayoutState(id, scope, deviceClass, json, updatedAt)
```

`sourceRefs` 不保存不可重复获取的签名 URL，而是保存可重新定位的引用：`resourceId`、文件版本、页码、字幕时间范围、录播 ID 或笔记 ID。这样对话可以在退出、升级和重新登录后继续，而不会因为临时 URL 失效而变成空壳。

## 4. 重新排布后的产品结构

### 4.1 手机一级导航

手机底部只保留五个入口：

1. **总览**：今日待办、继续学习、水池、最近对话和最近文件。顶部搜索和通知只在这里出现。
2. **课程**：课程列表，进入后统一看到资料、作业、录播三个分区。
3. **学习**：最近录播、播放器、字幕、课件和时间轴笔记。打开对象后优先回到上次位置。
4. **助手**：所有 AI 对话、资料篮、技能选择、提炼笔记和可继续追问的问题。
5. **更多**：邮件、课表/待办、下载、水源社区、头像和设置。

邮件、日程和社区不适合占用学习主导航的固定位置，但它们仍然有明确入口；用户可以在“更多”里将常用入口固定到总览快捷区。

### 4.2 平板与横屏

平板或手机横屏满足可用宽度后进入工作台模式：

```text
左栏：对象列表或课程导航
右栏：当前对象详情、播放器、课件或助手
底部：当前栏切换 / 分栏开关 / 任务状态
```

选择左栏或右栏后，导航操作只替换当前栏，另一栏保持原页面和滚动位置。进入录播时，视频、课件和字幕使用同一个 `LearningWorkspace`，而不是分别打开三个互相不认识的页面。

搜索、通知和分栏按钮不再挤在每一个页面的顶栏；分栏按钮放在工作台底部，搜索和通知只在总览顶栏显示。全屏时保留课件切换、字幕开关、截图和 AI 入口，其他控件自动收起。

### 4.3 统一打开规则

所有入口都调用同一个命令：

```text
openTarget({ kind, id, source, mode: preview | workspace | external })
```

- 单击文件：当前栏内打开小框预览。
- 点击“扩大”：切换到同一个对象的独立阅读层，保留页码、缩放和返回位置。
- 录播课件：打开 `LearningWorkspace`，课件小窗可以切换为主内容，位置/大小写入 LayoutState。
- AI 引用：打开对应页码或视频时间，不新建一个重复的资源页面。
- 外部打开：只有平台预览或本地预览明确失败时才出现，且必须说明失败原因。

## 5. 功能迁移与新增的详细方案

### 5.1 全局搜索：第一批落地

先做本地已缓存内容搜索，不在输入时临时访问 Canvas。使用 SQLite FTS5 或等价的倒排索引，写入发生在资料、字幕、对话和笔记成功落盘之后。

搜索结果统一包含：类型、课程/来源、更新时间、定位锚点和动作。示例：

```text
“采样定理”
  课件 · 第三章.pptx · 第 6 页       打开课件
  录播 · 数字信号处理 · 00:22:07       跳到视频
  笔记 · 采样与重构                      打开笔记
  AI 对话 · 为什么是 fs/2                 继续提问
```

索引规则：

- 只索引已经缓存的正文、字幕、用户问题和笔记。
- PDF/PPTX 的正文索引写入页码或幻灯片号；图片未读取时不要伪造命中位置。
- 搜索结果每种类型限制数量，先返回本地结果，再显示“正在同步”而不是卡住输入框。
- 删除课程缓存或账号时级联删除搜索文档。

复杂度中等，预计 5–8 个工作日，适合作为架构重构后的第一个真实功能。

### 5.2 课表与待办：合并而不是再做一套日历

把现有 Canvas 作业和本机日程统一成 `TodoItem`，但保留来源权限：Canvas 作业的标题、截止时间和提交状态由同步覆盖；本机待办可以编辑、完成和删除。

第一版只做两个视图：列表和月历。列表默认按“今天、明天、本周、以后”分组；月历点击日期后过滤同一批条目。提醒只由统一的 `ReminderScheduler` 注册，避免 Canvas 作业提醒和本机日程重复通知。

同步策略：

1. 打开总览时读取本地快照，立即可用。
2. 后台根据网络和电量条件同步 Canvas 作业与课表。
3. 失败保留旧数据，显示上次同步时间和重试动作。
4. 用户完成本机待办立即更新 UI；Canvas 状态变化需要等下一次同步确认。

复杂度中高，预计 8–12 个工作日，主要复用现有作业和日程逻辑。

### 5.3 邮件：先做只读收件箱

Dela 的完整邮件能力包含 IMAP 收信、SMTP 发信、草稿、回收站、附件、HTML/MIME 解析、后台同步和通知。安卓端第一版只接入：收件箱、文件夹切换、搜索、正文、附件下载、已读状态和“用系统打开”。

实现边界：

- 密码或应用专用密码由 Android Keystore 加密；Store 只保存账号标识和同步游标。
- 使用 WorkManager 做条件同步，默认不维持长连接，避免后台耗电。
- MIME/HTML 解析在 Rust 线程执行，正文和附件分开缓存，禁止 WebView 直接加载不受信任的远程 HTML。
- 邮件附件进入统一的 `Resource`，可以加入 AI 资料篮，但必须由用户选择。
- 通知只报告新邮件数量；点击通知直接打开对应线程。

写信、草稿、回收站、多账号和内嵌图片放到后续阶段。只读版预计 10–15 个工作日，完整收发预计 20–35 个工作日。

### 5.4 水源社区：独立的可选模块

水源社区不要默认出现在 AI 上下文，也不要和课程资料混在同一个列表里。第一版只做授权、话题列表、分类过滤、搜索、正文阅读、收藏和外部分享；回复、发帖、私信、未读通知和图片上传另行评估。

所有社区正文必须带来源标记，默认不进入全局搜索，除非用户在设置中开启“搜索社区”。社区服务故障不能影响课程、AI 或播放器启动。

只读版预计 10–20 个工作日。它的主要风险是授权方式、HTML/媒体安全和接口变化，而不是 UI 数量。

### 5.5 文档能力：平台预览 + 可复用证据缓存

文档分为两条路径：

```text
用户预览：Canvas 平台预览 → 失败时提供外部打开
AI 阅读：Rust 解析文字层/结构 → 按需提供指定页图像 → 保存证据范围
```

不把 Dela 的 Python 运行时直接放进 APK。当前 Rust 已有 PDF/Office 解析、PDF 页面图像和 `study_*` 准备流程，下一步是把结果统一为 `ResourceEvidence`：

- `text`：文字层或结构化正文。
- `page`/`slide`：实际页码或幻灯片号。
- `imagePath`：已经提供给视觉模型的页面图像缓存。
- `coverage`：本次实际读取范围。
- `warning`：多栏、公式、表格、嵌入图片或解析失败说明。
- `version`：文件更新时间/大小/哈希组合。

AI 重新进入对话时先查 `resourceId + version`，命中就复用结果；只有文件版本变化或用户明确要求新页码时才重新准备。PDF 默认不做 OCR：有文字层就用文字层，扫描页或图表只在用户指定页时发送页面图像；模型必须知道哪些页面没有图像证据。

PPTX 优先使用 Canvas 平台预览和切片；本地只提取可读文字和可识别媒体，不声称已经还原完整 Office 排版。复杂课件的回答要带“已读取第几页/哪些内容可能失真”的范围说明。

### 5.6 AI 主界面与 Skills

助手页面改成“会话 + 资料篮 + 教学方式”的工作区：

- 顶部：会话标题、来源范围、历史和新对话。
- 中部：对话内容，回答里的来源可点击跳到页码或视频时间。
- 输入区：文字、截图、选中字幕和资料篮合并后一次发送；发送后附件卡片自动消失。
- 输入区上方：最多三个自动追问建议，点击即发送，不再出现额外的“采用”按钮。
- 对话菜单：提炼笔记、查看来源范围、重新读取指定页、清理当前上下文。

Skills 保持“内置、可预览、可选”的模式，建议目录：

| Skill | 用途 |
| --- | --- |
| 直接讲清楚 | 先给结论，再用最少步骤解释 |
| 课堂伴学 | 结合当前字幕、课件和视频位置回答 |
| 课件阅读 | 按页码、图表和公式解释，并报告阅读范围 |
| PDF 阅读 | 区分文字层与页面图像，引用页码 |
| 公式推导 | 展开成立条件、符号和中间步骤 |
| 例题教练 | 只给下一步提示，避免直接公布答案 |
| 错题复盘 | 对照用户答案找错误类型和修正方法 |
| 考前复习 | 从资料提取重点、易错点和自测题 |
| 笔记整理 | 将对话压缩成带来源的结构化笔记 |
| 资料对比 | 对比两份课件或字幕中的定义、差异和冲突 |

Skill 注入必须遵循当前项目已经采用的安全原则：资料是数据，不是系统指令；只注入选定的技能文本；把来源范围、页码、时间点和截断信息作为结构化元数据。模型“思考”只显示可解释的阶段提示，例如“正在核对第 6 页公式”，不展示未经筛选的隐藏推理链。

## 6. AI 上下文协议

统一定义 `ContextEnvelope`，每次请求都可审计：

```json
{
  "conversationId": "...",
  "skillId": "lecture-tutor",
  "question": "...",
  "sources": [
    {"kind":"transcript","recordingId":"...","fromMs":120000,"toMs":132000},
    {"kind":"document","resourceId":"...","version":"...","pages":[6]},
    {"kind":"screenshot","attachmentId":"..."}
  ],
  "coverage": {"subtitle":"nearby","document":"page-6","truncated":false},
  "history": {"summary":"...","turnIds":["..."]},
  "budget": {"textChars":48000,"imageCount":1}
}
```

上下文装配顺序固定：

1. 当前问题和用户明确选择的资料。
2. 选中字幕/截图/页码等焦点证据。
3. 附近字幕或当前课件页面。
4. 经过摘要压缩的历史对话。
5. 教学 Skill 和回答格式要求。

不默认携带整堂字幕和整份 PPT。用户可以一键扩大为“本课全文”或“全文总结”，但 UI 要显示预计范围和可能的模型容量限制。每个回答保存 `sourceRefs`、`coverage`、`promptVersion` 和 `skillVersion`，这样后续可以准确继续问，也能解释回答依据。

## 7. 视觉与交互重构

### 7.1 设计 Token

参考 Dela 的 token 思路，但自行实现，不复制 Dela 业务代码。Dela 的开发文档明确要求统一工作台规则；其 beautiful-ui 也把页面、面板、边界、强调色、阴影和控件圆角集中管理，并减少未使用组件。[Dela 开发文档](https://github.com/Chang-Yo/Dela/blob/main/docs/DEVELOPMENT.md) [beautiful-ui 说明](https://github.com/Chang-Yo/Dela/blob/main/src/renderer/components/ui/beautifului/README.md)

安卓端建议的 token：

```css
--surface-page       页面背景
--surface-panel      一级面板
--surface-card       卡片
--surface-raised     浮层和扩大预览
--ink-strong         标题
--ink-default        正文
--ink-muted          次要文字
--line-subtle        分隔线
--accent-primary     主操作
--accent-soft        选中背景
--status-success     完成
--status-warning     待处理
--status-danger      错误/删除
--radius-control     10–12dp
--radius-card        16–20dp
--radius-sheet       22–28dp
--touch-target       最小 48dp
```

不要同时继续扩张 MUI、手写 CSS 和页面级按钮三套规则。保留 React 和 Lucide，新增 `demo/src/ui` 共享层，逐步把页面改成这些组件：`AppSurface`、`SectionHeader`、`PrimaryAction`、`QuietIconButton`、`SegmentedControl`、`InlineNotice`、`Toast`、`PreviewSheet`、`ActionMenu`、`SourceChip`。

按钮使用圆角矩形，不把所有操作做成胶囊；图标按钮必须有 Tooltip/无障碍标签；每个页面只保留一个主色操作。加载用局部骨架，网络失败用页面内提示，登录状态用可恢复的横幅，不重复弹出“登录过期”。

### 7.2 课堂学习工作区

录播页面采用三层结构：

```text
顶栏：返回、课程/录播名、字幕开关、更多
主区：视频或课件（当前主内容）
底栏：播放、倍速、截图、课件/视频切换、AI 提问
```

课件小窗只保留一个内容框；拖动、缩放、切换按钮全部收进小型悬浮控件。全屏仍显示字幕开关和 AI 入口，回到普通模式保留视频位置、课件页码、课件大小和分栏选择。

### 7.3 水池与动效

水池只作为总览的低优先级背景互动，不阻塞首屏。回到首页先显示最近一次真实渲染帧，再在空闲时恢复 WebGL/Canvas；低端设备自动降低采样和反射质量。水池效果、玻璃外观和互动强度采用同一份 `WaterState`，不要让页面切换重新创建一套粒子系统。

动效只承担三件事：点击反馈、页面层级变化、任务完成确认。作业完成动画使用轻量的矢量/粒子短动画，默认遵守系统减少动态效果设置。

## 8. 同步、缓存和性能策略

### 8.1 同步状态机

所有联网模块共用：

```text
idle → queued → running → succeeded
                    ├→ retryable_error → queued
                    └→ permanent_error
```

每个 `SyncJob` 保存尝试次数、下次运行时间、最后错误和数据版本。网络请求使用指数退避和取消令牌；账号切换时取消旧账号的所有任务，避免旧数据写入新账号。

### 8.2 性能预算

验收时按中端 Android 平板和普通 Android 手机分别检查：

- 冷启动先显示可操作外壳，缓存总览在 500ms 内出现；网络数据不得阻塞首屏。
- 页面切换主线程不连续执行超过 16ms 的解析；文档、索引和图片缩放都放到 Rust/后台任务。
- 同时只保留当前页和相邻页图像；课件列表和搜索结果使用虚拟列表。
- 默认 AI 请求不超过 48k 字符和 2 张图片，全文模式单独显示范围和成本。
- FTS 索引按增量写入，输入搜索做 150–250ms 防抖。
- 水池、播放器和课件分别有可关闭/降级路径，任何一个模块失败不影响课程和助手。
- 内存、缓存和下载页面显示可回收项；清理缓存不能删除会话正文和用户笔记。

### 8.3 离线行为

离线仍可用：已缓存课程、课件平台预览地址缓存、已准备文档证据、字幕、对话、笔记、待办和下载文件。需要网络的操作显示“待联网同步”，不伪装成提交成功或邮件已发送。

## 9. 实施顺序与验收闸门

### P0：架构契约和视觉基础（4–6 个工作日）

- 定义 `WorkspaceStore` schema、IPC command/event、`ResourceRef` 和 `ContextEnvelope`。
- 建立设计 Token 和共享 UI 组件。
- 只迁移 UI 偏好和页面状态，不立即删除旧 localStorage/IndexedDB。
- 验收：现有课程、录播、AI、作业和分栏回归测试全部通过；无功能页面改用新组件后视觉不混用。

### P1：Store 迁移与全局搜索（7–10 个工作日）

- 新增 Store 迁移器：课程、文件、作业、对话、笔记、字幕、布局状态。
- 新增 FTS 搜索和来源跳转。
- 旧数据保持只读回退，迁移失败可重试，不丢失聊天和笔记。
- 验收：断网搜索缓存内容、按页码/时间跳转、账号隔离、删除账号后索引清理。

### P2：统一待办与课堂工作区（8–12 个工作日）

- 合并 Canvas 作业、本机日程、提醒和课程时间表。
- 重做手机底部导航、平板分栏和录播/课件/字幕同屏工作区。
- 验收：手机旋转和系统分屏前后保持状态；返回后视频、课件和 AI 位置一致；提醒不重复。

### P3：文档证据与 AI Skills（8–12 个工作日）

- 迁移现有 `study_*` 结果到 `ResourceEvidence`。
- 实现文件版本命中、页图缓存、范围提示和技能选择。
- 实现提炼笔记、自动追问、来源回跳和安全的阶段提示。
- 验收：同一文件重新进入不重复提取；PDF 文字层/图片页范围可核对；PPTX 失败时不无限转圈；回答能继续追问。

### P4：邮件只读版（10–15 个工作日）

- Keystore 账号、收件箱/文件夹、正文、搜索、附件和通知。
- 验收：断网保留旧邮件；同步失败有重试；附件不执行远程 HTML；通知可回到线程。

### P5：水源只读版（10–20 个工作日）

- 独立授权、话题列表、搜索、正文和收藏。
- 验收：社区故障不影响主应用；默认不注入 AI；清除授权会删除本地社区数据。

### P6：真实设备与发布检查（5–7 个工作日）

- Android 10/12/14/16，手机竖屏/横屏，平板小宽度/大宽度，系统分屏，减少动态效果，低内存和断网。
- 检查冷启动、重复登录、重复提取、旋转、账号切换、删除下载、恢复会话、平台预览失败、AI 截断和缓存清理。
- 最后才更新 APK、版本说明和 GitHub Release。

## 10. 需要明确的风险和不做事项

### 许可证边界

Dela 主项目是 GPL-3.0-or-later。当前安卓端是 MIT。可以参考公开行为、数据模型和设计原则，但不复制 Dela 的业务实现、源码或整套组件组合；视觉 Token 和业务适配需要自己实现并保留第三方许可记录。

### 不建议现在做的事情

- 不在 APK 内嵌 Electron、完整 Python Office 运行时或完整浏览器。
- 不把水源、邮件全文默认放入 AI 上下文。
- 不在每次提问时重新读取整份 PDF/PPTX。
- 不用 OCR 结果替代已有文字层和按页视觉证据；扫描页只按需提供图像。
- 不把 `localStorage` 继续当作大文件正文、对话和搜索索引的长期数据库。
- 不在同一轮同时重写播放器、水池、导航、Store 和邮件；每个阶段必须能独立回退。

### 关键验收指标

| 指标 | 目标 |
| --- | --- |
| 返回课堂恢复 | 课程、录播、页码、字幕、课件布局、AI 对话全部可恢复 |
| 文档重复读取 | 同一账号、同一文件版本、同一页码不重复解析 |
| 搜索可解释性 | 每个命中带来源和定位动作；未缓存内容不伪装为已索引 |
| AI 上下文 | 每次请求能列出实际资料、页码、时间点和截断状态 |
| 账号隔离 | 切换/删除账号后课程、索引、对话、下载和通知不串号 |
| UI 一致性 | 主要页面只使用共享 Token 和组件，触摸目标至少 48dp |
| 网络失败 | 保留旧数据、显示最后同步时间、提供重试，不清空页面 |
| 性能 | 首屏先可操作；文档解析和索引不阻塞播放器交互 |

## 11. 推荐的第一轮开发任务拆分

第一轮不要直接做邮件和水源。建议先完成以下闭环：

1. `WorkspaceStore` 的 schema、迁移和 Rust IPC。
2. `ResourceRef`/`ResourceEvidence` 与现有学习资料缓存打通。
3. 全局搜索：课程、文件、字幕、对话、笔记、作业。
4. `ContextEnvelope` 和 AI 资料范围展示。
5. 统一 Token、按钮、面板、Toast、预览层和课堂工作区。
6. 用真实课程、一个大 PDF、一个复杂 PPTX、一个长字幕和一条作业完成完整回归。

这六项完成后，邮件和社区才有稳定的入口、搜索、缓存、通知和权限边界。否则新增的功能会继续依赖页面级状态，最终再花一轮时间修复“看得到但找不到、退出后丢失、重新提取、按钮不一致和分屏状态串掉”等问题。

## 12. 结论

最合理的路线不是把 Dela 的功能全部搬进来，而是先把安卓端改成一个统一的本地学习工作台：一个 Store、一套资源引用、一套上下文协议、一套 UI Token、一个可恢复的课堂工作区。全局搜索、统一待办、文档证据缓存和 AI Skills 是第一批高收益能力；邮件和水源社区作为独立、可关闭的后续模块接入。

这样既能保留安卓端已有的课堂闭环，也能吸收 Dela 在本地优先、领域 Skill、搜索、同步和视觉约束方面的成熟做法，同时把性能、隐私、许可证和真实设备验收控制在可管理范围内。
