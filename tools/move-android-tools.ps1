param([string]$ToolRoot='D:\Codex\android-toolchain')
$ErrorActionPreference='Stop'
chcp 65001 > $null
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Text.UTF8Encoding]::new($false)
$env:JAVA_HOME=Join-Path $ToolRoot 'jdk\jdk-17.0.20.1+1'
& (Join-Path $ToolRoot 'gradle-8.13\bin\gradle.bat') --stop
if($LASTEXITCODE -ne 0){throw 'Could not stop Gradle'}
$userRoot=[Environment]::GetFolderPath('UserProfile')
$pairs=@(
    @{Source=(Join-Path $userRoot '.android');Target=(Join-Path $ToolRoot 'user-data\android')},
    @{Source=(Join-Path $userRoot '.gradle');Target=(Join-Path $ToolRoot 'user-data\gradle')},
    @{Source=(Join-Path $userRoot '.cargo\registry');Target=(Join-Path $ToolRoot 'user-data\cargo-registry')},
    @{Source=(Join-Path $userRoot '.rustup');Target=(Join-Path $ToolRoot 'user-data\rustup')}
)
New-Item -ItemType Directory -Force -Path (Join-Path $ToolRoot 'user-data') | Out-Null
foreach($pair in $pairs){
    $source=[IO.Path]::GetFullPath($pair.Source);$target=[IO.Path]::GetFullPath($pair.Target)
    if(!$source.StartsWith($userRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or !$target.StartsWith([IO.Path]::GetFullPath($ToolRoot)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Migration path escaped allowed roots'}
    if(!(Test-Path -LiteralPath $source)){continue}
    $item=Get-Item -LiteralPath $source -Force
    if($item.LinkType){if($item.Target -ne $target){throw "Unexpected link: $source"};continue}
    $before=Get-ChildItem -LiteralPath $source -File -Recurse -Force | Measure-Object Length -Sum
    & robocopy.exe $source $target /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
    if($LASTEXITCODE -ge 8){throw "Copy failed: $source"}
    # Verify every file before releasing C: space, including the existing signing key.
    foreach($file in Get-ChildItem -LiteralPath $source -Recurse -File -Force){
        $copy=Join-Path $target ([IO.Path]::GetRelativePath($source,$file.FullName))
        if(!(Test-Path -LiteralPath $copy) -or (Get-Item -LiteralPath $copy).Length -ne $file.Length -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash){throw "Verification failed: $($file.FullName)"}
    }
    # Both absolute paths above have been checked; use PowerShell end to end for removal.
    Remove-Item -LiteralPath $source -Recurse -Force
    New-Item -ItemType Junction -Path $source -Target $target | Out-Null
    Write-Output ("MOVED {0}: {1:N2} GiB, {2} files; SHA-256 verified" -f $source,($before.Sum/1GB),$before.Count)
}
[Environment]::SetEnvironmentVariable('GRADLE_USER_HOME',(Join-Path $ToolRoot 'user-data\gradle'),'User')
[Environment]::SetEnvironmentVariable('ANDROID_AVD_HOME',(Join-Path $ToolRoot 'user-data\android\avd'),'User')
[Environment]::SetEnvironmentVariable('RUSTUP_HOME',(Join-Path $ToolRoot 'user-data\rustup'),'User')
Write-Output 'Migration complete; original paths remain compatible through junctions.'
