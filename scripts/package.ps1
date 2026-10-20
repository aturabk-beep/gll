$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$artifacts=Join-Path $projectRoot 'artifacts'
New-Item -ItemType Directory -Force $artifacts | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath=Join-Path $artifacts 'gulel-railway-source.zip'
if(Test-Path -LiteralPath $archivePath){Remove-Item -LiteralPath $archivePath}
$archive=[System.IO.Compression.ZipFile]::Open($archivePath,[System.IO.Compression.ZipArchiveMode]::Create)
try{
 $included=@('mobile','web','backend','scripts')
 $files=@(Get-ChildItem -LiteralPath $projectRoot -File -Force | Where-Object {$_.Name -match '\.md$|^\.env\.example$|^\.gitignore$|^Dockerfile$|^railway\.json$|^\.dockerignore$|^\.railwayignore$'})
 foreach($folder in $included){$files+=Get-ChildItem -LiteralPath (Join-Path $projectRoot $folder) -File -Recurse -Force | Where-Object {$_.FullName -notmatch '[\\/](node_modules|build|dist|\.dart_tool|\.gradle|\.idea|ephemeral|\.symlinks)[\\/]' -and $_.Name -notmatch '^\.env(\.local)?$|^local\.properties$|^key\.properties$|\.jks$|\.iml$|^\.flutter-plugins|\.tsbuildinfo$'}}
 foreach($file in $files){if($file.Name -like '.env*' -and $file.Name -ne '.env.example'){continue};$relative=$file.FullName.Substring($projectRoot.Length+1).Replace('\','/');[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$relative,[System.IO.Compression.CompressionLevel]::Optimal)|Out-Null}
}finally{$archive.Dispose()}
$panelZip=Join-Path $artifacts 'gulel-railway-panel.zip'
if(Test-Path -LiteralPath $panelZip){Remove-Item -LiteralPath $panelZip}
[System.IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $projectRoot 'web\dist'),$panelZip)
Get-FileHash -LiteralPath (Join-Path $artifacts 'gulel-railway-debug.apk'),$archivePath,$panelZip -Algorithm SHA256 | ForEach-Object { "$($_.Hash)  $(Split-Path $_.Path -Leaf)" } | Set-Content -Encoding ASCII (Join-Path $artifacts 'RAILWAY-SHA256SUMS.txt')
