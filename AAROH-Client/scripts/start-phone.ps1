param(
  [string]$ApiHost
)

if (-not $ApiHost) {
  $ApiHost = (Get-NetIPConfiguration |
    Where-Object {
      $_.IPv4Address -and $_.IPv4DefaultGateway -and
      $_.NetAdapter.Status -eq 'Up' -and
      $_.NetAdapter.InterfaceDescription -notmatch 'WSL|Virtual|VMware|VirtualBox|Hyper-V'
    } |
    Select-Object -First 1 -ExpandProperty IPv4Address).IPv4Address
}

if (-not $ApiHost) {
  $ApiHost = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notmatch '^127\.' -and
      $_.IPAddress -notmatch '^169\.254\.' -and
      $_.InterfaceAlias -notmatch 'WSL|Loopback|Virtual|VMware|VirtualBox|Hyper-V'
    } |
    Select-Object -First 1 -ExpandProperty IPAddress)
}

if (-not $ApiHost) {
  throw "No LAN IPv4 address found. Connect to Wi‑Fi and run 'ipconfig' to find your PC IP, then pass -ApiHost 192.168.1.20."
}

if ($ApiHost -notmatch '^(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])){3}$') {
  throw "ApiHost must be a valid IPv4 address (example: 192.168.1.20)."
}

$env:EXPO_PUBLIC_API_BASE_URL = "http://${ApiHost}:3000"

Write-Host "Starting the phone build with API: $env:EXPO_PUBLIC_API_BASE_URL"
Write-Host "This environment override ends when Expo stops. The emulator default is unchanged."

npx expo start --dev-client --lan --clear
