/*
 * AgroPulse Sensing Stick — firmware v2.0.0
 * =========================================
 * Adds Bluetooth Low Energy (BLE) sync on top of the original scan/OLED/RTC/GPS/NPK
 * firmware. Every scan is now ALSO stored inside the ESP32 (LittleFS) in the exact frame
 * format the AgroPulse mobile app parses. When a phone connects over BLE the stick reports
 * how many readings it has stored; when the app sends SYNC the stick streams them, and once
 * the app confirms with ACK the on-device store is wiped.
 *
 * ── BUILD NOTES (Arduino IDE) ────────────────────────────────────────────────────────────
 *  • Board:            "ESP32 Dev Module" (or your specific ESP32 board)
 *  • Partition Scheme: Tools ▸ Partition Scheme ▸ "Huge APP (3MB No OTA/1MB SPIFFS)"
 *                      ^ REQUIRED. BLE + U8g2 + LittleFS + libs overflow the default 1.2MB
 *                        app partition. LittleFS uses the SPIFFS region (1MB here).
 *  • Libraries:        U8g2, RTClib, TinyGPSPlus  (as before). The BLE library ships with
 *                      the ESP32 Arduino core — no separate install.
 *
 * ── BLE CONTRACT (must match the app's FrameParser / BleContext) ─────────────────────────
 *  Service   UUID: 4fafc201-1fb5-459e-8fcc-c5c9c331914b
 *  Sensor    char: beb5483e-36e1-4688-b7f5-ea07361b26a8   (NOTIFY  — stick → app)
 *  Command   char: 8b72e519-54d9-4de7-91f8-00a44f931d8c   (WRITE   — app → stick)
 *
 *  Reading frame (one per line, comma-separated KEY:value, '\n'-terminated):
 *    V:1,ID:AP-XXXXXX,FW:2.0.0,MDL:AP-SOIL-1,N:<mg/kg>,P:<mg/kg>,K:<mg/kg>,
 *        pH:<0-14>,EC:<uS/cm>,M:<%>,T:<C>[,Lat:<deg>,Lng:<deg>],TS:<unix-seconds>
 *    · 'ID' is mandatory · N/P/K are always present · 'pH' key is case-sensitive
 *    · Lat/Lng are omitted entirely when there is no GPS fix
 *
 *  Control frames (also sent on the Sensor char):
 *    on connect:            CMD:STATUS,ID:AP-XXXXXX,FW:2.0.0,COUNT:<n>
 *    after streaming:       CMD:SYNC_DONE,ID:AP-XXXXXX,FW:2.0.0
 *
 *  Commands received on the Command char (raw ASCII): "SYNC" and "ACK".
 *
 *  Sync handshake:
 *    phone connects → stick sends STATUS(COUNT) → app shows "N new readings"
 *    user taps Sync → app writes "SYNC" → stick streams every stored frame
 *    stick sends SYNC_DONE → app writes "ACK" → stick wipes /readings.txt
 */

#include <HardwareSerial.h>
#include <U8g2lib.h>
#include <SPI.h>
#include <Wire.h>
#include <RTClib.h>
#include <LittleFS.h>
#include <TinyGPSPlus.h>

// BLE (bundled with the ESP32 Arduino core)
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ── Hardware Pin Definitions ──────────────────────────────────────────────────────────────
#define START_SWITCH_PIN 32
#define SCAN_BUTTON_PIN 33
#define OLED_CS 14
#define OLED_DC 2
#define OLED_RES 15

// NPK RS485 Pins (Serial2)
#define RXD2 16
#define TXD2 17
#define DE_RE_PIN 4

// NEO-6M GPS Pins (Serial1)
#define GPS_RX 26
#define GPS_TX 27

// ── App / firmware identity ────────────────────────────────────────────────────────────────
#define FW_VERSION   "2.0.0"      // firmware build (app reads this as the 'FW' key)
#define FRAME_VERSION "1"         // frame FORMAT version ('V' key); the app supports V <= 1
#define DEVICE_MODEL "AP-SOIL-1"  // 'MDL' key — lets a future probe variant be told apart

// ── BLE UUIDs (MUST match the app) ──────────────────────────────────────────────────────────
#define SERVICE_UUID     "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define SENSOR_CHAR_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define CMD_CHAR_UUID    "8b72e519-54d9-4de7-91f8-00a44f931d8c"

