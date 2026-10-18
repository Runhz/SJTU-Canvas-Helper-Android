# 开源与版本交付

## 当前阶段

0.8.4 作为开发预览发布，上传已经构建的同一份 ARM64 APK，保留开发证书与校验值。本轮未连接设备完成真机及学校服务验收，详见 [RELEASE_0.8.4.md](RELEASE_0.8.4.md)。0.5.4 仍是此前由用户于 2026-10-16 确认验收的稳定 Release；其验收记录不适用于新版本，详见 [ACCEPTANCE.md](ACCEPTANCE.md)。

## 上传 GitHub 之前

1. 运行 `node tools/check-public-source.mjs`，人工检查输出文件和所有待提交差异。扫描只输出路径与类别，不回显凭据。
2. 默认直接提交到保留上游关系的 Android fork，按 `tools/public-source.mjs` 清单选择新增文件；不要用 `git add .` 混入本机记录。本地不例行生成源码压缩包。确需无 Git 历史的源码导出时，可单独运行 `node tools/export-open-source.mjs`，但无历史导出不能代替 GitHub fork 关系。
3. 推送前检查待发布提交及暂存区的凭据与隐私。首个安卓提交直接基于已在公开上游确认的 `4246f2f`，本机没有额外的私有历史提交；旧上游历史属于公开来源，本地文件扫描不声称完成对其全历史的重新审计。
4. 不上传 `artifacts/`、SDK、NDK、模拟器、依赖缓存、本机日志和课程原文。公开截图只使用示例数据。
5. 保留 MIT 许可及上游声明；在 GitHub 启用私密漏洞报告。分支保护使用实际跑通的检查名称。

本地导出不会创建远程仓库、推送源码或发布 Release。工作流仅有只读权限，手动 APK 构建上传 Actions 产物，不自动创建公开发行。

## 每个版本

1. 同步 `demo/package.json`、`demo/package-lock.json` 和 `src-tauri/tauri.mobile.conf.json` 中的移动版版本。Rust 包的 3.0.13 是继承的上游基线，不是 APK 版本。
2. 完成前端、UTF-8、Rust 核心检查；在新克隆的源码中重复前端安装和构建。
3. 核实 API 29、较新 Android 和目标真机／平板的安装、导航、登录、后台下载、通知与升级。
4. 真正的稳定发行需要完成验收表的全部必测项。未完成时标注 prerelease，并列出限制。
5. 稳定发行使用维护者的正式私钥签名，核实包名、versionCode、最低 SDK、签名和 APK SHA-256。沿用开发证书的测试包必须明确标为开发签名预览，不冒充正式签名。
6. Release 附 APK、校验值、变更记录和已知限制；不要附私钥或包含账号数据的日志。

参考 [GitHub Actions 工作流说明](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。本 fork 已在 0.5.3 提交验证过 Windows／Linux 前端与 Rust 核心云端检查；每个新提交仍以对应 Actions 实际结果为准。手动云端 APK 构建与本机 APK 构建分别记录，不互相替代。
