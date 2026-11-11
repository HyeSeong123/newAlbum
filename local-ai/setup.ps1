. (Join-Path $PSScriptRoot 'environment.ps1')
Push-Location $ProjectRoot
try {
    $Uv = Join-Path $ProjectRoot '.tools/uv.exe'
    if (-not (Test-Path -LiteralPath $Uv)) {
        throw 'Missing .tools/uv.exe. Download the Windows x64 release from https://github.com/astral-sh/uv/releases .'
    }
    & $Uv python install 3.12
    if ($LASTEXITCODE -ne 0) { throw 'Python installation failed.' }
    if (-not (Test-Path -LiteralPath $AiPython)) {
        & $Uv venv .venv --python 3.12 --managed-python
        if ($LASTEXITCODE -ne 0) { throw 'Environment creation failed.' }
    }
    & $Uv pip install --python $AiPython -r (Join-Path $PSScriptRoot 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Package installation failed.' }
    & $AiPython (Join-Path $PSScriptRoot 'verify.py')
    if ($LASTEXITCODE -ne 0) { throw 'GPU verification failed.' }
} finally { Pop-Location }
