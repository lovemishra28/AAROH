/**
 * BLE domain types.
 *
 * Nothing outside `src/lib/ble` should import from `react-native-ble-plx`. The service
 * layer converts the library's `Device` objects into the plain shapes below before they
 * reach context, hooks or UI, so a library upgrade (or a swap to a different BLE
 * transport) stays contained in this folder.
 */

export type BleConnectionState =
  | 'Disconnected'
  | 'Scanning'
  | 'Connecting'
  | 'Connected'
  | 'Error';

/**
 * Stable failure codes. The service never produces user-facing English: the UI maps the
 * code to a localized string. The previous design put sentences in `Error.message` and
 * the modal did `message.includes('Location (GPS)')` to decide what to render — which
 * silently breaks the moment a message is reworded or translated.
 */
export type BleFailureCode =
  | 'unsupported' // no BLE radio — notably every stock Android emulator
  | 'permission_denied'
  | 'bluetooth_off'
  | 'location_services_off'
  | 'scan_failed'
  | 'connect_failed'
  | 'service_not_found' // connected, but the Aaroh GATT service is absent
  | 'unknown';

export type BleFailure = {
  code: BleFailureCode;
  /** Raw library detail. Shown only in dev builds; useful in a field bug report. */
  detail?: string;
};

/**
 * One advertising device as the UI needs it.
 *
 * `name` is best-effort: Android exposes two different names — `Device.name`
 * (`BluetoothDevice.getName()`, populated only for bonded or previously-cached devices)
 * and `Device.localName` (the Complete Local Name record of the *current* advertisement).
 * Plenty of peripherals supply one and not the other, and many supply neither, so a
 * missing name must never be a reason to hide a device.
 */
export type DiscoveredDevice = {
  id: string;
  name: string | null;
  rssi: number | null;
  serviceUuids: string[];
  /** True when the advertisement carries the Aaroh service UUID — sorted to the top. */
  isLikelyStick: boolean;
  /** Epoch ms of the most recent advertisement, so stale entries can be aged out. */
  lastSeenAt: number;
};
