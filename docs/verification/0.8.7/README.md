# 0.8.7 个人版交付核验

日期：2026-10-19。仅构建 Android ARM64。用户追加授权上传后，源码已提交至 Android fork 的 `android` 分支，发布 `android-v0.8.7` 预览 Release；没有更改上游 Windows 版本或 `main` 分支。交付目录仅保留最新 APK 与校验和。

## 本轮实现

- 修复“选择了资料，但模型没有收到正文”的链路：复用账号已下载的文件，原生解析后把实际正文和页面图像加入本次请求。课件页面直接提问与资料面板使用同一条读取链路。准备成功和模型实际收到的范围分开显示。
- PDF 使用 Android PdfRenderer 在工作线程渲染页面，再作为图片交给视觉模型；不接入 OCR。原生文字层辅助查找和引用，不代替模型读图。默认提供文字型 PDF 首页图像、扫描 PDF 前三页图像；明确标注未提供的页面。可直接问“解释第 9 页”，或“比较第 9—10 页”，按需读取指定页面。每个文件每次最多 3 张图片，避免一次渲染整份课件造成卡顿。
- Word DOCX、PPT/PPTX、XLSX 等继续通过现有本地结构解析读取文字；DOCX 改用 OpenXML 正文与表格解析。不会把没有提供的图表描述成已读。没有引入完整 Office 引擎或声称解决旧 DOC 的全部兼容问题。
- 增加版本化学习技能：资料阅读、PDF 看图、课件备注区分、表格单位与引用、代码分析、公式推导、互动提示和笔记提炼。根据实际资料类型与问题选择；资料正文放在用户资料上下文，不能覆盖系统身份。历史按完整对话轮次裁剪，遵守配置的资料容量，避免每一轮重复持久化整份正文。
- 思考预览接收模型服务实际返回的 reasoning/summary 文本，独立流式更新、默认折叠，可点击展开，保存至对话历史。不会生成假的“思考”，不会展示加密载荷，也不会把这段内容重新当作用户问题或回答发送。服务不返回可展示内容时不显示此卡片。
- 保留已选水面材质，补上玻璃顶盖；在原有倾斜、触摸互动上接入左右、前后、上下线性加速度。回首页先显示同账号、同主题的最近真实渲染帧，随后替换成实时效果；离开首页仍释放 GPU。

## 阅读方案依据

这次采用“本机提取已有文字层 + 按需渲染页面图片 + 模型直接看图”，没有移植体积较大的桌面文档服务。

- [OpenAI PDF inputs](https://developers.openai.com/api/docs/guides/file-inputs)：PDF 的文字与页面图像共同提供信息。这里由应用自行生成兼容模型请求所需的图像，不假设任意模型服务都支持原生 PDF 上传。
- [Android PdfRenderer](https://developer.android.com/reference/android/graphics/pdf/PdfRenderer)：原生逐页渲染；通过已有文件缓存和工作线程调用，限制渲染数量。
- [Open WebUI document extraction](https://docs.openwebui.com/features/chat-conversations/rag/document-extraction/) 与 [RAG](https://docs.openwebui.com/features/chat-conversations/rag/)：区分附件选择、内容解析、实际上下文注入与来源引用。
- [Docling 格式支持](https://docling-project.github.io/docling/usage/supported_formats/)：成熟的多格式解析是另一条路线，但本次没有在 Android 中引入 Python/文档转换服务。
- [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)：思考内容与最终回答分开传输。应用兼容服务返回的文本，不向所有供应商强加同一种思考开关。

## 验证结果

| 范围 | 结果与证据 |
| --- | --- |
| 前端完整测试 | 65 个测试文件，232 项通过；`local-diagnostics/tests-0.8.7.json` |
| 读取、上下文与传输 | 20 项通过；`cargo test --locked --manifest-path tools/ai-core-tests/Cargo.toml` |
| Android 单元测试 | 14 项通过；`:app:testArm64DebugUnitTest`，XML 位于 Android build/test-results |
| 原生构建 | 最终 ARM64 Rust/Kotlin/Gradle 构建完成，exit 0 |
| APK | 0.8.7 / 8007，包名 com.canvas.sjtu.mobile，min SDK 29 / target SDK 36，ARM64 only |
| 升级与资源 | 与 0.8.6 签名一致；30 份图标资源保持一致；打包库与最新本机库一致；前端资源名称、玻璃顶盖和许可证已检查；没有 QA 页面 |
| 编码 | 前端 177 份源文件编码检查通过；新增中文说明和 JSON 另做严格 UTF-8 解码与解析 |
| 浏览器界面 | 实际 AiChat 中合成对话验证：思考默认收起、点击展开、393px 窄屏无横向溢出；截图 `thinking-phone.png`。合成对话检查后已删除 |
| 水面 | 浏览器 GPU 检查玻璃顶盖存在；合成竖直传感器事件产生非零波动，数值有限；页面切换释放 canvas、返回无粗略占位图。属于浏览器验证，不能当作真机传感器验收 |

原生读取测试实际生成两页 PDF，再调用生产解析器核对正文与页码；本地 HTTP 测试核对发送请求包含提取出的 PDF 内容，并验证思考与回答分别接收。这证明本地链路的行为，不证明真实模型对课件的理解质量。

## 性能与边界

- 单次最多 6 个文件，文档正文总量上限 200 万字符；实际送入模型的文字再按配置和模型上下文预算缩减。每次总计最多 7 张图片；明确记录实际送出的页码。
- 图片阅读要求模型支持视觉。不支持时明确提示切换，不静默丢掉 PDF 图片后只用字幕作答。
- 私有中转文件按账号与登录令牌隔离；路径必须位于当前会话专属缓存根目录。读取完成删除中转副本，切换账号后拒绝返回旧会话数据。不会将本地路径或账号凭据放进模型资料。
- 大文件的首次下载与解析仍需等待；扫描 PDF 不是一次全本看完，应按页或章节提问。1000px 页面图片遇到细密小字、公式时仍可能需要局部截图。
- 水面仍是 GPU 高度场，包含玻璃立方体外观；不是可以翻转倒置、产生三维飞溅的完整体积流体模拟。
- 本轮没有连接物理手机/平板，也没有使用用户真实 Canvas 账号、私有课件或真实模型服务完成端到端联调。待用户安装后验证登录状态、真实文件权限、模型看图能力和各轴摇晃手感。

APK 详细散列、签名与资源检查见 [apk-verification.json](apk-verification.json)。

## GitHub 交付

- 提交：`9c9a3087f76010e014ff7bfa245ca7a12f6bff0e`，已核对远端 android 分支与版本标签指向该提交。
- Release：https://github.com/Runhz/SJTU-Canvas-Helper-Android/releases/tag/android-v0.8.7 ，已公开、标记预览版。GitHub 返回的 APK SHA-256 与本机交付文件一致。
- 远端 main 保持 `4246f2f5ed35b3f5a7ba1375221783ba3ba5247e`。
- 629 份公开候选文件通过 UTF-8 与基本凭据/私钥扫描，2 项公开边界测试通过。94 份源码、测试及公开说明文件提交；本机验证截图、诊断、账号数据、签名私钥、APK 与缓存没有加入 Git。APK 和校验和仅作为 Release 附件上传。

GitHub Actions `39197436685` 已完成，Windows 与 Ubuntu 前端、Rust 核心三项任务全部成功；本地真机验收边界不变。
