[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$SourceUrl = "https://www.code.go.kr/etc/codeFullDown.do"
$HomehuntRoot = Split-Path -Parent $PSScriptRoot
$OutputPath = Join-Path $HomehuntRoot "data/law-districts.json"
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("homehunt-law-codes-" + [System.Guid]::NewGuid().ToString("N"))
$ArchivePath = Join-Path $TempRoot "law-districts.zip"
$ExtractPath = Join-Path $TempRoot "extracted"
$LawCodeName = -join @([char]0xbc95, [char]0xc815, [char]0xb3d9, [char]0xcf54, [char]0xb4dc)
$ExistingStatus = -join @([char]0xc874, [char]0xc7ac)

try {
    New-Item -ItemType Directory -Path $ExtractPath -Force | Out-Null

    Invoke-WebRequest `
        -Uri $SourceUrl `
        -Method Post `
        -ContentType "application/x-www-form-urlencoded" `
        -Body @{ codeseId = $LawCodeName } `
        -OutFile $ArchivePath

    $archiveStream = [System.IO.File]::OpenRead($ArchivePath)
    try {
        if ($archiveStream.Length -lt 2 -or $archiveStream.ReadByte() -ne 0x50 -or $archiveStream.ReadByte() -ne 0x4B) {
            throw "The code.go.kr response is not a ZIP archive."
        }
    }
    finally {
        $archiveStream.Dispose()
    }

    $ArchiveSha256 = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractPath -Force

    $SourceFile = Get-ChildItem -LiteralPath $ExtractPath -Recurse -File |
        Sort-Object Length -Descending |
        Select-Object -First 1

    if ($null -eq $SourceFile) {
        throw "The source file was not found inside the archive."
    }

    # PowerShell 7/.NET Core requires the legacy code-page provider for CP949.
    try {
        [System.Text.Encoding]::RegisterProvider([System.Text.CodePagesEncodingProvider]::Instance)
    }
    catch {
        # Windows PowerShell/.NET Framework already provides legacy code pages.
    }

    $Cp949 = [System.Text.Encoding]::GetEncoding(949)
    $Lines = [System.IO.File]::ReadAllLines($SourceFile.FullName, $Cp949)

    if ($Lines.Count -lt 10001) {
        throw "The source row count is unexpectedly small: $($Lines.Count)"
    }

    $SourceRowCount = 0
    $CurrentRowCount = 0
    $Districts = [System.Collections.Generic.List[object]]::new()

    foreach ($Line in $Lines | Select-Object -Skip 1) {
        if ([string]::IsNullOrWhiteSpace($Line)) {
            continue
        }

        $SourceRowCount += 1
        $Columns = $Line -split "`t"
        if ($Columns.Count -lt 3) {
            continue
        }

        $FullCode = $Columns[0].Trim()
        $FullName = $Columns[1].Trim()
        $Status = $Columns[2].Trim()

        if ($Status -ne $ExistingStatus) {
            continue
        }

        $CurrentRowCount += 1

        # The first five digits are the district code. Select district-level rows.
        if ($FullCode -notmatch '^\d{10}$' -or
            $FullCode.Substring(5, 5) -ne "00000" -or
            $FullCode.Substring(2, 3) -eq "000") {
            continue
        }

        $NameParts = @($FullName -split '\s+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        if ($NameParts.Count -eq 0) {
            continue
        }

        $Sido = $NameParts[0]
        if ($NameParts.Count -eq 1) {
            # Sejong is represented as a single token in the source.
            $Sigungu = $NameParts[0]
        }
        else {
            $Sigungu = ($NameParts[1..($NameParts.Count - 1)] -join " ")
        }

        $Districts.Add([pscustomobject][ordered]@{
            code = $FullCode.Substring(0, 5)
            sido = $Sido
            sigungu = $Sigungu
            name = $FullName
        })
    }

    $Districts = @($Districts | Sort-Object code)
    $DuplicateCodes = @($Districts | Group-Object -Property code | Where-Object { $_.Count -gt 1 })

    if ($Districts.Count -lt 250 -or $Districts.Count -gt 350) {
        throw "District count is outside the expected 250-350 range: $($Districts.Count)"
    }
    if ($DuplicateCodes.Count -gt 0) {
        $DuplicateList = ($DuplicateCodes.Name -join ", ")
        throw "Duplicate district codes: $DuplicateList"
    }
    if (@($Districts | Where-Object { $_.code -notmatch '^\d{5}$' -or [string]::IsNullOrWhiteSpace($_.name) }).Count -gt 0) {
        throw "A district code or name is malformed."
    }

    $Payload = [ordered]@{
        schemaVersion = 1
        source = [ordered]@{
            name = "code.go.kr legal district full dataset"
            url = $SourceUrl
            retrievedAt = [System.DateTimeOffset]::UtcNow.ToString("o")
            archiveSha256 = $ArchiveSha256
            sourceRowCount = $SourceRowCount
            currentRowCount = $CurrentRowCount
            districtCount = $Districts.Count
        }
        districts = $Districts
    }

    $Json = $Payload | ConvertTo-Json -Depth 6
    $Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($OutputPath, $Json + [System.Environment]::NewLine, $Utf8NoBom)

    Write-Host "Updated $OutputPath with $($Districts.Count) current districts."
}
finally {
    if (Test-Path -LiteralPath $TempRoot) {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force
    }
}
