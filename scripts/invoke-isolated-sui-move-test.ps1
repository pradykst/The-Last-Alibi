[CmdletBinding()]
param(
    [string]$TestFilter = "",
    [switch]$BuildOnly,
    [switch]$Lint,
    [string]$SuiExecutable = "$env:LOCALAPPDATA\bin\sui.exe"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$expectedSuiVersion = "sui 1.76.0-6effb4523834"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$temporaryParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporaryRoot = Join-Path $temporaryParent (
    "the-last-alibi-z1-wallet-free-{0}" -f [Guid]::NewGuid().ToString("N")
)
$clientConfig = Join-Path $temporaryRoot "client.yaml"
$keystore = Join-Path $temporaryRoot "sui.keystore"
$utf8NoBom = New-Object Text.UTF8Encoding($false)

function Quote-NativeArgument {
    param([Parameter(Mandatory)][string]$Value)

    if ($Value -notmatch '[\s"]') {
        return $Value
    }
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Assert-WalletFreeDirectory {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$ExpectedConfig,
        [Parameter(Mandatory)][string]$ExpectedConfigHash
    )

    $expectedFiles = @("client.yaml", "sui.keystore")
    $rootPrefix = [IO.Path]::GetFullPath($Root).TrimEnd("\") + "\"
    $actualFiles = @(
        Get-ChildItem -LiteralPath $Root -Recurse -Force -File | ForEach-Object {
            $fullName = [IO.Path]::GetFullPath($_.FullName)
            if (-not $fullName.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                throw "[isolated-sui] Temporary file escaped its configuration directory."
            }
            $fullName.Substring($rootPrefix.Length).Replace("\", "/")
        }
    )
    $unexpectedFiles = @($actualFiles | Where-Object { $_ -notin $expectedFiles })
    if ($unexpectedFiles.Count -gt 0 -or $actualFiles.Count -ne $expectedFiles.Count) {
        throw "[isolated-sui] Unexpected file creation detected in the temporary configuration."
    }

    $keystoreContents = [IO.File]::ReadAllText((Join-Path $Root "sui.keystore"))
    if ($keystoreContents -ne "[]`n") {
        throw "[isolated-sui] The temporary keystore is no longer exactly empty."
    }

    $configContents = [IO.File]::ReadAllText((Join-Path $Root "client.yaml"))
    if ($configContents -ne $ExpectedConfig) {
        throw "[isolated-sui] The temporary client configuration was modified."
    }
    $configHash = (Get-FileHash -LiteralPath (Join-Path $Root "client.yaml") -Algorithm SHA256).Hash
    if ($configHash -ne $ExpectedConfigHash) {
        throw "[isolated-sui] The temporary client configuration hash changed."
    }
}

function Invoke-IsolatedSui {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$ConfigurationRoot
    )

    $processInfo = New-Object Diagnostics.ProcessStartInfo
    $processInfo.FileName = $SuiExecutable
    $processInfo.Arguments = (($Arguments | ForEach-Object { Quote-NativeArgument $_ }) -join " ")
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardInput = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.CreateNoWindow = $true
    $processInfo.EnvironmentVariables["SUI_CONFIG_DIR"] = $ConfigurationRoot
    $processInfo.EnvironmentVariables["CI"] = "1"

    $process = New-Object Diagnostics.Process
    $process.StartInfo = $processInfo
    if (-not $process.Start()) {
        throw "[isolated-sui] Failed to start the Sui child process."
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    # An initialization prompt can never accept its default affirmative response.
    $process.StandardInput.WriteLine("n")
    $process.StandardInput.Close()
    $process.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $combined = "$stdout`n$stderr"

    $forbiddenOutput = '(?i)(create one \[[Yy]/[Nn]\]|generated new keypair|secret recovery phrase|recovery phrase|created .*client\.yaml|alias for address)'
    if ($combined -match $forbiddenOutput) {
        throw "[isolated-sui] Sui attempted client or key initialization; output redacted."
    }
    if ($process.ExitCode -ne 0) {
        $sanitized = ($combined -replace '(?i)\b0x[0-9a-f]{40,}\b', '<redacted-hex>')
        throw "[isolated-sui] Sui exited with code $($process.ExitCode).`n$sanitized"
    }

    return $combined.Trim()
}

if (-not (Test-Path -LiteralPath $SuiExecutable -PathType Leaf)) {
    throw "[isolated-sui] Sui executable is missing: $SuiExecutable"
}

$suiVersion = (& $SuiExecutable --version 2>&1) -join " "
if ($LASTEXITCODE -ne 0 -or $suiVersion.Trim() -ne $expectedSuiVersion) {
    throw "[isolated-sui] Expected '$expectedSuiVersion'; found '$($suiVersion.Trim())'."
}

try {
    New-Item -ItemType Directory -Path $temporaryRoot -ErrorAction Stop | Out-Null
    $resolvedTemporaryRoot = [IO.Path]::GetFullPath($temporaryRoot)
    $resolvedRepositoryRoot = [IO.Path]::GetFullPath($repositoryRoot)
    if (-not $resolvedTemporaryRoot.StartsWith($temporaryParent, [StringComparison]::OrdinalIgnoreCase)) {
        throw "[isolated-sui] Temporary configuration escaped the system temporary directory."
    }
    if ($resolvedTemporaryRoot.StartsWith($resolvedRepositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "[isolated-sui] Temporary wallet-free configuration must remain outside the repository."
    }

    [IO.File]::WriteAllText($keystore, "[]`n", $utf8NoBom)
    $yamlKeystore = ([IO.Path]::GetFullPath($keystore)).Replace("\", "/")
    $expectedConfig = @"
keystore:
  File: "$yamlKeystore"
external_keys: null
envs: []
active_env: null
active_address: null
"@.Replace("`r`n", "`n")
    [IO.File]::WriteAllText($clientConfig, $expectedConfig, $utf8NoBom)
    $expectedConfigHash = (Get-FileHash -LiteralPath $clientConfig -Algorithm SHA256).Hash
    Assert-WalletFreeDirectory $temporaryRoot $expectedConfig $expectedConfigHash

    $parseOutput = Invoke-IsolatedSui @(
        "client",
        "--client.config",
        $clientConfig,
        "envs"
    ) $temporaryRoot
    Assert-WalletFreeDirectory $temporaryRoot $expectedConfig $expectedConfigHash
    if ($parseOutput) {
        Write-Host $parseOutput
    }
    Write-Host "Isolated Sui client configuration parsed without initialization."

    $moveArguments = @(
        "move",
        "--client.config",
        $clientConfig,
        $(if ($BuildOnly) { "build" } else { "test" }),
        "--path",
        (Join-Path $repositoryRoot "contracts\alibi"),
        "--build-env",
        "testnet",
        "--warnings-are-errors"
    )
    if ($Lint) {
        $moveArguments += "--lint"
    }
    if (-not $BuildOnly -and $TestFilter.Length -gt 0) {
        $moveArguments += $TestFilter
    }
    $moveOutput = Invoke-IsolatedSui $moveArguments $temporaryRoot
    Assert-WalletFreeDirectory $temporaryRoot $expectedConfig $expectedConfigHash
    Write-Host $moveOutput
    Write-Host "Isolated keystore remained exactly empty."
} finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        $resolvedForRemoval = [IO.Path]::GetFullPath($temporaryRoot)
        $expectedPrefix = Join-Path $temporaryParent "the-last-alibi-z1-wallet-free-"
        if (-not $resolvedForRemoval.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "[isolated-sui] Refusing to remove an unexpected temporary path."
        }
        Remove-Item -LiteralPath $resolvedForRemoval -Recurse -Force
    }
}
