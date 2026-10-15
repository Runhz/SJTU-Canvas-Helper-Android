# 来源与许可

Canvas 随行的 Android 移植基于 [Okabe-Rintarou-0/SJTU-Canvas-Helper](https://github.com/Okabe-Rintarou-0/SJTU-Canvas-Helper)。

- 上游基线：3.0.13，提交 `4246f2f5ed35b3f5a7ba1375221783ba3ba5247e`。
- 上游 MIT 许可和版权声明完整保留于 [LICENSE](LICENSE)。
- Android 界面、Kotlin 能力层与移动适配沿用 MIT 许可。
- Android fork 由 [hzr666ABC](https://github.com/hzr666ABC/SJTU-Canvas-Helper-Android) 独立维护；GitHub 保留与上游的 fork 关系，默认开发分支为 `android`。上游 `main` 与安卓分支分开，不向原项目提交整套安卓移植的合并请求。
- Windows／桌面版的下载、支持和更新请访问原项目；Android 版本号单独管理，不表示上游发布了同名版本，也不代表上游作者认可本移植。
- 原桌面版说明和工作流保留在 `docs/upstream/`，供追溯；该目录的工作流不会运行。
- 本项目非学校官方产品；名称不表示学校或上游作者的背书。

本仓库仍保留上游桌面源代码用于追溯和复用。Android 构建使用 `demo/` 与 `src-tauri/tauri.mobile.conf.json`；桌面入口与功能列表不代表 Android 支持范围。

第三方依赖各自适用其许可，不能因为本项目是 MIT 就将所有依赖视为 MIT。前端依赖锁定在 `demo/package-lock.json`，Rust 在 `src-tauri/Cargo.lock`，Android 在 Gradle 构建文件中。发布二进制前应检查对应依赖的许可与 NOTICE 要求。

后续同步上游时，先在独立分支检查课程接口及共享 Rust 模块的变化，再合并经过移动端验证的修改。若有适合桌面版的通用修复，应拆成范围明确的提交另行讨论。
