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

function Invoke-CircuitCompilation {
    param([Parameter(Mandatory)][string] $Name)

    $source = Join-Path $packageRoot "circuits\$Name.circom"
    $output = Join-Path $packageRoot "build\$Name"
    New-Item -ItemType Directory -Force -Path $output | Out-Null

    & circom $source --r1cs --wasm --sym --output $output
    if ($LASTEXITCODE -ne 0) {
        throw "[z1-circom] '$Name' circuit compilation failed with exit code $LASTEXITCODE."
    }
}

Invoke-CircuitCompilation -Name "smoke"
Invoke-CircuitCompilation -Name "query"
Invoke-CircuitCompilation -Name "verdict"

$witnessCalculator = Join-Path $packageRoot "build\verdict\verdict_js\witness_calculator.js"
$commonJsWitnessCalculator = Join-Path $packageRoot "build\verdict\verdict_js\witness_calculator.cjs"
Copy-Item -LiteralPath $witnessCalculator -Destination $commonJsWitnessCalculator -Force
