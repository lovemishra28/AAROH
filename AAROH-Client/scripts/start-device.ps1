param(
  [ValidateSet('auto', 'phone', 'emulator')]
  [string]$Target = 'auto',

  [string]$ApiHost
)

$ErrorActionPreference = 'Stop'

function Get-LanIp {
  $ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.' } |
    Select-Object -First 1 -ExpandProperty IPAddress)

  if (-not $ip) {
    throw "No LAN IPv4 address found. Connect to Wi‑Fi and run 'ipconfig' to find your PC IP, then retry."
  }

  return $ip
}

if ($Target -eq 'auto') {
  $adbCmd = Get-Command adb -ErrorAction SilentlyContinue
  if (-not $adbCmd) {
    $Target = 'emulator'
  } else {
    $devices = & adb devices 2>$null
    $emulatorDetected = $false
    $deviceDetected = $false

    foreach ($line in $devices) {
      if ($line -match 'emulator') { $emulatorDetected = $true }
      elseif ($line -match 'device$') { $deviceDetected = $true }
    }

    if ($deviceDetected -and -not $emulatorDetected) {
      $Target = 'phone'
    } else {
      $Target = 'emulator'
    }
  }
}

if ($Target -eq 'phone') {
  if (-not $ApiHost) { $ApiHost = Get-LanIp }

  if ($ApiHost -notmatch '^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}$') {
    throw "ApiHost must be a valid IPv4 address (example: 192.168.1.20)."
  }

  $env:EXPO_PUBLIC_API_BASE_URL = "http://${ApiHost}:3000"
  Write-Host "Selected target: phone"
  Write-Host "API URL: $env:EXPO_PUBLIC_API_BASE_URL"
} else {
  $env:EXPO_PUBLIC_API_BASE_URL = 'http://10.0.2.2:3000'
  Write-Host 'Selected target: emulator'
  Write-Host "API URL: $env:EXPO_PUBLIC_API_BASE_URL"

  try {
    & adb reverse tcp:8081 tcp:8081 | Out-Null
  } catch {
    Write-Host 'adb was not available in PATH; Metro will still run without port forwarding.'
  }
}

npx expo start --dev-client --lan --clear
