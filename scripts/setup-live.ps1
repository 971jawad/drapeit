# One-time Windows setup for DrapeIt's persistent Cloudflare service.
# Provider credentials are prompted privately and stored as Cloudflare secrets.
$ErrorActionPreference = 'Stop'
function Invoke-DrapeItCli {
    param([string]$Program, [string[]]$Arguments, [string]$InputText, [switch]$Quiet)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = New-Object 'System.Collections.Generic.List[string]'
        $showLine = {
            $line = [string]$_
            if ($InputText) {
                $sensitive = $InputText | ConvertFrom-Json
                foreach ($property in $sensitive.PSObject.Properties) {
                    $line = $line.Replace([string]$property.Value, '[redacted]')
                }
            }
            if (!$Quiet) { Write-Host $line }
            $lines.Add($line)
        }
        if ($InputText) { $InputText | & $Program @Arguments 2>&1 | ForEach-Object $showLine }
        else { & $Program @Arguments 2>&1 | ForEach-Object $showLine }
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            $failure = [InvalidOperationException]::new('A setup command failed. Review the command output above and retry.')
            # Keep only the already-redacted output for targeted recovery.
            $failure.Data['DrapeItOutput'] = $lines -join "`n"
            throw $failure
        }
        return ($lines -join "`n")
    } finally { $ErrorActionPreference = $previous }
}
function Connect-DrapeItCloudflare {
    param([string]$Npx)
    Write-Host 'Checking your existing Cloudflare login...'
    try {
        $null = Invoke-DrapeItCli -Program $Npx -Arguments @('--yes','wrangler@4.158.0','whoami','--json') -Quiet
        Write-Host 'Reusing your existing Cloudflare login.'
        return
    } catch {
        # whoami --json exits nonzero when authentication is unavailable.
    }
    Write-Host 'First sign in or finish creating your account at https://dash.cloudflare.com.'
    Write-Host 'There is no timer yet. Leave this terminal open while you sign in.'
    try { Start-Process 'https://dash.cloudflare.com/login' }
    catch { Write-Host 'Open https://dash.cloudflare.com/login in your browser manually.' }
    $null = Read-Host 'When the Cloudflare dashboard is open, press Enter here'
    Write-Host 'Now approve the fresh device code in the browser. This does not use a localhost callback.'
    $null = Invoke-DrapeItCli -Program $Npx -Arguments @('--yes','wrangler@4.158.0','login','--device')
}
function Publish-DrapeItService {
    param([string]$Npx)
    $deployArguments = @('--yes','wrangler@4.158.0','deploy','--config','hosted.wrangler.jsonc')
    try {
        return (Invoke-DrapeItCli -Program $Npx -Arguments $deployArguments)
    } catch {
        $output = [string]$_.Exception.Data['DrapeItOutput']
        $onboarding = [regex]::Match($output, 'https://dash\.cloudflare\.com/[a-fA-F0-9]{32}/workers/onboarding').Value
        if (($output -notmatch 'register a workers\.dev subdomain') -or !$onboarding) { throw }
        Write-Host ''
        Write-Host 'Cloudflare needs a workers.dev subdomain for this account. This is a one-time registration.'
        Write-Host 'Choose an available name, for example nitesun-drapeit, and finish registration in the browser.'
        Write-Host ('Registration page: ' + $onboarding)
        try { Start-Process $onboarding }
        catch { Write-Host 'Open the registration page above manually.' }
        $null = Read-Host 'After Cloudflare confirms registration, press Enter here to resume deployment'
        return (Invoke-DrapeItCli -Program $Npx -Arguments $deployArguments)
    }
}
function Start-DrapeItSetup {
    $providerSecret = $null
    $providerPointer = [IntPtr]::Zero
    $providerKey = $null
    $secretPayload = $null
    $previousLocation = Get-Location
    try {
        Write-Host 'DrapeIt - one-time persistent live AI setup'
        Write-Host 'This installs Node.js if needed, opens Cloudflare authorization, and deploys your live service.'
        Write-Host 'Your Decart key will be stored as a server secret. It is never saved in this repository.'
        $nodeFolder = Join-Path $env:ProgramFiles 'nodejs'
        $nodeExe = Join-Path $nodeFolder 'node.exe'
        if (!(Test-Path $nodeExe)) {
            $existing = Get-Command node.exe -ErrorAction SilentlyContinue
            if ($existing) { $nodeExe = $existing.Source; $nodeFolder = Split-Path $nodeExe }
        }
        $major = 0
        if (Test-Path $nodeExe) { $major = [int]((& $nodeExe --version).TrimStart('v').Split('.')[0]) }
        if ($major -lt 22) {
            $null = Invoke-DrapeItCli -Program 'winget.exe' -Arguments @('install','--id','OpenJS.NodeJS.LTS','--exact','--source','winget','--accept-package-agreements','--accept-source-agreements')
            $nodeFolder = Join-Path $env:ProgramFiles 'nodejs'
            $nodeExe = Join-Path $nodeFolder 'node.exe'
        }
        if (!(Test-Path $nodeExe)) { throw 'Node.js installation did not finish. Install Node.js LTS and run this command again.' }
        $env:Path = $nodeFolder + ';' + $env:Path
        $npx = Join-Path $nodeFolder 'npx.cmd'
        $serviceDir = Join-Path $env:LOCALAPPDATA 'DrapeIt\service'
        $null = New-Item -ItemType Directory -Path $serviceDir -Force
        foreach ($name in @('hosted-worker.js', 'hosted.wrangler.jsonc')) {
            Invoke-WebRequest -UseBasicParsing -Uri ('https://raw.githubusercontent.com/971jawad/drapeit/main/server/' + $name) -OutFile (Join-Path $serviceDir $name)
        }
        Set-Location $serviceDir
        Connect-DrapeItCloudflare -Npx $npx
        $deployed = Publish-DrapeItService -Npx $npx
        $liveUrl = [regex]::Match($deployed, 'https://[a-zA-Z0-9.-]+\.workers\.dev').Value
        if (!$liveUrl) { throw 'The deployment did not return a workers.dev URL. Check the Cloudflare deployment output.' }
        $codeFile = Join-Path $serviceDir 'access-code.dpapi'
        if (Test-Path $codeFile) {
            $codeSecret = Get-Content -Raw $codeFile | ConvertTo-SecureString
        } else {
            $random = New-Object byte[] 32
            $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
            $rng.GetBytes($random)
            $rng.Dispose()
            $codeSecret = ConvertTo-SecureString ([Convert]::ToBase64String($random)) -AsPlainText -Force
            $codeSecret | ConvertFrom-SecureString | Set-Content -NoNewline $codeFile
        }
        $codePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($codeSecret)
        try { $accessCode = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($codePointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($codePointer); $codeSecret.Dispose() }
        $providerSecret = Read-Host 'Paste your Decart API key (hidden)' -AsSecureString
        $providerPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($providerSecret)
        $providerKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($providerPointer)
        if ([string]::IsNullOrWhiteSpace($providerKey)) { throw 'A Decart key is required.' }
        $secretPayload = @{ DECART_API_KEY = $providerKey.Trim(); ACCESS_TOKEN = $accessCode } | ConvertTo-Json -Compress
        $null = Invoke-DrapeItCli -Program $npx -Arguments @('--yes','wrangler@4.158.0','secret','bulk','--config','hosted.wrangler.jsonc') -InputText $secretPayload
        $status = Invoke-RestMethod -Uri ($liveUrl + '/api/hosted-status') -TimeoutSec 30
        if (!$status.configured) { throw 'The deployed service is not configured yet. Wait a moment and run this setup again.' }
        Set-Clipboard -Value $accessCode
        Set-Content -Path (Join-Path $serviceDir 'live-url.txt') -Value $liveUrl
        Write-Host ''
        Write-Host ('Your persistent AI fitting room: ' + $liveUrl)
        Write-Host 'Your service access code is copied. Paste it into Service access code and click Remember this browser.'
        Write-Host 'Then choose a garment, consent to streaming, and start your live AI camera.'
        Write-Host 'You do not need this terminal open afterwards. Token renewal is automatic.'
        Write-Host 'Your provider account still needs available credits. Camera streaming uses paid generation until you stop or leave the tab.'
        Start-Process ($liveUrl + '/?live=1')
    } finally {
        Set-Location $previousLocation
        $providerKey = $null
        $secretPayload = $null
        $accessCode = $null
        if ($providerPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($providerPointer) }
        if ($providerSecret) { $providerSecret.Dispose() }
    }
}
if ($MyInvocation.InvocationName -ne '.') {
    try { Start-DrapeItSetup }
    catch { Write-Host $_.Exception.Message -ForegroundColor Red; Write-Host 'Your permanent key was not printed. Fix the setup issue above and run the same command again.' }
}