// ── BLE notify tuning ───────────────────────────────────────────────────────────────────────
// 20 bytes is safe for ANY negotiated MTU (even the 23-byte default): a BLE notification
// cannot exceed MTU-3 bytes, and anything larger is silently truncated. The app negotiates
// MTU 512 on Android and reassembles frames by '\n', so if you never see truncated/garbled
// frames you may raise this to ~180 to make large syncs faster.
#define BLE_NOTIFY_CHUNK     20
#define BLE_NOTIFY_DELAY_MS  15   // gap between notifications so the TX queue can drain
#define BLE_STATUS_DELAY_MS  1500 // wait after connect before STATUS, so the app can subscribe

// LittleFS files
#define READINGS_FILE "/readings.txt"   // app-format sync queue (cleared on ACK)
#define DATALOG_FILE  "/datalog.txt"    // human-readable local log (kept, best-effort)

// ── Objects ───────────────────────────────────────────────────────────────────────────────
U8G2_SH1106_128X64_NONAME_F_4W_HW_SPI u8g2(U8G2_R0, OLED_CS, OLED_DC, OLED_RES);
RTC_DS3231 rtc;
TinyGPSPlus gps;
HardwareSerial GPS_Serial(1); // Hardware UART 1 for GPS

// Modbus RTU Read Request Frame
const byte requestFrame[] = {0x01, 0x03, 0x00, 0x00, 0x00, 0x07, 0x04, 0x08};
byte buffer[19];

// Global Sensor Variables
float g_moisture = 0, g_temp = 0, g_ph = 0;
uint16_t g_ec = 0, g_nitrogen = 0, g_phosphorus = 0, g_potassium = 0;

// Timer Variables
unsigned long scanStartTime = 0;
const int SAVE_DELAY_MS = 5000; // 5 seconds countdown

// State Machine Definitions
enum SystemState { SYSTEM_SLEEP, INITIALIZING, ERROR_STATE, READY, SCAN_DISPLAY, SAVE_DATA };
SystemState currentState = SYSTEM_SLEEP;

int readingCount = 1;
bool lastStartSwitchState = LOW;
bool lastScanButtonState = LOW;

// ── BLE state ───────────────────────────────────────────────────────────────────────────────
BLEServer*          pServer      = nullptr;
BLECharacteristic*  pSensorChar  = nullptr;  // NOTIFY (stick → app)
BLECharacteristic*  pCmdChar      = nullptr;  // WRITE  (app → stick)

volatile bool g_deviceConnected    = false;
volatile bool g_justConnected      = false;
volatile bool g_syncRequested      = false;
volatile bool g_ackReceived        = false;
volatile bool g_restartAdvertising = false;
unsigned long g_connectTime        = 0;

int  g_storedCount = 0;             // number of frames currently in READINGS_FILE
char g_idSuffix[7] = "000000";     // 6 hex chars derived from the chip MAC
char g_probeId[12] = "AP-000000";  // 'ID' key value
char g_bleName[20] = "AgroPulse";  // advertised device name

// ── BLE callbacks ─────────────────────────────────────────────────────────────────────────
// Callbacks run in the BLE stack's context, so they only flip volatile flags. All real work
// (file I/O, notifying) happens in handleBle() from loop().
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* /*s*/) override {
    g_deviceConnected = true;
    g_justConnected   = true;
    g_connectTime     = millis();
  }
  void onDisconnect(BLEServer* /*s*/) override {
    g_deviceConnected    = false;
    g_restartAdvertising = true; // re-advertise so the phone can reconnect
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    // .c_str() works whether getValue() returns std::string (core 2.x) or String (core 3.x).
    String v = String(c->getValue().c_str());
    v.trim();
    if (v.startsWith("SYNC"))     g_syncRequested = true;
    else if (v.startsWith("ACK")) g_ackReceived   = true;
  }
};

// ── Display helpers (unchanged) ─────────────────────────────────────────────────────────────
void centerText(const char* text, int y) {
  int textWidth = u8g2.getStrWidth(text);
  int x = (128 - textWidth) / 2;
  u8g2.setCursor(x, y);
  u8g2.print(text);
}

void drawStatusBar(int timeLeft = -1) {
  DateTime now = rtc.now();
  char timeStr[20];
  sprintf(timeStr, "%02d/%02d %02d:%02d", now.day(), now.month(), now.hour(), now.minute());

  u8g2.setFont(u8g2_font_4x6_tr);

  // Right side: Time
  int textWidth = u8g2.getStrWidth(timeStr);
  u8g2.setCursor(128 - textWidth, 6);
  u8g2.print(timeStr);

  // Left side: Timer (if active)
  if (timeLeft >= 0) {
    u8g2.setCursor(0, 6);
    u8g2.print("Save in:");
    u8g2.print(timeLeft);
    u8g2.print("s");
  }

  u8g2.drawLine(0, 8, 128, 8);
}

