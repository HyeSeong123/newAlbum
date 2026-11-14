param(
    [ValidateSet('menu','verify','prepare','train','react','check')]
    [string]$Action='menu',
    [string]$Character='gomi'
)
. (Join-Path $PSScriptRoot 'environment.ps1')
Push-Location $ProjectRoot
try {
    $OwnNode=Join-Path $ProjectRoot '.tools\android-prep\node-v24.22.3-win-x64\node.exe'
    if (-not (Test-Path -LiteralPath $OwnNode)) { $OwnNode=(Get-Command node -ErrorAction Stop).Source }
    if ($Action -eq 'menu') {
        Write-Host '곰고미 전용 AI 프로그램'
        Write-Host '1. PC 학습 도구 확인'
        Write-Host '2. 자체 AI 새로 학습 (외부 모델 다운로드 없음)'
        Write-Host '3. 자체 AI 행동 반응 시험'
        Write-Host '4. 자체 모델 정보'
        Write-Host '0. 종료'
        switch (Read-Host '번호') {
            '1' { $Action='verify' }; '2' { $Action='train' }; '3' { $Action='react' }
            '4' { $Action='check' }; '0' { return }; default { throw '메뉴 번호를 확인해 주세요.' }
        }
    }
    switch ($Action) {
        'verify' { & $AiPython -c "import numpy; print('Own learning algorithm + NumPy matrix arithmetic',numpy.__version__)" }
        'prepare' { & $OwnNode scripts/prepare-own-character-ai.mjs }
        'train' {
            & $AiPython (Join-Path $PSScriptRoot 'own\train.py') --epochs 180
            if ($LASTEXITCODE -ne 0) { throw '자체 AI 학습 실패' }
            & $OwnNode scripts/prepare-own-character-ai.mjs
        }
        'react' { & $OwnNode scripts/own-character-ai.mjs --character $Character }
        'check' { & $OwnNode scripts/own-character-ai.mjs --info }
    }
    if ($LASTEXITCODE -ne 0) { throw "실행 실패 (종료 코드 $LASTEXITCODE). 위 오류를 확인해 주세요." }
} finally { Pop-Location }
