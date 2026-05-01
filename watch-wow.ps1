$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = "C:\Users\tc125\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = Get-Command node -ErrorAction SilentlyContinue
$playerName = $null
$logPath = $null

for ($index = 0; $index -lt $args.Count; $index++) {
  if ($args[$index] -eq "--player") {
    if ($index + 1 -lt $args.Count) {
      $playerName = $args[$index + 1]
      $index++
    }
  } elseif (-not $logPath) {
    $logPath = $args[$index]
  }
}

if ($node) {
  $nodePath = $node.Source
} elseif (Test-Path $bundledNode) {
  $nodePath = $bundledNode
} else {
  Write-Error "Node.js was not found. Install Node.js or run this inside Codex where the bundled runtime is available."
}

$logPath = if ($logPath) {
  $logPath
} else {
  "F:\World of Warcraft\_retail_\Logs"
}

if ($playerName) {
  & $nodePath "$projectRoot\src\cli.js" watch $logPath --player $playerName
} else {
  & $nodePath "$projectRoot\src\cli.js" watch $logPath
}