// Read LittleFS internal memory and print to Serial Monitor
void printInternalStorageContents() {
  File dataFile = LittleFS.open(DATALOG_FILE, FILE_READ);
  if (dataFile) {
    Serial.println("\n--- VERIFICATION: ESP32 Internal Storage Contents ---");
    while (dataFile.available()) {
      Serial.write(dataFile.read());
    }
    dataFile.close();
    Serial.println("---------------------------------------------------\n");
  }
}

bool readNPKSensor() {
  digitalWrite(DE_RE_PIN, HIGH);
  delay(10);
  Serial2.write(requestFrame, sizeof(requestFrame));
  Serial2.flush();

  digitalWrite(DE_RE_PIN, LOW);
  delay(100);

  if (Serial2.available() >= 19) {
    Serial2.readBytes(buffer, 19);
    if (buffer[0] == 0x01 && buffer[1] == 0x03) {
      g_moisture   = ((buffer[3] << 8) | buffer[4]) / 10.0;
      g_temp       = ((buffer[5] << 8) | buffer[6]) / 10.0;
      g_ec         = (buffer[7] << 8) | buffer[8];
      g_ph         = ((buffer[9] << 8) | buffer[10]) / 10.0;
      g_nitrogen   = (buffer[11] << 8) | buffer[12];
      g_phosphorus = (buffer[13] << 8) | buffer[14];
      g_potassium  = (buffer[15] << 8) | buffer[16];
    }
    while (Serial2.available()) Serial2.read();
    return true;
  }
  return false;
}

// ── App-format storage + BLE sync helpers ────────────────────────────────────────────────

// Build one reading frame in the exact format the app's FrameParser expects.
void buildReadingFrame(char* out, size_t outSize, const DateTime& now) {
  int len = snprintf(out, outSize,
    "V:" FRAME_VERSION ",ID:%s,FW:%s,MDL:%s,N:%u,P:%u,K:%u,pH:%.1f,EC:%u,M:%.1f,T:%.1f",
    g_probeId, FW_VERSION, DEVICE_MODEL,
    (unsigned)g_nitrogen, (unsigned)g_phosphorus, (unsigned)g_potassium,
    g_ph, (unsigned)g_ec, g_moisture, g_temp);

  // Only include position when there is a real fix — the app treats a missing Lat/Lng as
  // "no GPS", which is correct, rather than a bogus 0,0.
  if (len > 0 && len < (int)outSize && gps.location.isValid()) {
    len += snprintf(out + len, outSize - len, ",Lat:%.5f,Lng:%.5f",
                    gps.location.lat(), gps.location.lng());
  }

  if (len > 0 && len < (int)outSize) {
    snprintf(out + len, outSize - len, ",TS:%lu", (unsigned long)now.unixtime());
  }
}

// Append one app-format frame (with a bare '\n' terminator — NOT println's "\r\n") to the
// sync queue. Returns true on success and bumps the stored-reading count.
bool appendReadingToStore(const char* frame) {
  File f = LittleFS.open(READINGS_FILE, FILE_APPEND);
  if (!f) return false;
  f.print(frame);
  f.print('\n');
  f.close();
  g_storedCount++;
  return true;
}

// Count how many frames are already stored (called once at boot).
int countStoredReadings() {
  File f = LittleFS.open(READINGS_FILE, FILE_READ);
  if (!f) return 0;
  int c = 0;
  while (f.available()) {
    if (f.read() == '\n') c++;
  }
  f.close();
  return c;
}

// Wipe the sync queue after the app confirms it has all the readings.
void clearStoredReadings() {
  LittleFS.remove(READINGS_FILE);
  g_storedCount = 0;
  Serial.println("BLE: on-device readings cleared after ACK.");
}

// Notify an arbitrary byte payload, chunked to stay within the BLE MTU.
void notifyRaw(const char* data, size_t len) {
  if (!g_deviceConnected || pSensorChar == nullptr) return;
  size_t sent = 0;
  while (sent < len && g_deviceConnected) {
    size_t remaining = len - sent;
    size_t n = remaining < (size_t)BLE_NOTIFY_CHUNK ? remaining : (size_t)BLE_NOTIFY_CHUNK;
    pSensorChar->setValue((uint8_t*)(data + sent), n);
    pSensorChar->notify();
    sent += n;
    delay(BLE_NOTIFY_DELAY_MS);
  }
}

