$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../scripts/setup-live.ps1')
$script:cliCalls = @()
$script:openedUrls = @()
$script:prompts = 0
$script:alreadyLoggedIn = $true
function Invoke-DrapeItCli {
    param([string]$Program, [string[]]$Arguments, [string]$InputText, [switch]$Quiet)
    $script:cliCalls += ($Arguments -join ' ')
    if (($Arguments -contains 'whoami') -and !$script:alreadyLoggedIn) { throw 'Not authenticated' }
    return '{}'
}
function Start-Process { param([string]$FilePath) $script:openedUrls += $FilePath }
function Read-Host { param([string]$Prompt) $script:prompts++; return '' }

Connect-DrapeItCloudflare -Npx 'test-npx'
if ($script:cliCalls.Count -ne 1 -or $script:prompts -ne 0 -or $script:openedUrls.Count -ne 0) { throw 'Existing login was not reused' }
if ($script:cliCalls[0] -notmatch 'whoami --json$') { throw 'Login probe must check authenticated JSON status' }

$script:alreadyLoggedIn = $false
$script:cliCalls = @()
Connect-DrapeItCloudflare -Npx 'test-npx'
if ($script:cliCalls.Count -ne 2 -or $script:cliCalls[1] -notmatch 'login --device$') { throw 'Missing device-code login' }
if ($script:prompts -ne 1 -or $script:openedUrls[0] -ne 'https://dash.cloudflare.com/login') { throw 'Timed login started without the browser preparation step' }
Write-Host 'Passed: existing login reuse and first-time device authorization flow.'
