# 参与贡献

欢迎围绕实际学习场景改进手机和平板体验。当前维护对象是 Android 预览版；根目录 `src/` 和旧依赖属于保留的桌面源码，不是移动界面入口。

请从本 fork 的 `android` 分支开始，并向该分支提交 PR。桌面版问题请到[原项目](https://github.com/Okabe-Rintarou-0/SJTU-Canvas-Helper)反馈；适合共享的接口修复先拆成独立改动，再与上游讨论。

## 开始修改

1. 阅读 [README](README.md)、[构建指南](docs/BUILDING.md) 与 [验收表](docs/ACCEPTANCE.md)。
2. 从 `demo/` 启动预览，用示例数据复现；真实账号凭据保存在仓库外。
3. 每个 PR 聚焦一个问题，附操作前后的行为与验证结果。涉及 UI 时提供手机、平板、夜间模式截图，使用示例数据。
4. 保留现有账号数据与兼容性。学期、忽略、课程置顶等设置应绑定账号；不要将 URI 当作普通路径，不要将凭据放在任务或日志中。

## 验证

```sh
npm ci --prefix demo
npm --prefix demo test
npm --prefix demo run build
npm --prefix demo run test:encoding
node tools/check-public-source.mjs
cargo test --locked --manifest-path tools/ai-core-tests/Cargo.toml
```

UI 检查至少覆盖 360／393 像素手机宽度、600／768／1280 像素平板宽度、横竖屏和减少动态效果。交互要有明确的加载、空白和错误状态；图标按钮提供可读名称，弹窗支持键盘和返回入口。Android 10 的 WebView 是兼容基线，新增浏览器 API 必须检查支持情况。

新增有业务含义的逻辑需要测试。真实上传只能使用本人授权的测试作业／目录，不能在普通课程中反复提交。模拟测试通过只证明对应环节；未运行的真机检查写“待验证”。

## 文本与版本

源码和中文文档使用 UTF-8 无 BOM。Windows 用 PowerShell 7，读取时显式指定 UTF-8，写入后严格回读并解析配置。不要提交自动格式化造成的大面积无关差异。

移动版本位于 `demo/package.json` 与 `src-tauri/tauri.mobile.conf.json`，同时更新 npm lockfile。保留上游版权、来源及许可。签名密钥、SDK、缓存、真实数据和构建产物不进入源码。

## 报告问题

请提供应用版本、Android 版本、手机／平板型号、复现步骤和脱敏错误。文件问题优先提供扩展名、大小及是否有可复制文字。不要上传私人课件原文，安全问题走 [安全说明](SECURITY.md) 中的渠道。
