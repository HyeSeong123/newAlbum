param(
    [ValidateSet('menu', 'verify', 'prepare', 'train', 'react', 'check')]
    [string]$Action = 'menu',
    [string]$Character = 'gomi'
)
. (Join-Path $PSScriptRoot 'environment.ps1')
Push-Location $ProjectRoot
try {
    if (-not (Test-Path -LiteralPath $AiPython)) { throw '먼저 local-ai/setup.ps1을 실행해 주세요.' }
    if ($Action -eq 'menu') {
        Write-Host '곰고미 PC 학습 환경'
        Write-Host '1. GPU 학습 환경 점검'
        Write-Host '2. 고미 학습 시작 (검토·보강한 행동 자료로 새 실험)'
        Write-Host '3. 행동별 새 한마디 시험'
        Write-Host '4. 자료 검사'
        Write-Host '0. 종료'
        switch (Read-Host '번호') {
            '1' { $Action = 'verify' }
            '2' { $Action = 'train' }
            '3' { $Action = 'react' }
            '4' { $Action = 'check' }
            '0' { return }
            default { throw '메뉴 번호를 확인해 주세요.' }
        }
    }
    switch ($Action) {
        'verify' { & $AiPython (Join-Path $PSScriptRoot 'verify.py') }
        'prepare' { & $AiPython (Join-Path $PSScriptRoot 'prepare.py') }
        'train' {
            if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'base-model.json'))) {
                & $AiPython (Join-Path $PSScriptRoot 'prepare.py')
                if ($LASTEXITCODE -ne 0) { throw '모델 준비 실패' }
            }
            $Preferred = Join-Path $PSScriptRoot 'preferred-training.json'
            if ($Character -eq 'gomi' -and (Test-Path -LiteralPath $Preferred)) {
                $TrainingConfig = Get-Content -Raw -Encoding UTF8 -LiteralPath $Preferred | ConvertFrom-Json
                & $AiPython (Join-Path $PSScriptRoot 'train.py') --character $Character --corpus (Join-Path $PSScriptRoot $TrainingConfig.corpus) --epochs $TrainingConfig.epochs --learning-rate $TrainingConfig.learningRate
            } else {
                & $AiPython (Join-Path $PSScriptRoot 'train.py') --character $Character
            }
        }
        'react' { & $AiPython (Join-Path $PSScriptRoot 'react.py') --character $Character --interactive }
        'check' {
            & $AiPython (Join-Path $PSScriptRoot 'check.py')
        }
    }
    if ($LASTEXITCODE -ne 0) { throw "실행 실패 (종료 코드 $LASTEXITCODE). 위 오류를 확인해 주세요." }
} finally { Pop-Location }
