$env:EXPO_PUBLIC_API_BASE_URL = 'http://10.0.2.2:3000'

Write-Host "Starting the Android emulator build with API: $env:EXPO_PUBLIC_API_BASE_URL"

try {
  & adb reverse tcp:8081 tcp:8081
} catch {
  Write-Host 'adb reverse was not available; continuing without it.'
}

npx expo start --dev-client --lan --clear
