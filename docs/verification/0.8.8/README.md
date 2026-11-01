# 0.8.8 本地 APK 交付核验

日期：2026-10-19。本次只交付本地 Android ARM64 个人预览 APK，没有提交、推送或发布 GitHub，也没有修改上游 Windows 版本。

## 本次打包内容

包含 0.8.7 后的资料持久化修复，以及两轮后续对话边界检查修复：同一对话重开时复用匹配文件的解析结果；保留文件版本与页面定位；修复草稿快速切换、删除后迟到写入、失败重试定位重复、取消图片后重新带入旧图、异步资料结果覆盖新选择、旧资料面板串对话、截图编辑与笔记整理来源错位、录播问题删除同步及零时间回看。

范围和回归细节分别记录在：

- `docs/verification/document-reuse-2026-10-19.md`
- `docs/verification/conversation-context-audit-2026-10-19.md`
- `docs/verification/conversation-context-audit-round3-2026-10-19.md`

## 本次重新执行的检查

| 检查 | 结果 |
| --- | --- |
| 前端测试 | 261 项通过，失败 0；`local-diagnostics/tests-0.8.8.json` |
| 文件读取、学习上下文与模型传输 | Rust 核心 20 项通过 |
| Android 单元测试 | 14 项通过；本次执行 `:app:testArm64DebugUnitTest` 并检查 XML |
| 类型检查及生产构建 | 通过 |
| ARM64 原生与 Android 打包 | 完成；Windows 符号链接限制触发已有复制回退，最终 Gradle exit 0 |
| 编码 | 182 份前端源文件、中文 JSON 往返检查通过 |
| APK 内容 | 0.8.8 / 8008，包名 `com.canvas.sjtu.mobile`，API 29 / 36，ARM64 only |
| 签名及升级 | 通过签名验证，与 0.8.7 证书相同，可覆盖安装 |
| 包内资源 | 本次 8 份 JS/CSS 资源名已嵌入最新原生库；包内库与当前构建库 SHA-256 相同；新修复提示已出现在生产前端；30 份启动图标资源未变化；无 demo/QA HTML |

交付：`artifacts/Canvas-Suixing-0.8.8-arm64.apk`。字节数 108186143。

SHA-256：`9e36f27b92f803646b0698f36138f5936250916c9aee8ae9e0025813fd000bd5`。

详细验证见同目录 `apk-verification.json`。上一份 0.8.7 APK 保留用于恢复；`artifacts/SHA256SUMS.txt` 对应本次新包。

本次仍属于开发签名个人预览包，沿用原有签名，并非正式发行签名。没有连接物理设备，没有使用真实 Canvas 账号、私有课件或真实模型服务完成本版端到端验收。自动化测试与安装包校验不能代替真机验收。
