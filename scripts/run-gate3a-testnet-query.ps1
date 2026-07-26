[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PackageId,
    [Parameter(Mandatory = $true)]
    [string]$LevelId,
    [string]$SuiBinary = "sui"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$proverRoot = Join-Path $repoRoot "circuits/verdict"
$proverBinary = Join-Path $proverRoot "prover/target/release/alibi-verdict-prover.exe"
$queryWasm = Join-Path $proverRoot "build/query/query_js/query.wasm"
$queryR1cs = Join-Path $proverRoot "build/query/query.r1cs"
$queryPk = Join-Path $proverRoot "artifacts/testnet-v1/query-v1.pk"
$queryVk = Join-Path $proverRoot "artifacts/testnet-v1/query-v1.vk"
$commitmentsModule = Join-Path $proverRoot "dist/commitments.js"

function ConvertFrom-SuiJson {
    param([Parameter(Mandatory = $true)][object[]]$Lines)

    $text = $Lines -join "`n"
    $start = $text.IndexOf("{")
    if ($start -lt 0) {
        throw "Sui CLI returned no JSON object."
    }
    return $text.Substring($start) | ConvertFrom-Json
}

function Invoke-SuiJson {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $output = & $SuiBinary @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    try {
        $result = ConvertFrom-SuiJson @($output)
    } catch {
        $detail = ($output -join "`n")
        $detail = [regex]::Replace($detail, "\[(?:\d+,){10,}\d+\]", "[proof bytes omitted]")
        $detail = [regex]::Replace($detail, "[0-9a-fA-F]{256,}", "[long public bytes omitted]")
        if ($detail.Length -gt 1200) { $detail = $detail.Substring($detail.Length - 1200) }
        throw "A Sui testnet operation was rejected before returning structured effects: $detail"
    }
    if ($exitCode -ne 0 -and -not $result.effects) {
        throw "A Sui testnet operation was rejected before execution."
    }
    return $result
}

function ConvertTo-MoveByteVector {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)

    return "[" + (($Bytes | ForEach-Object { [string]$_ }) -join ",") + "]"
}
function ConvertTo-Hex {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)

    return ([BitConverter]::ToString($Bytes)).Replace("-", "").ToLowerInvariant()
}

function ConvertFrom-Hex {
    param([Parameter(Mandatory = $true)][string]$Hex)

    if ($Hex.Length % 2 -ne 0 -or $Hex -notmatch "^[0-9a-fA-F]+$") {
        throw "A hexadecimal value is malformed."
    }
    $bytes = New-Object byte[] ($Hex.Length / 2)
    for ($index = 0; $index -lt $bytes.Length; $index += 1) {
        $bytes[$index] = [Convert]::ToByte($Hex.Substring($index * 2, 2), 16)
    }
    return $bytes
}

if ((& $SuiBinary client active-env) -ne "testnet") {
    throw "The active Sui environment is not testnet."
}

$requiredFiles = @($proverBinary, $queryWasm, $queryR1cs, $queryPk, $queryVk, $commitmentsModule)
foreach ($path in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "A required local prover artifact is unavailable."
    }
}

$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$randomByte = New-Object byte[] 1
$rng.GetBytes($randomByte)
$suspect = [int]($randomByte[0] % 4)
$rng.GetBytes($randomByte)
$room = [int]($randomByte[0] % 4)
$rng.GetBytes($randomByte)
$weapon = [int]($randomByte[0] % 2)
$rng.GetBytes($randomByte)
$time = [int]($randomByte[0] % 2)
$salt = New-Object byte[] 32
$rng.GetBytes($salt)
$rng.Dispose()
$salt[31] = 0
$saltHex = ConvertTo-Hex $salt

$opening = @{
    suspect = $suspect
    room = $room
    weapon = $weapon
    time = $time
    saltHex = $saltHex
}

