[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$expectedVersion = "circom compiler 2.2.1"
$actualVersion = (& circom --version 2>&1) -join " "
if ($LASTEXITCODE -ne 0 -or $actualVersion.Trim() -ne $expectedVersion) {
    throw "[z1-circom] Expected '$expectedVersion'; found '$($actualVersion.Trim())'."
}

$packageRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $packageRoot "circuits\smoke.circom"
$output = Join-Path $packageRoot "build\smoke"
New-Item -ItemType Directory -Force -Path $output | Out-Null

& circom $source --r1cs --wasm --sym --output $output
if ($LASTEXITCODE -ne 0) {
    throw "[z1-circom] Smoke circuit compilation failed with exit code $LASTEXITCODE."
}
