/**
 * API types — mirror of the server contract in AAROH-Server/api/openapi.yaml (v1.0.0).
 * Keep these in lockstep with that file; it is the source of truth.
 */

export type Role = 'farmer' | 'agent' | 'admin';
export type ServerLang = 'hi' | 'en';

/** Returned by /v1/auth/otp/verify and /v1/auth/refresh. */
export type TokenBundle = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  role: Role;
};

/**
 * The signed-in farmer.
 *
 * Every identifier is nullable because a farmer can arrive through any of three
 * doors: phone + OTP (phone set, email null), email + password or email code
 * (email set, phone null), or Google (email set once Google has verified it). The
 * server enforces that at least one is present; the UI must therefore treat each
 * one as optional rather than assuming a phone number exists.
 */
export type Farmer = {
  id: string;
  phone: string | null;
  email: string | null;
  /** True once an email code has been redeemed, or Google vouched for the address. */
  email_verified: boolean;
  name: string | null;
  preferred_lang: ServerLang;
  region_code: string;
  role: Role;
  created_at: string;
};

/** POST /v1/auth/otp/request response. `dev_code` is only populated in non-production. */
export type OtpRequestResult = {
  sent: boolean;
  expires_in_s: number;
  dev_code: string | null;
};

/** POST /v1/auth/otp/verify response: a farmer plus a flattened TokenBundle (allOf). */
export type OtpVerifyResult = TokenBundle & { farmer: Farmer };

export type MeResult = { farmer: Farmer };

/**
 * POST /v1/auth/logout response. `revoked` is how many refresh-token rows were
 * closed — 0 when the token was already revoked or unknown, which the server
 * reports as success on purpose so sign-out never fails and never discloses
 * whether the token was live.
 */
export type LogoutResult = { revoked: number };

/**
 * Auth inputs for the email and Google doors. All of them resolve to the same
 * shape as `OtpVerifyResult`, so they drop straight into `authStore.setSession()`
 * unchanged — see README "Authentication providers" for the server contract.
 */
export type GoogleSignInInput = { id_token: string };
export type EmailRegisterInput = { name: string; email: string; password: string };
export type EmailLoginInput = { email: string; password: string };

/**
 * POST /v1/auth/email/register also reports whether the verification email went
 * out. Registration succeeds either way — the address just stays unverified — so
 * this is informational, never a failure to handle.
 */
export type EmailRegisterResult = OtpVerifyResult & {
  verification: { sent: boolean; dev_code?: string };
};

/** Email one-time codes: 'login' is passwordless sign-in, 'email_verify' confirms an address. */
export type EmailOtpPurpose = 'login' | 'email_verify';
export type EmailOtpRequestInput = { email: string; purpose?: EmailOtpPurpose };
export type EmailOtpVerifyInput = { email: string; code: string; purpose?: EmailOtpPurpose };

export type PasswordForgotInput = { email: string };
export type PasswordResetInput = { email: string; code: string; password: string };

export type UpdateMeInput = {
  name?: string;
  preferred_lang?: ServerLang;
  region_code?: string;
};
export type UpdateMeResult = { farmer: Farmer };

/** Every non-2xx response uses this envelope. */
export type ErrorEnvelope = {
  error: {
    code: string;
    message?: string;
    details?: unknown;
  };
  requestId?: string;
};

/* ─── Geometry ───────────────────────────────────────────────────────────── */

/**
 * The server emits PostGIS geometry as GeoJSON (`ST_AsGeoJSON`), so coordinates are
 * **[longitude, latitude]** — the opposite order to how every screen labels them.
 * `pointFromGeoJson()` / `ringFromGeoJson()` in lib/geo are the only places that unpack
 * this; nothing else should index into `coordinates` directly.
 */
export type GeoJsonPoint = { type: 'Point'; coordinates: [number, number] };

