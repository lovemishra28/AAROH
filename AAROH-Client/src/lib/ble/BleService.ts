import { AppState, PermissionsAndroid, Platform, type AppStateStatus } from 'react-native';
import {
  BleManager,
  BleErrorCode,
  ScanMode,
  State,
  LogLevel,
  type BleError,
  type Device,
  type Subscription,
} from 'react-native-ble-plx';

import { IS_DEV } from '@/lib/env';

import { parseFrame, parseControlFrame, decodeBase64, encodeBase64, type ParsedFrame, type ControlFrame } from './FrameParser';
import type {
  BleConnectionState,
  BleFailure,
  BleFailureCode,
  DiscoveredDevice,
} from './types';

/* ── GATT contract (see BLE_PROTOCOL.md) ───────────────────────────────────── */

export const AAROH_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const SENSOR_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
export const CMD_CHAR_UUID = '8b72e519-54d9-4de7-91f8-00a44f931d8c';

/** How long one scan window runs before it stops itself, to spare the battery. */
const SCAN_DURATION_MS = 15_000;
/**
 * Android 7+ blocks an app that starts more than 5 scans in 30 s (silently — the
 * callback simply never fires again). 7 s between starts keeps us well clear.
 */
const SCAN_COOLDOWN_MS = 7_000;
/** Advertisements older than this are dropped from the list — the device walked away. */
const DEVICE_STALE_MS = 20_000;
/** ble-plx gives up on the GATT connection after this and rejects. */
const CONNECT_TIMEOUT_MS = 12_000;
/**
 * 512 is the maximum ATT MTU. The peripheral answers with the largest value it supports,
 * so asking for the ceiling is safe; the resolved value lands on `device.mtu`.
 */
const TARGET_MTU = 512;
/** Ceiling on the reassembly buffer, so a peripheral that never sends `\n` can't grow it. */
const MAX_BUFFER_BYTES = 8_192;
/**
 * Silence after which a buffered, unterminated frame is treated as complete. Real
 * notifications in a burst arrive milliseconds apart, so this cannot split a genuine frame.
 */
const IDLE_FLUSH_MS = 400;

function log(...args: unknown[]): void {
  if (IS_DEV) console.log('[ble]', ...args);
}

/** ble-plx rejects with `BleError`, but a native bridge failure can throw anything. */
function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** The only key the wire format permits ahead of `ID` — see BLE_PROTOCOL.md §2. */
const VERSION_PREFIX_RE = /^V\s*:\s*\d+$/;
/** Control frames prefix ahead of `ID`. */
const CONTROL_PREFIX_RE = /^CMD\s*:\s*[A-Z_]+$/;

/**
 * Cuts a string at every frame start — an `ID:` that begins the string or is not part of
 * `SID:`. Used to recover from a sender that omitted a frame terminator, where two frames
 * end up concatenated and the naive parse of the whole thing yields nothing.
 */
function splitOnFrameStarts(input: string): string[] {
  const starts: number[] = [];
  for (let i = input.indexOf('ID:'); i !== -1; i = input.indexOf('ID:', i + 1)) {
    // `SID:` also contains `ID:`; only its own `S` can precede a real key boundary.
    if (i > 0 && input[i - 1] === 'S') continue;
    starts.push(i);
  }
  if (starts.length === 0) return [input];

  const pieces: string[] = [];
  // Text before the first `ID:` is normally a truncated leftover, but `V` is documented to
  // sit ahead of `ID`, and cutting it away would silently downgrade a future-version frame
  // to v1 — defeating the version gate exactly when it is needed. So a prefix that is
  // nothing but a `V` pair rejoins the frame it belongs to; anything else stays its own
  // piece, which then fails for having no identity and gets logged rather than vanishing.
  const prefix = input
    .slice(0, starts[0])
    .trim()
    .replace(/,+$/, '');
  const isVersion = VERSION_PREFIX_RE.test(prefix);
  const isControl = CONTROL_PREFIX_RE.test(prefix);
  const validPrefix = (isVersion || isControl) ? `${prefix},` : '';
  if (prefix && !validPrefix) pieces.push(prefix);

  for (let i = 0; i < starts.length; i++) {
    const piece = input.slice(starts[i], starts[i + 1] ?? input.length).trim();
    if (!piece) continue;
    // A trailing comma is what's left when the split lands mid-frame.
    const cleaned = piece.replace(/,+$/, '');
    pieces.push(i === 0 ? `${validPrefix}${cleaned}` : cleaned);
  }
  return pieces;
}