$nodeProgram = @'
import { pathToFileURL } from 'node:url';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const opening = JSON.parse(input);
const module = await import(pathToFileURL(process.argv[1]).href);
const commitment = await module.caseCommitment({
  suspect: BigInt(opening.suspect),
  room: BigInt(opening.room),
  weapon: BigInt(opening.weapon),
  time: BigInt(opening.time),
  salt: Buffer.from(opening.saltHex, 'hex'),
});
process.stdout.write(Buffer.from(commitment).toString('hex'));
'@

$commitmentHex = ($opening | ConvertTo-Json -Compress) |
    & node --input-type=module -e $nodeProgram $commitmentsModule
if ($LASTEXITCODE -ne 0 -or $commitmentHex -notmatch "^[0-9a-f]{64}$") {
    throw "Case commitment generation failed."
}
$commitmentBytes = ConvertFrom-Hex $commitmentHex

$create = Invoke-SuiJson @(
    "client", "call",
    "--package", $PackageId,
    "--module", "alibi",
    "--function", "create_session",
    "--args", $LevelId, "0", (ConvertTo-MoveByteVector $commitmentBytes), "1", "1",
    "--gas-budget", "30000000",
    "--json"
)
if ($create.effects.status.status -ne "success") {
    throw "Session creation failed."
}
$sessions = @(
    $create.objectChanges |
        Where-Object {
            $_.type -eq "created" -and
            $_.objectType -eq "$PackageId`::alibi::GameSession"
        }
)
if ($sessions.Count -ne 1) {
    throw "Session creation did not produce exactly one canonical session."
}
$sessionId = $sessions[0].objectId

$canonicalSession = Invoke-SuiJson @("client", "object", $sessionId, "--json")
$expectedCommitmentBase64 = [Convert]::ToBase64String($commitmentBytes)
if ($canonicalSession.content.case_commitment -ne $expectedCommitmentBase64) {
    throw "The canonical session commitment differs from the in-memory proof witness commitment."
}


$authorize = Invoke-SuiJson @(
    "client", "call",
    "--package", $PackageId,
    "--module", "alibi",
    "--function", "authorize_query",
    "--args", $sessionId, $LevelId, "0", "0", "0x6",
    "--gas-budget", "30000000",
    "--json"
)
if ($authorize.effects.status.status -ne "success") {
    throw "Query authorization failed."
}

$result = $suspect -eq 0
$witness = @{
    case = $opening
    sessionIdHex = $sessionId.Substring(2)
    levelIdHex = $LevelId.Substring(2)
    queryNonce = "0"
    predicateId = 0
    result = $result
}
$proofText = ($witness | ConvertTo-Json -Compress -Depth 4) |
    & $proverBinary "prove-query" $queryWasm $queryR1cs $queryPk
if ($LASTEXITCODE -ne 0) {
    throw "Query proof generation failed."
}
$proof = $proofText | ConvertFrom-Json

$publicInputProgram = @'
import { pathToFileURL } from 'node:url';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const values = JSON.parse(input);
const module = await import(pathToFileURL(process.argv[1]).href);
const domain = module.sessionQueryDomainCommitment(
  Buffer.from(values.sessionIdHex, 'hex'),
  Buffer.from(values.levelIdHex, 'hex'),
  0n,
);
const predicate = await module.registeredPredicateCommitment(0n, 0n, 0n);
const encoded = module.encodeQueryPublicInputs({
  caseCommitment: Buffer.from(values.caseCommitmentHex, 'hex'),
  sessionQueryDomainCommitment: domain,
  predicateCommitment: predicate,
  result: values.result,
});
process.stdout.write(Buffer.from(encoded.bytes).toString('hex'));
'@
$expectedPublicInputs = @{
    caseCommitmentHex = $commitmentHex
    sessionIdHex = $sessionId.Substring(2)
    levelIdHex = $LevelId.Substring(2)
    result = $result
} | ConvertTo-Json -Compress |
    & node --input-type=module -e $publicInputProgram $commitmentsModule
if ($LASTEXITCODE -ne 0 -or $expectedPublicInputs -ne $proof.publicInputsHex) {
    throw "Rust and TypeScript query public inputs disagree."
}

$verificationText = @{
    proofHex = $proof.proofHex
    publicInputsHex = $proof.publicInputsHex
} | ConvertTo-Json -Compress |
    & $proverBinary "verify-query" $queryVk