/** A field boundary. First ring is the outer one; auto-detected fields have no holes. */
export type GeoJsonPolygon = { type: 'Polygon'; coordinates: [number, number][][] };

/* ─── Fields (M4 + Workstream 2) ─────────────────────────────────────────── */

/**
 * A field's mean soil values across every reading attached to it, maintained
 * server-side (`field_aggregates`) whenever readings land. This is what the
 * dashboard shows and what advice is computed from once a field holds two or more
 * readings — a fertiliser plan is for the whole plot, not for the last hole the
 * probe went into. Null on a field with no readings yet.
 */
export type FieldAggregate = {
  reading_count: number;
  n_mgkg: number | null;
  p_mgkg: number | null;
  k_mgkg: number | null;
  ph: number | null;
  ec_uscm: number | null;
  moisture_vwc: number | null;
  soil_temp_c: number | null;
  first_reading_at: string | null;
  last_reading_at: string | null;
  updated_at: string | null;
};

export type Field = {
  id: string;
  farmer_id: string;
  /**
   * Null for an auto-detected field: the server refuses to invent a name it would
   * have to invent in one language. `fieldLabel()` in lib/fields supplies the display
   * label instead, so the same field reads correctly in Hindi and English.
   */
  name: string | null;
  /** Hectares. The farmer types acres; the app converts before sending (see lib/units). */
  area_ha: number | null;
  region_code: string;
  /** `'manual'` when the farmer added it, `'auto'` when GPS clustering detected it. */
  source: 'manual' | 'auto' | string;
  /** When clustering first detected this field. Null for manually created fields. */
  detected_at: string | null;
  centroid: GeoJsonPoint | null;
  boundary: GeoJsonPolygon | null;
  created_at: string;
  aggregate: FieldAggregate | null;
};

export type FieldsResult = { fields: Field[] };
export type FieldCreateResult = { field: Field };
export type FieldDetailResult = { field: Field; latest_reading: Reading | null };

export type FieldCreateInput = {
  name: string;
  /** Hectares. Required in practice — the recommendation refuses without an area. */
  area_ha: number;
  region_code?: string;
};

/* ─── Readings (M5) ─────────────────────────────────────────────────────── */

export type ReadingSource = 'probe_ble' | 'manual' | 'import';

/**
 * NPK are elemental mg/kg (probe basis), never oxide. `ec_uscm` is µS/cm — the manual
 * form accepts dS/m and multiplies ×1000 before building this. All six soil fields plus
 * an optional soil temperature; `source` is the only server-required field.
 */
export type ReadingInput = {
  field_id?: string;
  device_id?: string;
  source: ReadingSource;
  taken_at?: string;
  n_mgkg?: number;
  p_mgkg?: number;
  k_mgkg?: number;
  ph?: number;
  ec_uscm?: number;
  moisture_vwc?: number;
  soil_temp_c?: number;
  npk_is_calibrated?: boolean;
  idempotency_key?: string;
  raw_frame?: string;
};

export type Reading = ReadingInput & {
  id: string;
  location: GeoJsonPoint | null;
  created_at: string;
};

export type ReadingsIngestResult = {
  readings: Reading[];
  created_count: number;
  duplicate_count: number;
};

export type HistoryReading = Reading & {
  session_id: string | null;
  device_serial: string | null;
  device_firmware_version: string | null;
};

/* ─── Sync (Workstream 2) ────────────────────────────────────────────────── */

/**
 * One stick reading on its way to `POST /v1/readings/sync`.
 *
 * `idempotency_key` is the scan's local id, so re-sending a batch after a dropped
 * response stores nothing twice. No `field_id`: which field a point belongs to is
 * the server's decision, made by clustering the GPS coordinates — that is the whole
 * point of this endpoint and the reason it is not just `POST /v1/readings`.
 */