export interface BleStateListener {
  onStateChange?: (state: BleConnectionState) => void;
  onDevicesChanged?: (devices: DiscoveredDevice[]) => void;
  onFrameReceived?: (frame: ParsedFrame) => void;
  onControlFrame?: (frame: ControlFrame) => void;
  onFailure?: (failure: BleFailure) => void;
}

/**
 * Owns the BLE radio: permissions, scanning, connection lifecycle, MTU, characteristic
 * subscription and teardown. It is deliberately the only module that touches
 * `react-native-ble-plx`; everything above it consumes the domain types in `./types`.
 */
class BleService {
  private manager: BleManager;
  private listeners = new Set<BleStateListener>();

  private currentState: BleConnectionState = 'Disconnected';
  private connectedDevice: Device | null = null;
  private sensorSubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;
  private appStateSubscription: { remove: () => void } | null = null;

  private isScanning = false;
  private scanRequested = false;
  private lastScanStartedAt = 0;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Holds the tail of a notification that did not end on a frame terminator, so a frame
   * split across two BLE packets is still parsed as one frame.
   */
  private frameBuffer = '';
  /** Fires when the notification stream goes quiet, flushing an unterminated tail. */
  private idleFlushTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Keyed by device id so repeated advertisements *update* an entry (RSSI moves as you
   * walk toward the stick) instead of being discarded as duplicates.
   */
  private discovered = new Map<string, DiscoveredDevice>();

  constructor() {
    this.manager = new BleManager();
    this.manager.setLogLevel(IS_DEV ? LogLevel.Debug : LogLevel.Warning);
    this.watchAppState();
  }

  /* ── listeners ──────────────────────────────────────────────────────────── */

  public registerListener(listener: BleStateListener): void {
    this.listeners.add(listener);
    listener.onStateChange?.(this.currentState);
    listener.onDevicesChanged?.(this.deviceList());
  }

  public unregisterListener(listener: BleStateListener): void {
    this.listeners.delete(listener);
  }

  private notifyState(state: BleConnectionState): void {
    this.currentState = state;
    log('state →', state);
    for (const l of this.listeners) l.onStateChange?.(state);
  }

  private notifyFailure(code: BleFailureCode, detail?: string): void {
    log('failure', code, detail ?? '');
    for (const l of this.listeners) l.onFailure?.({ code, detail });
  }

  private notifyDevices(): void {
    const list = this.deviceList();
    for (const l of this.listeners) l.onDevicesChanged?.(list);
  }

  /** Aaroh sticks first, then strongest signal first — nearest is easiest to identify. */
  private deviceList(): DiscoveredDevice[] {
    const cutoff = Date.now() - DEVICE_STALE_MS;
    return [...this.discovered.values()]
      .filter((d) => d.lastSeenAt >= cutoff)
      .sort((a, b) => {
        if (a.isLikelyStick !== b.isLikelyStick) return a.isLikelyStick ? -1 : 1;
        return (b.rssi ?? -999) - (a.rssi ?? -999);
      });
  }

  /* ── permissions ────────────────────────────────────────────────────────── */

  /**
   * Android needs location permission to scan, because BLE advertisements can be used to
   * infer position. Without it the scan starts "successfully" and reports **zero
   * results** — no error, no callback, nothing. That silence is why this is checked
   * before every scan rather than once at startup.
   */
  private async requestAndroidPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    const permissions =
      typeof Platform.Version === 'number' && Platform.Version >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

