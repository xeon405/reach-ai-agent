# Push the PayPal secrets from the repo-root .env to the Supabase project.
#
# Why this exists: pasting a client secret into a chat transcript compromises
# it (see AGENTS.md "Secrets"). This reads the values locally, posts them
# straight to the Management API, and prints only NAMES and lengths.
#
# Prereqs, all in C:\Dev\reach-ai-agent\.env (gitignored):
#   PAYPAL_ENV=sandbox|live
#   PAYPAL_CLIENT_ID=...
#   PAYPAL_CLIENT_SECRET=...
#   PAYPAL_WEBHOOK_ID=...          (from the webhook you register in PayPal)
#   PAYPAL_CHECKOUT_ENABLED=true|false
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\.ops\set-paypal-secrets.ps1
$ErrorActionPreference = "Stop"
$root    = "C:\Dev\reach-ai-agent"
$proj    = "zvohdvopmvzsujktrdmu"
$envFile = Join-Path $root ".env"

function Read-EnvValue([string]$name) {
    $line = Get-Content $envFile | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
    if (-not $line) { return $null }
    $value = ($line -replace "^$name=", "").Trim()
    # Strip an inline comment that follows whitespace (".env.example" style).
    $value = ($value -replace "\s+#.*$", "").Trim()
    return $value.Trim('"').Trim("'")
}

$mgmt = Read-EnvValue "SUPABASE_ACCESS_TOKEN"
if (-not $mgmt) { Write-Host "Could not find SUPABASE_ACCESS_TOKEN in .env" -ForegroundColor Red; exit 1 }

$required = @("PAYPAL_ENV", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET")
$secrets  = @()
foreach ($name in $required + @("PAYPAL_WEBHOOK_ID", "PAYPAL_CHECKOUT_ENABLED")) {
    $value = Read-EnvValue $name
    if ([string]::IsNullOrWhiteSpace($value)) {
        if ($required -contains $name) { Write-Host "Missing required value: $name" -ForegroundColor Red; exit 1 }
        Write-Host "Skipping empty optional value: $name" -ForegroundColor DarkGray
        continue
    }
    $secrets += @{ name = $name; value = $value }
}

# Fail closed: never enable checkout by accident on a typo.
$gate = ($secrets | Where-Object { $_.name -eq "PAYPAL_CHECKOUT_ENABLED" }).value
if ($gate -and $gate -ne "true" -and $gate -ne "false") {
    Write-Host "PAYPAL_CHECKOUT_ENABLED must be exactly 'true' or 'false' (got '$gate')" -ForegroundColor Red
    exit 1
}

$body = ConvertTo-Json -Compress -InputObject $secrets

try {
    $resp = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$proj/secrets" `
                -Method Post -Headers @{ Authorization = "Bearer $mgmt" } `
                -ContentType "application/json" -Body $body

    Write-Host ""
    Write-Host "OK - PayPal secrets installed (values never displayed)." -ForegroundColor Green
    foreach ($s in $secrets) {
        Write-Host ("   updated: {0} (length {1})" -f $s.name, $s.value.Length)
    }
    Write-Host ""
    Write-Host "Next: redeploy the three paypal-* functions so they pick up the new values." -ForegroundColor Cyan
}
catch {
    Write-Host ""
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "(the secret values themselves are never shown here)" -ForegroundColor DarkGray
    exit 1
}
finally {
    $secrets = $null
    $body    = $null
}
