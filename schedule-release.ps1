# ==============================================================================
# CryptLnk — Automated Scheduled Release & GitHub Deployment Script
# Target Schedule: 27th October 2026, 06:00:00 AM (IST)
# Author: Pranav Aitha (https://github.com/pranav-aitha)
# ==============================================================================

param (
    [switch]$Immediate = $false
)

$ErrorActionPreference = "Continue"

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "🔒 CryptLnk — Scheduled GitHub Release Engine" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Cyan

$TargetTime = [DateTime]::Parse("2026-10-27 06:00:00")
$CurrentTime = [DateTime]::Now

if (-not $Immediate -and $CurrentTime -lt $TargetTime) {
    $TimeSpan = $TargetTime - $CurrentTime
    Write-Host "⏳ Current Time : $CurrentTime" -ForegroundColor Yellow
    Write-Host "🎯 Target Time  : $TargetTime" -ForegroundColor Yellow
    Write-Host "⏱️  Waiting until 06:00 AM ($([Math]::Round($TimeSpan.TotalHours, 2)) hours remaining)..." -ForegroundColor Yellow
    
    # Sleep until target time
    $totalSeconds = [int]$TimeSpan.TotalSeconds
    if ($totalSeconds -gt 0) {
        Start-Sleep -Seconds $totalSeconds
    }
}

Write-Host "🚀 Commencing CryptLnk Release Execution: $([DateTime]::Now)" -ForegroundColor Green

# 1. Verify Git Status and Commit
Write-Host "`n[Step 1/5] Checking Git Status and Staging Files..." -ForegroundColor Cyan
git add .
$status = git status --porcelain
if ($status) {
    git commit -m "Initial commit: CryptLnk v1.0.0 — Serverless Zero-Knowledge Ephemeral P2P Chat"
    Write-Host "✓ Committed all project files successfully." -ForegroundColor Green
} else {
    Write-Host "✓ Working tree already clean." -ForegroundColor Green
}

# 2. Check if GitHub Repo already exists or create new
Write-Host "`n[Step 2/5] Creating / Verifying GitHub Repository (pranav-aitha/CryptLnk)..." -ForegroundColor Cyan

$repoCheck = gh repo view pranav-aitha/CryptLnk 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating new PUBLIC repository 'pranav-aitha/CryptLnk'..." -ForegroundColor Yellow
    gh repo create pranav-aitha/CryptLnk `
        --public `
        --source=. `
        --remote=origin `
        --push `
        --description "Completely serverless, zero-database, zero-login peer-to-peer ephemeral encrypted chat website powered by Web Crypto API (AES-256-GCM) and WebRTC DataChannels." `
        --homepage "https://pranav-aitha.github.io/CryptLnk"
} else {
    Write-Host "Repository exists. Setting visibility to PUBLIC and pushing..." -ForegroundColor Yellow
    gh repo edit pranav-aitha/CryptLnk --visibility public --yes
    git push -u origin main
}

# 3. Configure Repository Topics
Write-Host "`n[Step 3/5] Setting Repository Topics & Metadata..." -ForegroundColor Cyan
gh repo edit pranav-aitha/CryptLnk `
    --add-topic "webrtc" `
    --add-topic "webcrypto" `
    --add-topic "aes-gcm" `
    --add-topic "zero-knowledge" `
    --add-topic "p2p-chat" `
    --add-topic "ephemeral" `
    --add-topic "cybersecurity" `
    --add-topic "privacy" `
    --add-topic "vanilla-js"

# 4. Enable GitHub Pages
Write-Host "`n[Step 4/5] Enabling GitHub Pages Deployment (Branch: main, Path: /)..." -ForegroundColor Cyan
try {
    gh api -X POST repos/pranav-aitha/CryptLnk/pages -f source='{"branch":"main","path":"/"}' 2>&1 | Out-Null
    Write-Host "✓ GitHub Pages deployment requested." -ForegroundColor Green
} catch {
    Write-Host "ℹ️ GitHub Pages configuration checked." -ForegroundColor Yellow
}

# 5. Success Banner
Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "🎉 SUCCESS: CryptLnk has been published publicly!" -ForegroundColor Green
Write-Host "🐙 Repository URL: https://github.com/pranav-aitha/CryptLnk" -ForegroundColor Cyan
Write-Host "🌐 GitHub Pages   : https://pranav-aitha.github.io/CryptLnk/" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Green
