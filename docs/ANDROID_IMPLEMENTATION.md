# Android implementation status

Baseline: upstream `4246f2f5ed35b3f5a7ba1375221783ba3ba5247e` (3.0.13).

## Latest preview: 0.4.0

See `RELEASE_0.4.0.md` for current evidence. Added deadline search/ranges, ICS snapshots, course pinning, file search, undo, accessible dialogs, offline/error recovery and reduced-motion-aware transitions. The Android 10 empty-account path was verified with the final preview APK; real-device/service gates below remain pending. The source tree is prepared for an open-source preview, not a stable release.

Current verification: 49 frontend, 9 Rust core and 2 source-export checks passed; clean exported frontend installation/build passed. GitHub workflows are configured but not executed in the target repository. Root README now describes Android; desktop documentation/workflows are archived under `docs/upstream`.

## Confirmed product decisions

- Android 10+, personal signed APK first, public distribution later.
- Main campus only: `https://oc.sjtu.edu.cn`; no JI selector.
- Approved visual reference: `demo/`, crimson/ivory palette, card layouts, typography and five-tab navigation.
- One Android application supports phones and tablets. Below 600 CSS pixels use bottom navigation and a single column; from 600 use a side navigation rail; at 768 and above use dashboard summary/timeline columns and recording/material columns. Narrow tablets and split-screen windows stack content while retaining the rail. Resizing adapts in place.
- Browser Demo includes explicit phone/tablet preview buttons; the native application selects its layout automatically.
- Dashboard is the first tab: deadline-ordered assignments, submission states, live countdowns, filtering and calendar.
- Remind unfinished assignments 24 hours, 2 hours and 30 minutes before due time, plus once overdue. Stop after submission; handle changed deadlines and account isolation.
- Foreground refresh every 60 seconds and on resume/manual refresh; Android schedules notifications from the last successful snapshot. Show last sync time. Offline data cannot prove a new remote submission.
- Documents open in external apps; uploads remain foreground. Downloads continue in background. Video may pause on background.
- Single-device official jAccount login is required.
- Excluded: grades/discussions/people/Excel, TA actions, archive preview, embedded document viewers, PDF generation/merging, Office conversion, video export/composition, MCP, annual reports, relationship graphs, standalone QR tools.

## Evidence and remaining gates

- Interactive browser demo: implemented; all data and submissions explicitly simulated.
- Demo type check and production build: PASS. Domain, mapping and component tests: 40 PASS, including submission/reminder cancellation, missing evidence, no deadline, persistence, focus stability, QR protocol, file-list refresh retention, streamed answer visibility, math and model configuration. Rust AI core: 9 PASS. See `AI_AND_APPEARANCE_0.3.0.md`.
- Windows strict UTF-8 regression: PASS (Chinese JSON round-trip, no BOM, exact UI strings).
- Browser verification: PASS at phone preview widths 360/393/600 and tablet widths 600/720/768/800/1024/1366; no document or main-content horizontal overflow, bottom navigation on phones, side navigation on tablets. Recording/subtitle columns checked at 1366. Screenshots are in `docs/screenshots/`.
- Portable Java 17.0.20.1, SDK 36, NDK 28.2.13676358, Gradle 8.13, AGP 8.11.1 and Kotlin 2.1.21 installed/pinned. Rust aarch64/x86_64 Android library, Kotlin compilation and debug APK packaging: PASS.
- Android 10 x86_64 emulator: installation and cold start PASS (initial 1025 ms, updated build 1216 ms). Phone and 1600x1200/density160 tablet windows render the real-data branch, initially empty without credentials. System bars/keyboard insets are handled in MainActivity; phone navigation remains visible while content scrolls. Tablet screenshot uses an emulator display override, not a physical tablet. Newer Android and physical-device acceptance: NOT_RUN.
- Real Canvas Token/API connection and full assignment synchronization: PASS in Android 10 emulator (52 courses, 213 assignments including historical entries). QR creation, WebSocket response, gallery export and unconfirmed-login rejection: PASS. Final identity confirmation, cloud drive, model invocation and physical-device acceptance remain NOT_RUN.
- User-supplied Token was used for authorized read-only verification; test credentials/cache were cleared afterward. No real assignment was submitted or changed, and no public release was published. See `AUTH_ACCEPTANCE.md` for connection evidence and limits.

## Native implementation and remaining work

Native bridge/mobile Rust entry, main-campus API facade, encrypted credential storage, document picker/FileProvider, persisted DownloadManager tasks, official login Activity, Media3 player and notification scheduling are implemented in source. The approved UI has a separate real-data branch without sample fallback. These implementations still require Android execution and authenticated acceptance.

Outstanding product work includes full cloud upload UI, multiple saved model profiles, update source configuration, account/lifecycle edge cases and the complete acceptance matrix from the approved plan. A browser Demo passing does not satisfy those gates.

Notification timing uses Android inexact alarms and periodic background refresh; do not describe it as guaranteed instant server-state synchronization. A remote submission made while offline can only cancel reminders after a successful refresh.

## Local build notes

Run `tools/build-android.ps1` from the repository root. On Windows without symbolic-link privileges, the script copies the freshly built Rust library into the Android JNI directory and runs the generated Gradle project. Gradle's prebuilt mode checks the required library exists.

This machine cannot currently complete TLS connections to Google Maven. A local Gradle init script at `D:\Codex\android-toolchain\google-maven.init.gradle` prepends the Aliyun Google Maven mirror for local builds; upstream repository definitions remain unchanged. Supply it using `-GradleInitScript` when needed. The portable Gradle archive is verified against the official SHA-256 in the wrapper configuration.

For x86_64 emulator builds, aws-lc requires bindgen and libclang. The verified PyPI `libclang==18.1.1` Windows wheel is extracted under `D:\Codex\android-toolchain\libclang`; the build script configures the NDK sysroot and portable C implementation for this target to avoid excessively long Windows assembly output paths. ARM64 uses the original assembly-enabled implementation.

Android model TLS now uses Mozilla trust anchors with hostname and certificate verification, avoiding the unwired platform-verifier JVM path. File/material chat and model discovery use the reqwest 0.11 transport; the read-only Canvas Agent retains rig with an explicitly configured Android TLS client. Local mock model-list/streaming invocation passed through native Android networking and Tauri channels; real provider and authenticated Agent acceptance remain pending. Do not treat saved model configuration as verified real-service connectivity.

Never label an unverified APK stable or mark a webpage login as a successful service login without probing that service.
