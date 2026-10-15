param(
    [switch]$Release,
    [ValidateSet('aarch64','x86_64')][string]$Target='aarch64',
    [string]$GradleInitScript='',
    [string]$ToolboxRoot=$env:CANVAS_ANDROID_TOOLBOX
)
$ErrorActionPreference='Stop'
chcp 65001 > $null
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Text.UTF8Encoding]::new($false)

# Standard JDK/SDK variables work on any Windows checkout. An optional portable
# toolbox places SDKs, caches and temporary files on a chosen drive.
if (!$ToolboxRoot -and (Test-Path -LiteralPath 'D:\DevTools\android')) { $ToolboxRoot='D:\DevTools\android' }
if ($ToolboxRoot) {
    $ToolboxRoot=(Resolve-Path -LiteralPath $ToolboxRoot).Path
    if (!$env:JAVA_HOME) { $env:JAVA_HOME=(Get-ChildItem -LiteralPath (Join-Path $ToolboxRoot 'jdk') -Directory | Select-Object -First 1).FullName }
    if (!$env:ANDROID_HOME) { $env:ANDROID_HOME=Join-Path $ToolboxRoot 'sdk' }
    if (!$env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME=Join-Path $ToolboxRoot 'user-data\gradle' }
    if (!$env:ANDROID_AVD_HOME) { $env:ANDROID_AVD_HOME=Join-Path $ToolboxRoot 'user-data\android\avd' }
    $env:TEMP=Join-Path $ToolboxRoot 'temp'; $env:TMP=$env:TEMP
    New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
}
if (!$env:ANDROID_HOME) { $env:ANDROID_HOME=$env:ANDROID_SDK_ROOT }
if (!(Test-Path -LiteralPath "$env:JAVA_HOME\bin\java.exe")) { throw 'Set JAVA_HOME to JDK 17.' }
if (!(Test-Path -LiteralPath "$env:ANDROID_HOME\platforms\android-36")) { throw 'Set ANDROID_HOME and install SDK platform 36.' }
$env:NDK_HOME=Join-Path $env:ANDROID_HOME 'ndk\28.2.13676358'
if (!(Test-Path -LiteralPath $env:NDK_HOME)) { throw 'Install NDK 28.2.13676358.' }
$env:ANDROID_NDK_ROOT=$env:NDK_HOME; $env:ANDROID_NDK=$env:NDK_HOME
$env:CMAKE_GENERATOR='Ninja'
if ($Target -eq 'x86_64') {
    if (!$env:LIBCLANG_PATH -and $ToolboxRoot) { $env:LIBCLANG_PATH=Join-Path $ToolboxRoot 'libclang\libclang-18.1.1.data\platlib\clang\native' }
    if (!(Test-Path -LiteralPath "$env:LIBCLANG_PATH\libclang.dll")) { throw 'Set LIBCLANG_PATH to the libclang DLL directory for x86_64. See docs/BUILDING.md.' }
    $clangRoot=($env:NDK_HOME+'\toolchains\llvm\prebuilt\windows-x86_64').Replace('\','/')
    $env:BINDGEN_EXTRA_CLANG_ARGS="--target=x86_64-linux-android29 --sysroot=$clangRoot/sysroot -resource-dir=$clangRoot/lib/clang/19"
    $env:AWS_LC_SYS_NO_ASM_x86_64_linux_android='1'
}
if ($Release) {
    foreach ($name in @('CANVAS_KEYSTORE_PATH','CANVAS_KEY_ALIAS','CANVAS_KEYSTORE_PASSWORD','CANVAS_KEY_PASSWORD')) {
        if (![Environment]::GetEnvironmentVariable($name)) { throw "Release signing requires $name. Values are not printed." }
    }
    if (!(Test-Path -LiteralPath $env:CANVAS_KEYSTORE_PATH)) { throw 'Signing keystore not found.' }
}
$proxyUrl=if($env:HTTPS_PROXY){$env:HTTPS_PROXY}else{$env:HTTP_PROXY}
if ($proxyUrl) {
    $buildProxy=[Uri]$proxyUrl
    if ($buildProxy.UserInfo) { throw 'Configure authenticated Gradle proxies privately in user Gradle properties.' }
    $env:JAVA_TOOL_OPTIONS="-Dhttps.proxyHost=$($buildProxy.Host) -Dhttps.proxyPort=$($buildProxy.Port) -Dhttp.proxyHost=$($buildProxy.Host) -Dhttp.proxyPort=$($buildProxy.Port)"
}
$env:PATH="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmake\3.22.1\bin;"+$env:PATH
$projectRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $projectRoot
try {
    $argsList=@('android','build','--target',$Target,'--apk','--config','src-tauri/tauri.mobile.conf.json')
    if (!$Release) { $argsList+='--debug' }
    & "$projectRoot\demo\node_modules\.bin\tauri.cmd" @argsList 2>&1 | Tee-Object -Variable tauriOutput
    $tauriExit=$LASTEXITCODE
    if ($tauriExit -eq 0) { exit 0 }
    # Only known symlink failures admit the copy fallback. Other build errors
    # remain failures, even if an older native library exists.
    if (($tauriOutput -join "`n") -notmatch 'os error 1314|privilege is not held|symbolic link|symlink') { exit $tauriExit }
    $profile=if($Release){'release'}else{'debug'}
    $triple=if($Target -eq 'aarch64'){'aarch64-linux-android'}else{'x86_64-linux-android'}
    $abi=if($Target -eq 'aarch64'){'arm64-v8a'}else{'x86_64'}
    $arch=if($Target -eq 'aarch64'){'arm64'}else{'x86_64'}
    $library=Join-Path $projectRoot "src-tauri\target\$triple\$profile\libcanvas_mobile.so"
    if (!(Test-Path -LiteralPath $library)) { exit $tauriExit }
    $sources=@(Get-ChildItem "$projectRoot\src-tauri\src" -Recurse -File)+@(Get-Item "$projectRoot\src-tauri\Cargo.toml","$projectRoot\src-tauri\Cargo.lock")
    $latestSource=$sources | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ((Get-Item -LiteralPath $library).LastWriteTime -lt $latestSource.LastWriteTime) { throw 'Refusing stale native library.' }
    $jni=Join-Path $projectRoot "src-tauri\gen\android\app\src\main\jniLibs\$abi"
    New-Item -ItemType Directory -Force -Path $jni | Out-Null
    Copy-Item -LiteralPath $library -Destination (Join-Path $jni 'libcanvas_mobile.so') -Force
    & "$env:NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-strip.exe" --strip-debug (Join-Path $jni 'libcanvas_mobile.so')
    if ($LASTEXITCODE -ne 0) { throw 'Could not strip copied library.' }
    $variant=if($Release){'Release'}else{'Debug'}
    Set-Location -LiteralPath (Join-Path $projectRoot 'src-tauri\gen\android')
    $portableGradle=if($ToolboxRoot){Join-Path $ToolboxRoot 'gradle-8.13\bin\gradle.bat'}else{''}
    $gradle=if($portableGradle -and (Test-Path -LiteralPath $portableGradle)){$portableGradle}else{'.\gradlew.bat'}
    $gradleArgs=@("assemble$($arch.Substring(0,1).ToUpper()+$arch.Substring(1))$variant",'-PcanvasPrebuiltRust=true',"-PabiList=$abi","-ParchList=$arch","-PtargetList=$Target",'--console','plain')
    if ($GradleInitScript) { $gradleArgs+=@('-I',(Resolve-Path -LiteralPath $GradleInitScript).Path) }
    $apkOutput=Join-Path (Get-Location).Path "app\build\outputs\apk\$arch\$profile\app-$arch-$profile.apk"
    if (Test-Path -LiteralPath $apkOutput) { Remove-Item -LiteralPath $apkOutput }
    & $gradle @gradleArgs
    exit $LASTEXITCODE
} finally { Pop-Location }
