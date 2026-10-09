# ============================================================
# CONNECT RAZORPAY (live or test) — install real credentials safely.
#
# The current project secrets hold 64-char hex placeholders, so every
# Razorpay call fails authentication. This script:
#   1. takes the real Key ID + Key Secret (secret hidden, never printed),
#   2. VERIFIES the pair against Razorpay before storing it,
#   3. checks whether the account accepts a USD (international) order,
#   4. installs RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET,
#   5. optionally installs the webhook secret,
#   6. offers to switch checkout ON, but ONLY if the pair verified.
#
# Nothing secret is printed, passed as an argument, or written to disk.
# Run it locally in PowerShell (7 recommended so the secret is hidden).
# ============================================================
$ErrorActionPreference = "Stop"
$root    = "C:\Dev\reach-ai-agent"
$proj    = "zvohdvopmvzsujktrdmu"
$envFile = Join-Path $root ".env"
$mgmtApi = "https://api.supabase.com/v1/projects/$proj/secrets"

function Get-MgmtToken {
    $line = Get-Content $envFile | Where-Object { $_ -match '^SUPABASE_ACCESS_TOKEN=' } | Select-Object -First 1
    if (-not $line) { Write-Host "Could not find SUPABASE_ACCESS_TOKEN in .env" -ForegroundColor Red; Read-Host "Enter to close"; exit 1 }
    return ($line -replace '^SUPABASE_ACCESS_TOKEN=', '').Trim().Trim('"')
}

function Set-Secret($name, $value) {
    $body = ConvertTo-Json -Compress -InputObject @(@{ name = $name; value = $value })
    Invoke-RestMethod -Uri $mgmtApi -Method Post -Headers @{ Authorization = "Bearer $mgmt" } `
        -ContentType "application/json" -Body $body | Out-Null
    Write-Host "   installed: $name" -ForegroundColor Green
}

$mgmt = Get-MgmtToken
$isMaskable = $PSVersionTable.PSVersion.Major -ge 6

Write-Host ""
Write-Host "RAZORPAY CONNECT" -ForegroundColor Cyan
Write-Host "Get these from Razorpay Dashboard -> Account & Settings -> API Keys." -ForegroundColor DarkGray
Write-Host "Use rzp_live_* for real money, rzp_test_* for sandbox." -ForegroundColor DarkGray
Write-Host ""

$keyId = (Read-Host "Paste RAZORPAY_KEY_ID").Trim()
if ([string]::IsNullOrWhiteSpace($keyId) -or $keyId -notmatch '^rzp_(live|test)_[A-Za-z0-9]+$') {
    Write-Host "That does not look like a Razorpay key id (expected rzp_live_... or rzp_test_...). Aborted." -ForegroundColor Red
    Read-Host "Enter to close"; exit 1
}

if ($isMaskable) { Write-Host "(key secret input will be hidden)" -ForegroundColor DarkGray }
$keySecret = Read-Host "Paste RAZORPAY_KEY_SECRET"
if ([string]::IsNullOrWhiteSpace($keySecret) -or $keySecret -notmatch '^[A-Za-z0-9]+$') {
    Write-Host "Secret was empty or had whitespace/symbols. Aborted, nothing sent." -ForegroundColor Red
    Read-Host "Enter to close"; exit 1
}

$pair = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${keyId}:${keySecret}"))
$hdr  = @{ Authorization = "Basic $pair" }

# 1) Verify the pair BEFORE storing it.
$authOk = $false
try {
    Invoke-RestMethod -Uri "https://api.razorpay.com/v1/orders?count=1" -Headers $hdr -Method Get | Out-Null
    $authOk = $true
    Write-Host "PASS  credentials verified (Razorpay auth OK)" -ForegroundColor Green
} catch {
    Write-Host "FAIL  Razorpay rejected these credentials: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "      Nothing was stored. Check the key id/secret and mode (live vs test)." -ForegroundColor DarkGray
    Read-Host "Enter to close"; exit 1
}

# 2) International readiness: can we mint a USD order? (abandoned, never charged)
$intlOk = $false
try {
    $body = ConvertTo-Json -Compress -InputObject @{
        amount   = 100
        currency = "USD"
        receipt  = "preflight_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
        notes    = @{ preflight = "true" }
    }
    $order = Invoke-RestMethod -Uri "https://api.razorpay.com/v1/orders" -Headers $hdr `
        -Method Post -ContentType "application/json" -Body $body
    $intlOk = $true
    Write-Host "PASS  USD (international) order accepted: $($order.id)" -ForegroundColor Green
} catch {
    Write-Host "WARN  USD order rejected: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "      Enable International Payments / USD in the Razorpay dashboard (needs KYC)." -ForegroundColor DarkGray
    Write-Host "      Domestic cards can still work once checkout is on." -ForegroundColor DarkGray
}

# 3) Store the verified credentials.
Write-Host ""
Write-Host "Installing credentials..." -ForegroundColor Cyan
Set-Secret "RAZORPAY_KEY_ID" $keyId
Set-Secret "RAZORPAY_KEY_SECRET" $keySecret

# 4) Optional webhook secret (Razorpay Dashboard -> Webhooks -> secret).
if ($isMaskable) { Write-Host "(webhook secret input will be hidden)" -ForegroundColor DarkGray }
$wh = Read-Host "Paste RAZORPAY_WEBHOOK_SECRET (press Enter to keep the current one)"
if (-not [string]::IsNullOrWhiteSpace($wh)) {
    if ($wh -notmatch '^[A-Za-z0-9]+$') {
        Write-Host "Webhook secret had whitespace/symbols - skipped." -ForegroundColor Yellow
    } else {
        Set-Secret "RAZORPAY_WEBHOOK_SECRET" $wh
    }
}

# 5) Switch checkout on only when safe.
Write-Host ""
$ans = Read-Host "Type ENABLE to switch checkout ON now (anything else leaves it off)"
if ($ans -ceq "ENABLE") {
    Set-Secret "RAZORPAY_CHECKOUT_ENABLED" "true"
    Write-Host "Checkout gate is now ON." -ForegroundColor Green
    if (-not $intlOk) { Write-Host "Remember: international cards still need International Payments enabled on the account." -ForegroundColor Yellow }
} else {
    Write-Host "Checkout left OFF." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done. Re-check any time with:  node scripts/.ops/razorpay-preflight.mjs" -ForegroundColor Cyan
Read-Host "Press Enter to close"
