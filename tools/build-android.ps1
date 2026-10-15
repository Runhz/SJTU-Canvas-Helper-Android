# Compatibility entry point for existing local launchers.
& (Join-Path $PSScriptRoot 'build-mobile.ps1') @args
exit $LASTEXITCODE