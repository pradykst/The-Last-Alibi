[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$SuiPilotRepository = "https://github.com/contract-hero/sui-pilot.git"
$SuiPilotCommit = "034e4d2b657018bf9863c091febffcf74c886f28"
$MinimumNodeMajor = 18

function Stop-Setup {
    param([Parameter(Mandatory)][string]$Message)

    throw "[setup-sui-pilot] $Message"
}

function Get-RequiredCommand {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$InstallHint
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) {
        Stop-Setup "Required command '$Name' is unavailable. $InstallHint This script does not install system-wide dependencies."
    }

    return $command.Source
}

function Get-CommandVersion {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Path
    )

    $versionOutput = & $Path --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Stop-Setup "'$Name --version' failed with exit code $LASTEXITCODE.`n$($versionOutput -join [Environment]::NewLine)"
    }

    $version = ($versionOutput -join " ").Trim()
    if ([string]::IsNullOrWhiteSpace($version)) {
        Stop-Setup "'$Name --version' returned no version information."
    }

    Write-Host ("{0}: {1}" -f $Name, $version)
    return $version
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$Description
    )

    Write-Host ("> {0} {1}" -f $FilePath, ($Arguments -join " "))
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        Stop-Setup "$Description failed with exit code $LASTEXITCODE."
    }
}

function Get-SemVer {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$VersionOutput
    )

    $match = [regex]::Match($VersionOutput, "(?<!\d)(\d+\.\d+\.\d+)(?!\d)")
    if (-not $match.Success) {
        Stop-Setup "Could not parse a semantic version from '$Name --version': $VersionOutput"
    }

    return $match.Groups[1].Value
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$toolingRoot = Join-Path $repositoryRoot ".tools"
$suiPilotRoot = Join-Path $toolingRoot "sui-pilot"

$git = Get-RequiredCommand "git" "Install Git and make it available on PATH."
$node = Get-RequiredCommand "node" "Install Node.js $MinimumNodeMajor or newer and make it available on PATH."
$pnpm = Get-RequiredCommand "pnpm" "Install pnpm and make it available on PATH."
$sui = Get-RequiredCommand "sui" "Install the Sui CLI with your preferred explicit toolchain manager and make it available on PATH."
$moveAnalyzer = Get-RequiredCommand "move-analyzer" "Install move-analyzer at the same version as the Sui CLI and make it available on PATH."

$nodeVersion = Get-CommandVersion "node" $node
$pnpmVersion = Get-CommandVersion "pnpm" $pnpm
$suiVersion = Get-CommandVersion "sui" $sui
$moveAnalyzerVersion = Get-CommandVersion "move-analyzer" $moveAnalyzer

$nodeMajorMatch = [regex]::Match($nodeVersion, "v?(\d+)")
if (-not $nodeMajorMatch.Success -or [int]$nodeMajorMatch.Groups[1].Value -lt $MinimumNodeMajor) {
    Stop-Setup "Node.js $MinimumNodeMajor or newer is required; found '$nodeVersion'."
}

$suiSemVer = Get-SemVer "sui" $suiVersion
$moveAnalyzerSemVer = Get-SemVer "move-analyzer" $moveAnalyzerVersion
if ($suiSemVer -ne $moveAnalyzerSemVer) {
    Stop-Setup "Sui CLI and move-analyzer must have matching versions; found sui $suiSemVer and move-analyzer $moveAnalyzerSemVer."
}

Write-Host "pnpm: $pnpmVersion"
Write-Host "Sui toolchain versions match: $suiSemVer"

if (Test-Path $suiPilotRoot) {
    if (-not (Test-Path (Join-Path $suiPilotRoot ".git"))) {
        Stop-Setup "'$suiPilotRoot' exists but is not a Git clone. Move or remove it explicitly, then rerun this script."
    }

    $origin = (& $git -C $suiPilotRoot remote get-url origin 2>&1) -join " "
    if ($LASTEXITCODE -ne 0 -or $origin.Trim() -ne $SuiPilotRepository) {
        Stop-Setup "Existing clone origin is '$($origin.Trim())'; expected '$SuiPilotRepository'."
    }

    $dirtyState = (& $git -C $suiPilotRoot status --porcelain 2>&1) -join [Environment]::NewLine
    if ($LASTEXITCODE -ne 0) {
        Stop-Setup "Could not inspect the existing sui-pilot clone."
    }
    if (-not [string]::IsNullOrWhiteSpace($dirtyState)) {
        Stop-Setup "The existing sui-pilot clone has local changes. Preserve or discard them explicitly before rerunning."
    }
} else {
    New-Item -ItemType Directory -Force -Path $toolingRoot | Out-Null
    Invoke-Checked $git @(
        "clone",
        "--filter=blob:none",
        "--no-checkout",
        $SuiPilotRepository,
        $suiPilotRoot
    ) "Cloning sui-pilot"
}

& $git -C $suiPilotRoot cat-file -e "$SuiPilotCommit`^{commit}" 2>$null
if ($LASTEXITCODE -ne 0) {
    Invoke-Checked $git @(
        "-C",
        $suiPilotRoot,
        "fetch",
        "--depth",
        "1",
        "origin",
        $SuiPilotCommit
    ) "Fetching pinned sui-pilot commit"
}

Invoke-Checked $git @(
    "-C",
    $suiPilotRoot,
    "checkout",
    "--detach",
    $SuiPilotCommit
) "Checking out pinned sui-pilot commit"

$checkedOutCommit = ((& $git -C $suiPilotRoot rev-parse HEAD 2>&1) -join " ").Trim()
if ($LASTEXITCODE -ne 0 -or $checkedOutCommit -ne $SuiPilotCommit) {
    Stop-Setup "Expected sui-pilot commit $SuiPilotCommit but found '$checkedOutCommit'."
}

$moveLspRoot = Join-Path $suiPilotRoot "mcp\move-lsp-mcp"
$suiProverRoot = Join-Path $suiPilotRoot "mcp\sui-prover-mcp"

foreach ($component in @(
    @{ Name = "move-lsp-mcp"; Path = $moveLspRoot },
    @{ Name = "sui-prover-mcp"; Path = $suiProverRoot }
)) {
    Invoke-Checked $pnpm @(
        "--dir",
        $component.Path,
        "install",
        "--frozen-lockfile"
    ) "Installing $($component.Name) dependencies"

    Invoke-Checked $pnpm @(
        "--dir",
        $component.Path,
        "run",
        "build"
    ) "Building $($component.Name)"

    $entryPoint = Join-Path $component.Path "dist\index.js"
    if (-not (Test-Path $entryPoint -PathType Leaf)) {
        Stop-Setup "$($component.Name) build did not produce '$entryPoint'."
    }
}

Write-Host "sui-pilot setup complete."
Write-Host "Repository: $SuiPilotRepository"
Write-Host "Pinned commit: $SuiPilotCommit"
Write-Host "Local clone: $suiPilotRoot"
