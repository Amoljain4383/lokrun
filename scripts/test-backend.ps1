# ==============================================================================
# Lokrun Civic-Infrastructure Platform - Windows PowerShell Test Runner
# Second-Year AI & Data Science Community Engagement Project
# SNJB's KBJ College of Engineering, Chandwad
# ==============================================================================

Write-Host "Running Lokrun Backend Comprehensive Test Suite in PowerShell..." -ForegroundColor Cyan

# Execute verify-all.js which validates all 8 core project specifications
node "$PSScriptRoot\verify-all.js"

$testExitCode = $LASTEXITCODE

if ($testExitCode -eq 0) {
    Write-Host "`nAll verification tests passed successfully!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nSome verification tests failed." -ForegroundColor Red
    exit 1
}