export type SyncReadingInput = {
  idempotency_key: string;
  taken_at?: string;
  session_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  n_mgkg?: number | null;
  p_mgkg?: number | null;
  k_mgkg?: number | null;
  ph?: number | null;
  ec_uscm?: number | null;
  moisture_vwc?: number | null;
  soil_temp_c?: number | null;
  raw_frame?: string | null;
};

export type SyncBatchInput = {
  device?: { serial?: string; firmware_version?: string };
  readings: SyncReadingInput[];
};

/** What one field gained from a sync. `created` distinguishes new plots from revisits. */
export type SyncFieldSummary = {
  field: Field;
  created: boolean;
  readings_added: number;
  /** Metres from the stored field to the cluster that matched it; null when created. */
  match_distance_m: number | null;
  orphans_adopted: number;
};

/** What the clustering decided, echoed back so a surprising split is diagnosable. */
export type SyncClusterSummary = {
  points: number;
  diameter_m: number;
  centroid: { lat: number; lng: number };
  field_id: string;
  field_created: boolean;
};

/**
 * A reading the server refused to store, with the reason. Rejection is per reading,
 * never per batch: one probe lifted out of the soil must not cost the farmer the
 * other eighty-nine points of the walk.
 */
export type SyncReject = { idempotency_key: string; reason: string };

/** A reading stored with a caveat — e.g. a 0,0 GPS fix discarded as "no fix". */
export type SyncWarning = { idempotency_key: string; reason: string };

export type SyncResult = {
  received: number;
  stored: number;
  /** Already on the server, from this batch or an earlier sync. Not an error. */
  duplicates: number;
  /** Stored with no field: an isolated point, or no GPS and no session to inherit from. */
  unassigned: number;
  fields_created: number;
  fields_matched: number;
  fields: SyncFieldSummary[];
  clusters: SyncClusterSummary[];
  sessions: { session_id: string; readings: number; field_ids: string[] }[];
  device_id: string | null;
  device_owned_by_other: boolean;
  rejected: SyncReject[];
  warnings: SyncWarning[];
};

/* ─── Recommendations (M6) — the frozen §6.4 payload the app renders ──────── */

export type NutrientGap = { n_kgha: number; p2o5_kgha: number; k2o_kgha: number };

export type ProductLine = {
  name: string;
  bags_50kg: number;
  kg: number;
  supplies: Record<string, number>;
};

export type Fertiliser = {
  products: ProductLine[];
  nutrient_gap_kgha: NutrientGap;
  cost_inr: number;
};

/** Segment A entry — grow now, no fertiliser needed. */
export type CropRank = {
  crop: string;
  crop_hi: string;
  score: number;
  rationale_code: string;
};

/** Segment B entry — worth it with a stated fertiliser cost. */
export type CropPlan = CropRank & { fertiliser: Fertiliser };

export type RecommendationResult = {
  model_version: string;
  agronomy_version: string;
  region_code: string;
  area_ha: number;
  segment_a: CropRank[];
  segment_b: CropPlan[];
  warnings: string[];
};

export type Recommendation = {
  id: string;
  field_id: string;
  reading_id: string | null;
  model_version: string;
  agronomy_version: string;
  region_code: string;
  area_ha: number;
  result: RecommendationResult;
  created_at: string;
};

export type RecommendationCreateResult = { recommendation: Recommendation };
export type RecommendationsListResult = { recommendations: Recommendation[] };

/** Optional overrides for POST /v1/fields/:id/recommendations. Empty body is valid. */
export type RecommendationInput = {
  reading_id?: string;
  /**
   * Which soil numbers to compute from. Omitted, the server prefers the field's mean
   * once it holds two or more readings, which is what the dashboard displays — advice
   * that disagreed with the figures on screen would be indefensible. Pass
   * `'latest_reading'` to force the single most recent point instead.
   */
  basis?: 'latest_reading' | 'field_average';
  area_ha?: number;
  season?: string;
  soil_type?: string;
  humidity?: number;
  rainfall?: number;
  budget_hint?: number;
};
