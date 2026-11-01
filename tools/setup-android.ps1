$ErrorActionPreference = 'Stop'
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$root = 'D:\Codex\android-toolchain'
New-Item -ItemType Directory -Force -Path $root | Out-Null
$jdk = Get-ChildItem -LiteralPath "$root\jdk" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$jdk) {
  $asset = (Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse')[0].binary.package
  Invoke-WebRequest $asset.link -OutFile "$root\jdk.zip"
  if ((Get-FileHash "$root\jdk.zip" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.checksum) { throw 'JDK checksum mismatch' }
  Expand-Archive -LiteralPath "$root\jdk.zip" -DestinationPath "$root\jdk" -Force
  $jdk = Get-ChildItem -LiteralPath "$root\jdk" -Directory | Select-Object -First 1
}
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = "$root\sdk"
if (!(Test-Path "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat")) {
  Invoke-WebRequest 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' -OutFile "$root\commandtools.zip"
  if ((Get-FileHash "$root\commandtools.zip" -Algorithm SHA256).Hash.ToLowerInvariant() -ne '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a') { throw 'Android tools checksum mismatch' }
  Expand-Archive -LiteralPath "$root\commandtools.zip" -DestinationPath "$root\commandtools" -Force
  New-Item -ItemType Directory -Force -Path "$env:ANDROID_HOME\cmdline-tools" | Out-Null
  Copy-Item -LiteralPath "$root\commandtools\cmdline-tools" -Destination "$env:ANDROID_HOME\cmdline-tools\latest" -Recurse
}
$manager = "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat"
1..100 | ForEach-Object { 'y' } | & $manager --licenses
if ($LASTEXITCODE -ne 0) { throw 'SDK license setup failed' }
& $manager 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'ndk;28.2.13676358'
if ($LASTEXITCODE -ne 0) { throw 'SDK installation failed' }
rustup target add aarch64-linux-android x86_64-linux-android
if ($LASTEXITCODE -ne 0) { throw 'Rust Android target setup failed' }
Write-Output 'Android build toolchain ready'
