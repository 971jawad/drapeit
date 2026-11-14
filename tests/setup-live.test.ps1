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

$script:deployCalls = 0
$script:needSubdomain = $false
$script:unrelatedFailure = $false
$script:openedUrls = @()
$script:prompts = 0
function Invoke-DrapeItCli {
    param([string]$Program, [string[]]$Arguments, [string]$InputText, [switch]$Quiet)
    $script:deployCalls++
    if ($script:unrelatedFailure) { throw 'Unrelated deployment error' }
    if ($script:needSubdomain -and $script:deployCalls -eq 1) {
        $failure = [InvalidOperationException]::new('Setup command failed')
        $failure.Data['DrapeItOutput'] = 'You need to register a workers.dev subdomain before publishing. https://dash.cloudflare.com/11111111111111111111111111111111/workers/onboarding'
        throw $failure
    }
    return 'https://drapeit-live.test.workers.dev'
}
$published = Publish-DrapeItService -Npx 'test-npx'
if ($published -ne 'https://drapeit-live.test.workers.dev' -or $script:deployCalls -ne 1 -or $script:prompts -ne 0) { throw 'Normal deployment should not prompt for registration' }

$script:needSubdomain = $true
$script:deployCalls = 0
$published = Publish-DrapeItService -Npx 'test-npx'
if ($published -ne 'https://drapeit-live.test.workers.dev' -or $script:deployCalls -ne 2 -or $script:prompts -ne 1) { throw 'Subdomain registration did not resume deployment exactly once' }
if ($script:openedUrls[0] -ne 'https://dash.cloudflare.com/11111111111111111111111111111111/workers/onboarding') { throw 'Wrong account onboarding URL' }

$script:unrelatedFailure = $true
$script:deployCalls = 0
$caught = $false
try { $null = Publish-DrapeItService -Npx 'test-npx' }
catch { $caught = $_.Exception.Message -eq 'Unrelated deployment error' }
if (!$caught -or $script:deployCalls -ne 1) { throw 'Unrelated deployment failures must not be retried or hidden' }
Write-Host 'Passed: normal deployment, workers.dev onboarding recovery, and unrelated error propagation.'
