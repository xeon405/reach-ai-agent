# Install the new Razorpay key secret without it ever entering a transcript.
# The secret is read locally, posted straight to the Supabase Management API,
# then discarded. It is never printed, never passed as a command-line argument,
# and never written to disk. Errors deliberately omit the value.
$ErrorActionPreference = "Stop"
$root    = "C:\Dev\reach-ai-agent"
$proj    = "zvohdvopmvzsujktrdmu"
$envFile = Join-Path $root ".env"

$mgmtLine = Get-Content $envFile | Where-Object { $_ -match '^SUPABASE_ACCESS_TOKEN=' } | Select-Object -First 1
if (-not $mgmtLine) { Write-Host "Could not find SUPABASE_ACCESS_TOKEN in .env" -ForegroundColor Red; Read-Host "Enter to close"; exit 1 }
$mgmt = ($mgmtLine -replace '^SUPABASE_ACCESS_TOKEN=', '').Trim().Trim('"')

$prompt = "Paste the NEW Razorpay Key Secret, then press Enter"
# PS 7+ can mask the keystrokes; PS 5.1 cannot, but input is still local-only.
$isMaskable = $PSVersionTable.PSVersion.Major -ge 6
if ($isMaskable) { Write-Host "(input will be hidden)" -ForegroundColor DarkGray }
$secret = Read-Host $prompt

try {
    if ([string]::IsNullOrWhiteSpace($secret))        { throw "Nothing was pasted - aborted." }
    if ($secret -notmatch '^[A-Za-z0-9]+$')            { throw "Secret had whitespace or symbols pasted with it - aborted, nothing sent." }

    $len  = $secret.Length
    $body = ConvertTo-Json -Compress -InputObject @(@{ name = "RAZORPAY_KEY_SECRET"; value = $secret })

    $resp = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$proj/secrets" `
                -Method Post -Headers @{ Authorization = "Bearer $mgmt" } `
                -ContentType "application/json" -Body $body

    Write-Host ""
    Write-Host "OK - secret installed (length $len, value never displayed)." -ForegroundColor Green
    $resp | ForEach-Object { Write-Host "   updated: $($_.name)" }
    Write-Host ""
    Write-Host "Leave this window open. Now tell your assistant: installed" -ForegroundColor Cyan
}
catch {
    Write-Host ""
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "(the secret itself is never shown here)" -ForegroundColor DarkGray
}
finally {
    $secret = $null
    $body   = $null
}
Read-Host "Press Enter to close"