// Stream the whole readings file to the app in MTU-safe chunks. Frames are already
// '\n'-terminated in the file, so the app reassembles them exactly as in a live scan.
void streamStoredReadings() {
  File f = LittleFS.open(READINGS_FILE, FILE_READ);
  if (!f) {
    Serial.println("BLE: no readings file to stream.");
    return;
  }
  Serial.printf("BLE: streaming %d stored reading(s)...\n", g_storedCount);
  char chunk[BLE_NOTIFY_CHUNK];
  while (f.available() && g_deviceConnected) {
    size_t n = f.readBytes(chunk, BLE_NOTIFY_CHUNK);
    if (n == 0) break;
    pSensorChar->setValue((uint8_t*)chunk, n);
    pSensorChar->notify();
    delay(BLE_NOTIFY_DELAY_MS);
  }
  f.close();
}

// CMD:STATUS,ID:...,FW:...,COUNT:<n>  — tells the app how many readings are waiting.
void sendStatusFrame() {
  char frame[80];
  int len = snprintf(frame, sizeof(frame),
                     "CMD:STATUS,ID:%s,FW:%s,COUNT:%d\n",
                     g_probeId, FW_VERSION, g_storedCount);
  notifyRaw(frame, (size_t)len);
  Serial.printf("BLE: sent STATUS COUNT=%d\n", g_storedCount);
}

// CMD:SYNC_DONE,... — tells the app the stream is complete (app replies with ACK).
void sendControlFrame(const char* cmd) {
  char frame[64];
  int len = snprintf(frame, sizeof(frame), "CMD:%s,ID:%s,FW:%s\n", cmd, g_probeId, FW_VERSION);
  notifyRaw(frame, (size_t)len);
  Serial.printf("BLE: sent %s\n", cmd);
}

void initBle() {
  BLEDevice::init(g_bleName);
  BLEDevice::setMTU(512); // match the app's requestMTU(512) so single-frame notifies fit

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService* service = pServer->createService(SERVICE_UUID);

  pSensorChar = service->createCharacteristic(
      SENSOR_CHAR_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  pSensorChar->addDescriptor(new BLE2902()); // CCCD — lets the app enable notifications

  pCmdChar = service->createCharacteristic(
      CMD_CHAR_UUID,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  pCmdChar->setCallbacks(new CommandCallbacks());

  service->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID); // so a service-filtered scan on the phone finds us
  adv->setScanResponse(true);        // put the device name in the scan response
  adv->setMinPreferred(0x06);        // iOS connection-interval friendliness (boilerplate)
  adv->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.printf("BLE: advertising as '%s' (probe %s)\n", g_bleName, g_probeId);
}

// Drives the BLE sync state machine from loop() using the flags the callbacks set.
void handleBle() {
  // Re-advertise after a disconnect.
  if (g_restartAdvertising) {
    g_restartAdvertising = false;
    delay(50);
    BLEDevice::startAdvertising();
    Serial.println("BLE: disconnected — advertising again.");
  }

  // Announce the stored-reading count once the phone has had time to subscribe.
  if (g_justConnected && (millis() - g_connectTime > BLE_STATUS_DELAY_MS)) {
    g_justConnected = false;
    sendStatusFrame();
  }

  // Stream stored readings on request, then signal completion.
  if (g_syncRequested) {
    g_syncRequested = false;
    if (g_deviceConnected) {
      streamStoredReadings();
      sendControlFrame("SYNC_DONE");
    }
  }

  // On the app's ACK, wipe the store and (if still connected) reflect the new count.
  if (g_ackReceived) {
    g_ackReceived = false;
    clearStoredReadings();
    if (g_deviceConnected) sendStatusFrame();
  }
}

// ── Setup ───────────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // Derive a stable, unique probe ID + BLE name from the chip's factory MAC.
  uint64_t mac = ESP.getEfuseMac();
  uint8_t b0 = (uint8_t)(mac & 0xFF);
  uint8_t b1 = (uint8_t)((mac >> 8) & 0xFF);
  uint8_t b2 = (uint8_t)((mac >> 16) & 0xFF);
  snprintf(g_idSuffix, sizeof(g_idSuffix), "%02X%02X%02X", b2, b1, b0);
  snprintf(g_probeId, sizeof(g_probeId), "AP-%s", g_idSuffix);
  snprintf(g_bleName, sizeof(g_bleName), "AgroPulse-%s", g_idSuffix);

  pinMode(START_SWITCH_PIN, INPUT_PULLDOWN);
  pinMode(SCAN_BUTTON_PIN, INPUT_PULLDOWN);

  // Prevent SPI bus conflicts for OLED
  pinMode(OLED_CS, OUTPUT); digitalWrite(OLED_CS, HIGH);

  // Initialize NPK Sensor Serial
  pinMode(DE_RE_PIN, OUTPUT);
  digitalWrite(DE_RE_PIN, LOW);
  Serial2.begin(4800, SERIAL_8N1, RXD2, TXD2);

  // Initialize GPS Serial
  GPS_Serial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);

  u8g2.begin();
  u8g2.clearBuffer();
  u8g2.sendBuffer();

  if (!rtc.begin()) {
    Serial.println("Couldn't find RTC");
  }

  // Initialize ESP32 Internal Storage (LittleFS)
  // 'true' forces formatting on the very first run if no file system exists
  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS Mount Failed - Could not initialize internal memory.");
  } else {
    Serial.println("LittleFS (Internal Storage) Mounted Successfully.");
    g_storedCount = countStoredReadings();
    Serial.printf("LittleFS: %d reading(s) already stored and waiting to sync.\n", g_storedCount);
  }

  // Bring up the BLE sync radio last, once identity + storage are ready.
  initBle();
}

