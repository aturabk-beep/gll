param([ValidateSet('server','web','apk','check')][string]$Task='server',[string]$RailwayOrigin='https://guleltakip-production.up.railway.app')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$env:PATH="$projectRoot\.tools;$projectRoot\.tools\flutter\bin;"+$env:PATH
$env:PUB_CACHE="$projectRoot\.tools\pub-cache"
$env:GRADLE_USER_HOME="$projectRoot\.tools\gradle"
if(Test-Path 'C:\Program Files\Android\Android Studio\jbr'){$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'}
if(Test-Path "$env:LOCALAPPDATA\Android\Sdk"){$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"}
$nodeCommand=(Get-Command node.exe -ErrorAction Stop).Source
function Invoke-ProjectNpm {
 if(Test-Path "$projectRoot\.tools\package\bin\npm-cli.js"){& $nodeCommand "$projectRoot\.tools\package\bin\npm-cli.js" @args}else{& npm.cmd @args}
 if($LASTEXITCODE -ne 0){throw 'npm command failed'}
}
if($Task -eq 'server'){
 Set-Location $projectRoot
 if(!(Test-Path '.env')){throw 'Create .env from .env.example with your local PostgreSQL and administrator configuration first. See README.'}
 & $nodeCommand --env-file=.env backend/src/server.mjs
}elseif($Task -eq 'web'){
 Set-Location "$projectRoot\web"
 Invoke-ProjectNpm run dev
}elseif($Task -eq 'apk'){
 $originUri=$null
 if(![Uri]::TryCreate($RailwayOrigin,[UriKind]::Absolute,[ref]$originUri) -or $originUri.Scheme -ne 'https' -or $originUri.AbsolutePath -ne '/' -or $originUri.Query -or $originUri.Fragment -or $originUri.UserInfo){throw 'Provide -RailwayOrigin with the deployed HTTPS origin (no path, credentials or query).'}
 $RailwayOrigin=$originUri.GetLeftPart([UriPartial]::Authority)
 Set-Location "$projectRoot\mobile"
 # Windows PowerShell treats redirected native stderr warnings as errors.
 $ErrorActionPreference='Continue'
 flutter.bat build apk --debug "--dart-define=RAILWAY_ORIGIN=$RailwayOrigin"
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
}else{
 Set-Location "$projectRoot\backend"
 Invoke-ProjectNpm test
 Set-Location "$projectRoot\web"
 Invoke-ProjectNpm test
 Set-Location "$projectRoot\mobile"
 flutter.bat analyze
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 flutter.bat test
}