    const results = await PermissionsAndroid.requestMultiple(permissions);
    const granted = permissions.every(
      (p) => results[p] === PermissionsAndroid.RESULTS.GRANTED,
    );
    if (!granted) log('permissions denied', results);
    return granted;
  }

  /* ── scanning ───────────────────────────────────────────────────────────── */

  public async startScan(): Promise<void> {
    if (this.isScanning || this.scanRequested) return;
    // `isScanning` only becomes true after the awaits below, so a second tap during the
    // cooldown or the permission dialog would otherwise start a concurrent scan — and two
    // starts count twice against Android's five-per-30-seconds quota.
    this.scanRequested = true;
    try {
      await this.beginScan();
    } finally {
      this.scanRequested = false;
    }
  }

  private async beginScan(): Promise<void> {
    const elapsed = Date.now() - this.lastScanStartedAt;
    if (elapsed < SCAN_COOLDOWN_MS) {
      await new Promise((resolve) => setTimeout(resolve, SCAN_COOLDOWN_MS - elapsed));
    }

    if (!(await this.requestAndroidPermissions())) {
      this.notifyFailure('permission_denied');
      this.notifyState('Error');
      return;
    }

    let radioState: State;
    try {
      radioState = await this.manager.state();
    } catch (err) {
      // Thrown when there is no BLE adapter at all — the stock Android emulator, or a
      // device whose Bluetooth stack failed to initialise.
      this.notifyFailure('unsupported', describe(err));
      this.notifyState('Error');
      return;
    }

    if (radioState === State.Unsupported) {
      this.notifyFailure('unsupported');
      this.notifyState('Error');
      return;
    }
    if (radioState !== State.PoweredOn) {
      this.notifyFailure('bluetooth_off', radioState);
      this.notifyState('Error');
      return;
    }

    this.discovered.clear();
    this.notifyDevices();

    this.isScanning = true;
    this.lastScanStartedAt = Date.now();
    this.notifyState('Scanning');
    log('scan start');

    this.manager.startDeviceScan(
      // No UUID filter. Filtering by a custom 128-bit UUID drops any peripheral that
      // omits the service from its (31-byte) advertising packet — including an ESP32
      // whose name alone already fills it, and nRF Connect's advertiser in its default
      // configuration. The Aaroh service is matched *after* connecting instead, and
      // `isLikelyStick` merely sorts a matching advertisement to the top of the list.
      null,
      {
        // ble-plx defaults to SCAN_MODE_LOW_POWER, which listens ~10% of the time and
        // routinely misses peripherals that advertise at a slow interval. LowLatency
        // scans continuously — the right trade for a foreground picker the farmer is
        // staring at, and it is bounded to SCAN_DURATION_MS.
        scanMode: ScanMode.LowLatency,
        legacyScan: true,
        allowDuplicates: true,
      },
      (error, device) => {
        if (error) {
          this.handleScanError(error);
          return;
        }
        if (device) this.recordDevice(device);
      },
    );

    this.scanTimer = setTimeout(() => {
      // Cleared in stopScan(); without that, a timer from a previous window would fire
      // mid-way through the next scan and stop it after a few seconds.
      this.scanTimer = null;
      if (this.isScanning) this.stopScan();
    }, SCAN_DURATION_MS);
  }

  /**
   * Every advertisement, named or not. The previous implementation only surfaced devices
   * with `device.name`, which hides the majority of real peripherals: most
   * advertisements carry no Complete Local Name, so the list looked almost empty even
   * though the scan was working.
   */
  private recordDevice(device: Device): void {
    const serviceUuids = (device.serviceUUIDs ?? []).map((u) => u.toLowerCase());
    const name = device.name ?? device.localName ?? null;

    this.discovered.set(device.id, {
      id: device.id,
      name: name && name.trim().length > 0 ? name.trim() : null,
      rssi: device.rssi ?? null,
      serviceUuids,
      isLikelyStick: serviceUuids.includes(AAROH_SERVICE_UUID),
      lastSeenAt: Date.now(),
    });
    this.notifyDevices();
  }

  private handleScanError(error: BleError): void {
    this.manager.stopDeviceScan();
    this.isScanning = false;
    this.clearScanTimer();

    const code: BleFailureCode =
      error.errorCode === BleErrorCode.LocationServicesDisabled
        ? 'location_services_off'
        : error.errorCode === BleErrorCode.BluetoothUnsupported
          ? 'unsupported'
          : error.errorCode === BleErrorCode.BluetoothPoweredOff
            ? 'bluetooth_off'
            : error.errorCode === BleErrorCode.BluetoothUnauthorized
              ? 'permission_denied'
              : 'scan_failed';

    this.notifyFailure(code, `${error.errorCode}: ${error.message}`);
    this.notifyState('Error');
  }

  private clearScanTimer(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  public stopScan(): void {
    this.clearScanTimer();
    if (!this.isScanning) return;
    this.manager.stopDeviceScan();
    this.isScanning = false;
    log('scan stop', this.discovered.size, 'device(s)');
    if (this.currentState === 'Scanning') this.notifyState('Disconnected');
  }

  /* ── connection lifecycle ───────────────────────────────────────────────── */

  /**
   * Connects, negotiates MTU, discovers services and subscribes to the sensor
   * characteristic. Scanning is stopped first: on Android an in-flight scan and a
   * connection attempt compete for the same radio, and the connection is the one that
   * loses (a `connect()` during a LowLatency scan frequently times out at 133/GATT_ERROR).
   */
  public async connect(deviceId: string): Promise<void> {
    this.stopScan();
    await this.disconnect();

    this.notifyState('Connecting');
    log('connect →', deviceId);

    try {
      let device = await this.manager.connectToDevice(deviceId, { timeout: CONNECT_TIMEOUT_MS });

      // Android only; a no-op that resolves on iOS, where the OS negotiates MTU itself.
      // Failure here is not fatal — 23-byte default ATT payloads still work, frames just
      // arrive split across more notifications, which the reassembly buffer handles.
      try {
        device = await device.requestMTU(TARGET_MTU);
        log('mtu', device.mtu);
      } catch (err) {
        log('mtu negotiation failed, continuing at default', describe(err));
      }

      device = await device.discoverAllServicesAndCharacteristics();

      const services = await device.services();
      const hasAarohService = services.some(
        (s) => s.uuid.toLowerCase() === AAROH_SERVICE_UUID,
      );
      if (!hasAarohService) {
        // Reached by connecting to any nearby peripheral — a laptop, a pair of earbuds.
        // Worth a distinct code because the fix is "pick a different device", not "retry".
        log('connected device exposes', services.map((s) => s.uuid).join(', '));
        await this.disconnect();
        this.notifyFailure('service_not_found');
        this.notifyState('Error');
        return;
      }

      this.connectedDevice = device;
      this.watchDisconnect(device);
      await this.subscribeToSensor(device);

      this.notifyState('Connected');
      log('connected', device.id);
    } catch (err) {
      this.connectedDevice = null;
      this.notifyFailure('connect_failed', describe(err));
      this.notifyState('Error');
    }
  }

  /**
   * The stick can vanish at any moment — the farmer walks away, or its battery dies. Left
   * unhandled the UI would sit on "Connected" forever, so the library's own disconnect
   * event drives the state back to Disconnected.
   */
  private watchDisconnect(device: Device): void {
    this.disconnectSubscription = device.onDisconnected((error) => {
      log('device disconnected', error ? describe(error) : '(clean)');
      this.teardownConnection();
      this.notifyState('Disconnected');
    });
  }

  /**
   * Subscribes to sensor notifications and feeds each chunk through the reassembly
   * buffer before parsing.
   */
  private async subscribeToSensor(device: Device): Promise<void> {
    this.sensorSubscription = device.monitorCharacteristicForService(
      AAROH_SERVICE_UUID,
      SENSOR_CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          // Both of these are our own teardown or the peer going away — the disconnect
          // handler already reported the latter, so surfacing it again just produces a
          // second, redundant "something went wrong" in the picker.
          if (
            error.errorCode === BleErrorCode.OperationCancelled ||
            error.errorCode === BleErrorCode.DeviceDisconnected
          ) {
            return;
          }
          this.notifyFailure('unknown', `${error.errorCode}: ${error.message}`);
          return;
        }
        if (characteristic?.value) this.ingestChunk(decodeBase64(characteristic.value));
      },
    );
  }

  /**
   * Reassembles frames out of the notification stream.
   *
   * Three things can happen to a frame in transit and all three are handled here:
   *
   * 1. **Split** — one frame arrives across several notifications. Buffer until terminated.
   * 2. **Packed** — several frames share one notification. Split on `\n`.
   * 3. **Unterminated** — the sender never wrote a `\n`. This is the common case with a
   *    hand-typed nRF Connect value, and it used to poison everything after it: the tail
   *    sat in the buffer forever and got glued to the front of the next frame, so every
   *    later notification logged as unparseable. Two independent defences now:
   *    `resync()` discards anything before the next frame start, and an idle timer flushes
   *    a buffer that has stopped growing.
   */
  private ingestChunk(chunk: string): void {
    if (!chunk) return;
    this.frameBuffer += chunk;

    if (this.frameBuffer.length > MAX_BUFFER_BYTES) {
      log('frame buffer overflow, discarding', this.frameBuffer.length, 'bytes');
      this.frameBuffer = '';
      return;
    }

    const segments = this.frameBuffer.split('\n');
    // The trailing element is either '' (chunk ended exactly on a newline) or a partial
    // frame; either way it stays in the buffer for the next notification.
    this.frameBuffer = segments.pop() ?? '';

    for (const segment of segments) this.emitFrames(segment);

    // Anything left is either a genuine split frame — another notification is milliseconds
    // away — or a complete frame whose sender omitted the terminator. Waiting a moment
    // tells the two apart without guessing.
    this.scheduleIdleFlush();
  }

  /**
   * Recovers frame boundaries inside one newline-delimited segment.
   *
   * A frame always starts at `ID:`, so any `ID:` that is not at position 0 marks the start
   * of a new frame and everything before it is a truncated leftover. Splitting there turns
   * `…TS:1693353600ID:P123,FW:1.0.2,…` — which parses as nothing — into one discarded
   * fragment plus one good frame.
   */
  private emitFrames(segment: string): void {
    const trimmed = segment.trim();
    if (!trimmed) return;

    for (const candidate of splitOnFrameStarts(trimmed)) {
      // Check for control frames first (CMD:STATUS, CMD:SYNC_DONE)
      const control = parseControlFrame(candidate);
      if (control) {
        log('control frame', control.command, control.count);
        for (const l of this.listeners) l.onControlFrame?.(control);
        continue;
      }

      const frame = parseFrame(candidate);
      if (!frame) {
        // Distinguish the two ways a fragment fails, because they need different fixes.
        // Sensor keys but no `ID:` means the sender split the frame itself — almost always
        // a stray newline inside a hand-typed test value, which no amount of buffering can
        // repair because the identity ended up in a different frame.
        const looksTruncated = /(?:^|,)\s*(?:N|P|K|pH|EC|M|T|Lat|Lng|TS):/.test(candidate);
        if (looksTruncated && !candidate.startsWith('ID:')) {
          log('fragment with values but no ID — sender split the frame:', candidate.slice(0, 120));
        } else {
          log('unparseable fragment, ignored:', candidate.slice(0, 120));
        }
        continue;
      }
      log('frame', frame.metadata.probe_id, frame.metadata.firmware_version);
      for (const l of this.listeners) l.onFrameReceived?.(frame);
    }
  }

  /**
   * Flushes a buffer that has gone quiet. A real BLE notification burst arrives back to
   * back (single-digit milliseconds apart), so 400 ms of silence means the sender is done
   * and the tail is a whole frame that simply lacks its `\n`.
   */
  private scheduleIdleFlush(): void {
    if (this.idleFlushTimer) clearTimeout(this.idleFlushTimer);
    if (!this.frameBuffer) return;

    this.idleFlushTimer = setTimeout(() => {
      this.idleFlushTimer = null;
      const pending = this.frameBuffer;
      this.frameBuffer = '';
      if (pending.trim()) {
        log('flushing unterminated frame after idle');
        this.emitFrames(pending);
      }
    }, IDLE_FLUSH_MS);
  }

  /** Writes an ASCII command to the control characteristic (e.g. `READ`, `SLEEP`). */
  public async sendCommand(command: string): Promise<void> {
    const device = this.connectedDevice;
    if (!device) throw new Error('Not connected');
    await device.writeCharacteristicWithResponseForService(
      AAROH_SERVICE_UUID,
      CMD_CHAR_UUID,
      encodeBase64(command),
    );
    log('command sent', command);
  }

  /**
   * Releases subscriptions and buffers without touching the radio. Split out from
   * `disconnect()` because the disconnect *event* has to run the same cleanup, and
   * calling `cancelConnection()` from inside its own handler throws.
   */
  private teardownConnection(): void {
    this.sensorSubscription?.remove();
    this.sensorSubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    if (this.idleFlushTimer) {
      clearTimeout(this.idleFlushTimer);
      this.idleFlushTimer = null;
    }
    this.frameBuffer = '';
    this.connectedDevice = null;
  }

  public async disconnect(): Promise<void> {
    const device = this.connectedDevice;
    this.teardownConnection();
    if (!device) return;

    try {
      // Guarded: cancelling a connection the OS already dropped throws
      // DeviceDisconnected, which is not an error the farmer needs to hear about.
      if (await device.isConnected()) await device.cancelConnection();
    } catch (err) {
      log('disconnect ignored', describe(err));
    }
    log('disconnected', device.id);
    if (this.currentState !== 'Disconnected') this.notifyState('Disconnected');
  }

  public getConnectedDeviceId(): string | null {
    return this.connectedDevice?.id ?? null;
  }

  public isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  /* ── app lifecycle ──────────────────────────────────────────────────────── */

  /**
   * Android kills or throttles a scan started by a backgrounded app, and Android 7+ counts
   * the restart against the 5-scans-per-30 s limit — so a farmer who switches apps a few
   * times while the picker is open can silently exhaust the quota. Stopping the scan on
   * background avoids that entirely. The *connection* is deliberately left alive: the
   * config plugin declares `modes: ['central']`, and losing the stick because the phone
   * screen turned off mid-reading would be worse than the battery cost.
   */
  private watchAppState(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        if (next !== 'active' && this.isScanning) {
          log('app backgrounded — stopping scan');
          this.stopScan();
        }
      },
    );
  }

  /** Full teardown. Only for tests and hot-reload; the singleton lives for the app's life. */
  public async destroy(): Promise<void> {
    this.stopScan();
    await this.disconnect();
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.listeners.clear();
    this.manager.destroy();
  }
}

export const bleService = new BleService();
