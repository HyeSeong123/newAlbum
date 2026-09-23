$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem 'src-tauri/target/release/bundle/nsis/*-setup.exe' | Select-Object -First 1
if (-not $installer) { throw 'Windows installer was not generated.' }
$installDirectory = Join-Path $env:RUNNER_TEMP 'OraedameunSmoke'
$setup = Start-Process -FilePath $installer.FullName -ArgumentList "/S /D=$installDirectory" -Wait -PassThru
if ($setup.ExitCode -ne 0) { throw "Installer failed: $($setup.ExitCode)" }
$binary = Get-ChildItem $installDirectory -Filter '*.exe' | Where-Object { $_.Name -notmatch 'uninstall' } | Select-Object -First 1
if (-not $binary) { throw 'Installed application executable is missing.' }

# Enable CDP only in this CI process to exercise the real WebView2/native bridge.
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
$diagnostics = Join-Path (Get-Location) 'test-results/desktop-smoke'
New-Item -ItemType Directory -Force -Path $diagnostics | Out-Null
$env:ORAEDAMEUN_STARTUP_LOG = Join-Path $diagnostics 'startup.log'
$application = $null
$debugPolicyPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$debugPolicyBackup = @{}
function Wait-LocalApp {
    $lastError = 'No response received'
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($application.HasExited) { throw 'Desktop app exited before becoming ready.' }
        $stage = 'HTTP frontend on port 5173'
        try {
            $response = Invoke-WebRequest 'http://127.0.0.1:5173/' -NoProxy -TimeoutSec 2
            $stage = 'WebView2 debugger on port 9222'
            $debugger = Invoke-WebRequest 'http://127.0.0.1:9222/json/version' -NoProxy -TimeoutSec 2
            if ($response.StatusCode -eq 200 -and $response.Content -match 'id="root"' -and $debugger.StatusCode -eq 200) { return }
        } catch { $lastError = "$stage : $($_.Exception.Message)" }
        Start-Sleep -Seconds 1
    }
    throw "Packaged app did not start its local server and webview: $lastError"
}
function Close-LocalApp {
    $application.Refresh()
    if (-not $application.CloseMainWindow()) { throw 'Desktop window was not created.' }
    if (-not $application.WaitForExit(15000)) { throw 'Desktop app did not exit when its window closed.' }
    if (Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) {
        throw 'Local server remained running after app exit.'
    }
}
try {
    # WebView2 150+ ignores environment overrides on elevated CI runners.
    # Use the documented machine policy for this app only, and restore it below.
    # https://learn.microsoft.com/microsoft-edge/webview2/concepts/security
    if ($env:GITHUB_ACTIONS -eq 'true') {
        if (-not (Test-Path $debugPolicyPath)) {
            New-Item -Path $debugPolicyPath -Force | Out-Null
        }
        $appIdentifier = (Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json).identifier
        foreach ($name in @($binary.Name, $appIdentifier)) {
            $key = Get-Item $debugPolicyPath
            $exists = $key.GetValueNames() -contains $name
            $debugPolicyBackup[$name] = @{ Exists = $exists; Value = $null; Kind = 'String' }
            if ($exists) {
                $debugPolicyBackup[$name].Value = $key.GetValue($name)
                $debugPolicyBackup[$name].Kind = $key.GetValueKind($name).ToString()
            }
            New-ItemProperty -Path $debugPolicyPath -Name $name -PropertyType String -Value '--remote-debugging-port=9222 --remote-debugging-address=127.0.0.1' -Force | Out-Null
        }
    }
    $application = Start-Process -FilePath $binary.FullName -PassThru
    Wait-LocalApp
    Write-Host 'Installed app opened its local server and WebView2.'
    $listeners = @(Get-NetTCPConnection -LocalPort 5173 -State Listen)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Server is not restricted to loopback.' }
    $second = Start-Process -FilePath $binary.FullName -PassThru
    if (-not $second.WaitForExit(10000)) { Stop-Process -Id $second.Id -Force; throw 'Second app instance did not exit.' }
    node scripts/smoke-desktop.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Packaged native bridge check failed.' }
    Close-LocalApp
    $application = Start-Process -FilePath $binary.FullName -PassThru
    Wait-LocalApp
    node scripts/smoke-desktop.mjs --restarted
    if ($LASTEXITCODE -ne 0) { throw 'App persistence check failed after restart.' }
    Close-LocalApp
} finally {
    Get-NetTCPConnection -LocalPort 5173,9222 -ErrorAction SilentlyContinue |
        Format-Table -AutoSize | Out-String | Tee-Object -FilePath (Join-Path $diagnostics 'ports.log') | Write-Host
    if (Test-Path $env:ORAEDAMEUN_STARTUP_LOG) { Get-Content $env:ORAEDAMEUN_STARTUP_LOG | Write-Host }
    if ($application -and -not $application.HasExited) { Stop-Process -Id $application.Id -Force -ErrorAction SilentlyContinue }
    foreach ($name in $debugPolicyBackup.Keys) {
        $previous = $debugPolicyBackup[$name]
        if ($previous.Exists) {
            New-ItemProperty -Path $debugPolicyPath -Name $name -PropertyType $previous.Kind -Value $previous.Value -Force | Out-Null
        } else {
            Remove-ItemProperty -Path $debugPolicyPath -Name $name -ErrorAction SilentlyContinue
        }
    }
    Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
    Remove-Item Env:ORAEDAMEUN_STARTUP_LOG -ErrorAction SilentlyContinue
}