// ── Main loop ───────────────────────────────────────────────────────────────────────────────
void loop() {
  // 1. Constantly feed the GPS parser
  while (GPS_Serial.available() > 0) {
    gps.encode(GPS_Serial.read());
  }

  // 2. Service the BLE sync state machine (runs in every state, even SYSTEM_SLEEP, so the
  //    farmer can sync without the scan UI being active).
  handleBle();

  bool currentStartSwitchState = digitalRead(START_SWITCH_PIN);
  bool currentScanButtonState = digitalRead(SCAN_BUTTON_PIN);
  bool scanPressed = (currentScanButtonState == HIGH && lastScanButtonState == LOW);

  // Power Switch Logic
  if (currentStartSwitchState == LOW) {
    currentState = SYSTEM_SLEEP;
  } else if (currentStartSwitchState == HIGH && lastStartSwitchState == LOW) {
    currentState = INITIALIZING;
  }

  lastStartSwitchState = currentStartSwitchState;
  lastScanButtonState = currentScanButtonState;

  switch (currentState) {

    case SYSTEM_SLEEP:
      u8g2.clearBuffer();
      u8g2.sendBuffer();
      break;

    case INITIALIZING:
      u8g2.clearBuffer();
      u8g2.setFont(u8g2_font_ncenB08_tr);
      centerText("Getting Started...", 36);
      u8g2.sendBuffer();

      delay(2000);

      if (readNPKSensor()) {
        currentState = READY;
        printInternalStorageContents(); // Verify existing internal data
      } else {
        currentState = ERROR_STATE;
      }
      break;

    case ERROR_STATE:
      u8g2.clearBuffer();
      u8g2.setFont(u8g2_font_ncenB08_tr);
      centerText("Error connecting", 28);
      centerText("NPK", 44);
      u8g2.sendBuffer();
      break;

    case READY:
      u8g2.clearBuffer();
      drawStatusBar(-1);
      u8g2.setFont(u8g2_font_ncenB08_tr);

      if (g_deviceConnected && (millis() - g_connectTime < 3000)) {
        centerText("Bluetooth", 34);
        centerText("connected", 50);
      } else {
        centerText("Ready for", 34);
        centerText("scanning", 50);
      }
      u8g2.sendBuffer();

      if (scanPressed) {
        if (readNPKSensor()) {
          scanStartTime = millis();
          currentState = SCAN_DISPLAY;
        } else {
          currentState = ERROR_STATE;
        }
      }
      break;

    case SCAN_DISPLAY:
      {
        int timeElapsed = (millis() - scanStartTime);
        int timeLeft = (SAVE_DELAY_MS - timeElapsed) / 1000;

        if (timeElapsed >= SAVE_DELAY_MS) {
          currentState = SAVE_DATA;
          break;
        }

        u8g2.clearBuffer();
        drawStatusBar(timeLeft);

        u8g2.setFont(u8g2_font_5x7_tr);
        u8g2.setCursor(0, 18); u8g2.print("Moist: "); u8g2.print(g_moisture, 1); u8g2.print("%");
        u8g2.setCursor(64, 18); u8g2.print("Temp: "); u8g2.print(g_temp, 1); u8g2.print("C");

        u8g2.setCursor(0, 28); u8g2.print("EC: "); u8g2.print(g_ec);
        u8g2.setCursor(64, 28); u8g2.print("pH: "); u8g2.print(g_ph, 1);

        u8g2.drawLine(0, 32, 128, 32);

        u8g2.setFont(u8g2_font_7x13B_tr);
        u8g2.setCursor(0, 44); u8g2.print("N: "); u8g2.print(g_nitrogen); u8g2.print(" mg/kg");
        u8g2.setCursor(0, 54); u8g2.print("P: "); u8g2.print(g_phosphorus); u8g2.print(" mg/kg");
        u8g2.setCursor(0, 64); u8g2.print("K: "); u8g2.print(g_potassium); u8g2.print(" mg/kg");

        if (g_deviceConnected && (millis() - g_connectTime < 3000)) {
          u8g2.clearBuffer();
          drawStatusBar(timeLeft);
          u8g2.setFont(u8g2_font_ncenB08_tr);
          centerText("Bluetooth", 34);
          centerText("connected", 50);
        }

        u8g2.sendBuffer();
      }
      break;

    case SAVE_DATA:
      {
        DateTime now = rtc.now();

        // 1. Generate Unique Tag and Filenames (kept for the human-readable log)
        char uniqueTag[32];
        sprintf(uniqueTag, "TAG-%02d%02d-%02d%02d%02d", now.day(), now.month(), now.hour(), now.minute(), now.second());

        char uniqueFileName[32];
        sprintf(uniqueFileName, "/R%02d%02d%02d.txt", now.hour(), now.minute(), now.second());

        // 2. Fetch GPS Data (for the human log)
        char gpsString[30];
        if (gps.location.isValid()) {
          sprintf(gpsString, "GPS:%.5f,%.5f", gps.location.lat(), gps.location.lng());
        } else {
          sprintf(gpsString, "GPS:NO_FIX");
        }

        // 3. Format the human-readable Row Data
        char rowData[120];
        sprintf(rowData, "[%s] [%s] M:%.1f%% N:%d P:%d K:%d EC:%d pH:%.1f",
                uniqueTag, gpsString, g_moisture, g_nitrogen, g_phosphorus, g_potassium, g_ec, g_ph);

        // 4. PRIMARY: store the app-format frame in the BLE sync queue.
        char appFrame[220];
        buildReadingFrame(appFrame, sizeof(appFrame), now);
        bool saveSuccess = appendReadingToStore(appFrame);
        if (saveSuccess) {
          Serial.print("Stored app frame: ");
          Serial.println(appFrame);
        } else {
          Serial.println("Failed to write app frame to Internal Storage.");
        }

        // 5. Best-effort human-readable logs (unchanged behaviour; not required for sync).
        File masterLog = LittleFS.open(DATALOG_FILE, FILE_APPEND);
        if (masterLog) {
          masterLog.println(rowData);
          masterLog.close();
        }
        File uniqueFile = LittleFS.open(uniqueFileName, FILE_WRITE);
        if (uniqueFile) {
          uniqueFile.println("--- Individual Scan Data ---");
          uniqueFile.print("Tag ID: "); uniqueFile.println(uniqueTag);
          uniqueFile.print("Date: "); uniqueFile.print(now.day()); uniqueFile.print("/"); uniqueFile.println(now.month());
          uniqueFile.println(gpsString);
          uniqueFile.println(rowData);
          uniqueFile.close();
        }

        // 6. If a phone is connected while scanning, refresh its "N new readings" banner live.
        if (g_deviceConnected) sendStatusFrame();

        // 7. Update UI
        u8g2.clearBuffer();
        drawStatusBar(-1);
        u8g2.setFont(u8g2_font_ncenB08_tr);

        if (saveSuccess) {
          Serial.print("Data saved. Tag: ");
          Serial.println(uniqueTag);
          centerText("Reading Saved!", 40);
          readingCount++;
        } else {
          centerText("Storage Error!", 40);
        }

        u8g2.sendBuffer();
        delay(2000);

        printInternalStorageContents();

        currentState = READY;
      }
      break;
  }
}
