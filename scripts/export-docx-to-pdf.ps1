param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [string]$OutputPath
)

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $directory = Split-Path -Path $resolvedInput -Parent
  $filename = [System.IO.Path]::GetFileNameWithoutExtension($resolvedInput)
  $OutputPath = Join-Path $directory ($filename + ".pdf")
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$word = $null
$document = $null

try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  $document = $word.Documents.Open($resolvedInput, $false, $true)
  $document.SaveAs2($resolvedOutput, 17)
  $document.Close($false) | Out-Null
  $document = $null

  $word.Quit() | Out-Null
  $word = $null

  Write-Output $resolvedOutput
} finally {
  if ($document) {
    try {
      $document.Close($false) | Out-Null
    } catch {
    }
  }

  if ($word) {
    try {
      $word.Quit() | Out-Null
    } catch {
    }
  }
}
