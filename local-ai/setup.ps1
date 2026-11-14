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
    & $Uv pip install --python $AiPython -r (Join-Path $PSScriptRoot 'own\requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Package installation failed.' }
    & $AiPython -c "import numpy; print('Own neural learning + NumPy', numpy.__version__)"
    if ($LASTEXITCODE -ne 0) { throw 'Numerical tool verification failed.' }
} finally { Pop-Location }
