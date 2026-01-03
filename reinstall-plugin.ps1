# GoodVibes Plugin Reinstall Script
# Run this from any directory

Write-Host "1. Uninstalling plugin..." -ForegroundColor Yellow
claude plugin uninstall goodvibes@goodvibes-market

Write-Host "`n2. Removing marketplace..." -ForegroundColor Yellow
claude plugin marketplace remove goodvibes-market

Write-Host "`n3. Adding marketplace..." -ForegroundColor Yellow
claude plugin marketplace add mgd34msu/goodvibes-plugin

Write-Host "`n4. Installing plugin..." -ForegroundColor Yellow
claude plugin install goodvibes@goodvibes-market

Write-Host "`nDone!" -ForegroundColor Green