if ($LASTEXITCODE -ne 0) {
    throw "Off-chain query proof verification failed."
}
$verification = $verificationText | ConvertFrom-Json
if (-not $verification.verified) {
    throw "Off-chain query proof verification rejected the proof."
}

$proofBytes = ConvertFrom-Hex $proof.proofHex
$proofVector = ConvertTo-MoveByteVector $proofBytes
$resultArgument = if ($result) { "true" } else { "false" }
$ptbArguments = @(
    "client", "ptb",
    "--make-move-vec", "<u8>", $proofVector,
    "--assign", "proofBytes",
    "--move-call", "$PackageId`::alibi::verify_query_proof",
    "@$sessionId", "@$LevelId", "0", "0", "18446744073709551615", $resultArgument, "proofBytes",
    "--assign", "receipt",
    "--move-call", "$PackageId`::alibi::resolve_query",
    "@$sessionId", "@$LevelId", "receipt",
    "--gas-budget", "30000000"
)
$dryRunOutput = & $SuiBinary @($ptbArguments + @("--dry-run")) 2>&1
$dryRunText = $dryRunOutput -join "`n"
if ($LASTEXITCODE -ne 0 -or $dryRunText -notmatch "execution status: success") {
    $dryRunText = [regex]::Replace($dryRunText, "\[(?:\d+,){10,}\d+\]", "[proof bytes omitted]")
    if ($dryRunText.Length -gt 800) { $dryRunText = $dryRunText.Substring($dryRunText.Length - 800) }
    throw "Native query verification dry run failed: $dryRunText"
}

$resolvedOutput = & $SuiBinary @($ptbArguments + @("--summary")) 2>&1
$resolvedText = $resolvedOutput -join "`n"
if ($LASTEXITCODE -ne 0) {
    throw "Native query verification or resolution failed after submission."
}
$digestMatch = [regex]::Match($resolvedText, "(?:Transaction Digest|Digest):\s*([1-9A-HJ-NP-Za-km-z]{40,50})")
if (-not $digestMatch.Success) {
    throw "The successful query transaction digest could not be decoded."
}
$resolved = Invoke-SuiJson @("client", "tx-block", $digestMatch.Groups[1].Value, "--json")
if ($resolved.effects.status.status -ne "success" -or -not $resolved.checkpoint) {
    throw "The query transaction was not confirmed successfully."
}

$replayOutput = & $SuiBinary @($ptbArguments + @("--dry-run")) 2>&1
$replayText = $replayOutput -join "`n"
$replayRejected = $LASTEXITCODE -ne 0 -or $replayText -match "execution status: failure"
if (-not $replayRejected) {
    throw "A replayed query resolution was not rejected."
}


$sha256 = [Security.Cryptography.SHA256]::Create()
try {
    $proofHash = ConvertTo-Hex ($sha256.ComputeHash($proofBytes))
    $publicInputHash = ConvertTo-Hex ($sha256.ComputeHash((ConvertFrom-Hex $proof.publicInputsHex)))
} finally {
    $sha256.Dispose()
}

[pscustomobject]@{
    network = "testnet"
    packageId = $PackageId
    levelId = $LevelId
    sessionId = $sessionId
    sessionCreationDigest = $create.digest
    sessionCreationCheckpoint = [string]$create.checkpoint
    queryAuthorizationDigest = $authorize.digest
    queryAuthorizationCheckpoint = [string]$authorize.checkpoint
    queryResolutionDigest = $resolved.digest
    queryResolutionCheckpoint = [string]$resolved.checkpoint
    nativeProofAccepted = $true
    replayRejected = $true
    publicResult = $resultArgument.ToUpperInvariant()
    proofSha256 = $proofHash
    publicInputsSha256 = $publicInputHash
    verifierIdentitySha256 = $proof.verifierIdentitySha256
} | ConvertTo-Json

# Explicitly discard all in-memory private material before returning.
$opening = $null
$witness = $null
$salt = $null
$saltHex = $null
