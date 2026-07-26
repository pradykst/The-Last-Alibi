[CmdletBinding()]
param(
    [string]$SuiBinary = "sui"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$proverManifest = Join-Path $repoRoot "circuits/verdict/prover/Cargo.toml"
$movePackage = Join-Path $repoRoot "contracts/alibi"

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath exited with code $LASTEXITCODE"
    }
}

Push-Location $repoRoot
try {
    Invoke-Checked "cargo" @(
        "test",
        "--release",
        "--offline",
        "--manifest-path",
        $proverManifest,
        "application::tests"
    )
    Invoke-Checked $SuiBinary @("move", "build", "--path", $movePackage)
    Invoke-Checked $SuiBinary @("move", "test", "--path", $movePackage)
    Invoke-Checked "corepack" @(
        "pnpm",
        "--filter",
        "@alibi/sui",
        "test"
    )
} finally {
    Pop-Location
}
