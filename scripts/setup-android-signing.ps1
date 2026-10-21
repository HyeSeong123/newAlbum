# Run from a normal PowerShell window on the owner's Windows development PC.
$ErrorActionPreference = 'Stop'
foreach ($tool in @('node', 'gh', 'keytool')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is required (Node.js, GitHub CLI, JDK 17)." }
}
$password = Read-Host 'New permanent signing password (12+ characters; remember it for backup)' -AsSecureString
$confirm = Read-Host 'Confirm password' -AsSecureString
$first = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$second = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($first)
    if ($plain -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($second)) { throw 'Passwords do not match.' }
    $env:GAMJASSAK_ANDROID_STORE_PASSWORD = $plain
    $plain = $null
    & node (Join-Path $PSScriptRoot 'setup-android-signing.mjs') --build
    if ($LASTEXITCODE -ne 0) { throw 'Setup did not finish. Keep the existing key and retry after fixing the reported issue.' }
} finally {
    Remove-Item Env:GAMJASSAK_ANDROID_STORE_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($first)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($second)
    $password.Dispose(); $confirm.Dispose(); $plain = $null
}
