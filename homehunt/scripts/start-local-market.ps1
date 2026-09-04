param(
  [switch]$WithoutKey
)

$homehuntPath = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $homehuntPath '.env'
$scriptPath = Join-Path $PSScriptRoot 'local-market-server.mjs'
$plainKey = $null
$keyPointer = [IntPtr]::Zero
$loadedEnvNames = [System.Collections.Generic.List[string]]::new()
$promptedForMolitKey = $false
$allowedEnvNames = @(
  'MOLIT_SERVICE_KEY',
  'TMAP_APP_KEY',
  'KAKAO_REST_API_KEY',
  'KAKAO_DAILY_LIMIT',
  'TRANSIT_PROVIDER',
  'TMAP_DAILY_LIMIT',
  'TRANSIT_CACHE_HOURS',
  'TRANSIT_CONCURRENCY',
  'NAVER_MAPS_CLIENT_ID',
  'NAVER_MAPS_CLIENT_SECRET',
  'NAVER_LOCAL_SEARCH_CLIENT_ID',
  'NAVER_LOCAL_SEARCH_CLIENT_SECRET',
  'HOMEHUNT_LOCAL_API_PORT'
)

function Import-HomeHuntEnv {
  param([string]$LiteralPath)

  if (-not (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) { return }

  $lineNumber = 0
  foreach ($rawLine in Get-Content -LiteralPath $LiteralPath -Encoding UTF8) {
    $lineNumber += 1
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }

    $pair = $line.Split('=', 2)
    if ($pair.Count -ne 2) { throw "잘못된 .env 형식입니다 (줄 $lineNumber)." }

    $name = $pair[0].Trim()
    if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "잘못된 .env 변수명입니다 (줄 $lineNumber)." }
    if ($name -notin $allowedEnvNames) { throw "지원하지 않는 .env 항목입니다 (줄 $lineNumber)." }

    $value = $pair[1].Trim()
    if ($value.Length -ge 2) {
      $isDoubleQuoted = $value.StartsWith('"') -and $value.EndsWith('"')
      $isSingleQuoted = $value.StartsWith("'") -and $value.EndsWith("'")
      if ($isDoubleQuoted -or $isSingleQuoted) { $value = $value.Substring(1, $value.Length - 2) }
    }

    $existing = [Environment]::GetEnvironmentVariable($name, 'Process')
    if ([string]::IsNullOrEmpty($existing)) {
      [Environment]::SetEnvironmentVariable($name, $value, 'Process')
      $loadedEnvNames.Add($name)
    }
  }
}

try {
  Import-HomeHuntEnv -LiteralPath $envPath
  if (-not $WithoutKey -and -not $env:MOLIT_SERVICE_KEY) {
    $secureKey = Read-Host '국토부 일반 인증키를 입력하세요 (화면/파일에 표시되지 않음)' -AsSecureString
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    $env:MOLIT_SERVICE_KEY = $plainKey
    $promptedForMolitKey = $true
  }
  & node $scriptPath
} finally {
  if ($keyPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  }
  $plainKey = $null
  if ($promptedForMolitKey) { Remove-Item Env:MOLIT_SERVICE_KEY -ErrorAction SilentlyContinue }
  foreach ($name in $loadedEnvNames) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
}
