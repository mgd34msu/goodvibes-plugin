@echo off
REM GoodVibes Plugin Install/Reinstall Script (Windows Batch)
REM Uninstalls and reinstalls the GoodVibes plugin from the marketplace

echo.
echo GoodVibes Plugin Install
echo ========================
echo.

REM Step 1: Uninstall plugin
echo [1/4] Uninstalling GoodVibes plugin...
claude plugin uninstall goodvibes@goodvibes-market 2>nul
if %ERRORLEVEL% EQU 0 (
    echo   Plugin uninstalled
) else (
    echo   Plugin was not installed [continuing]
)

REM Step 2: Remove marketplace
echo [2/4] Removing GoodVibes marketplace...
claude plugin marketplace remove goodvibes-market 2>nul
if %ERRORLEVEL% EQU 0 (
    echo   Marketplace removed
) else (
    echo   Marketplace was not registered [continuing]
)

REM Step 3: Add marketplace
echo [3/4] Adding GoodVibes marketplace...
claude plugin marketplace add mgd34msu/goodvibes-plugin 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Failed to add marketplace
    pause
    exit /b 1
)
echo   Marketplace added

REM Step 4: Install plugin
echo [4/4] Installing GoodVibes plugin...
claude plugin install goodvibes@goodvibes-market 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Failed to install plugin
    pause
    exit /b 1
)
echo   Plugin installed

echo Running Goodvibes Plugin Setup for Claude...
claude --init-only
echo Setup Complete!
echo.
echo.
echo Done! GoodVibes plugin installed successfully.
echo.
pause
