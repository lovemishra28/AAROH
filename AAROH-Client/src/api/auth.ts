import { api } from './client';
import type {
  EmailLoginInput,
  EmailOtpRequestInput,
  EmailOtpVerifyInput,
  EmailRegisterInput,
  EmailRegisterResult,
  LogoutResult,
  MeResult,
  OtpRequestResult,
  OtpVerifyResult,
  PasswordForgotInput,
  PasswordResetInput,
  TokenBundle,
  UpdateMeInput,
  UpdateMeResult,
} from './types';

/**
 * Auth endpoints. Three doors, one session shape: phone + OTP, email
 * (password or one-time code), and Google. Every call below resolves to
 * `TokenBundle & { farmer }`, which is exactly what `authStore.setSession()`
 * takes — so the store never needs to know which door was used.
 *
 * All of these are unauthenticated (`auth: false`); /v1/me and
 * /v1/auth/refresh's *result* seed the session.
 */

export function requestOtp(phone: string): Promise<OtpRequestResult> {
  return api.post<OtpRequestResult>('/v1/auth/otp/request', { phone }, { auth: false });
}

export function verifyOtp(phone: string, code: string): Promise<OtpVerifyResult> {
  return api.post<OtpVerifyResult>('/v1/auth/otp/verify', { phone, code }, { auth: false });
}

export function refreshTokens(refresh_token: string): Promise<TokenBundle> {
  return api.post<TokenBundle>('/v1/auth/refresh', { refresh_token }, { auth: false });
}

/**
 * POST /v1/auth/logout — revoke the refresh token server-side.
 *
 * Clearing the phone's secure store is not enough on its own: the refresh token
 * row stays valid for its full life, so a copy lifted off a lost phone could keep
 * minting access tokens. Unauthenticated by design, because the refresh token is
 * itself the credential and sign-out has to work even after the access token has
 * expired. Callers should treat failure as non-fatal — `authStore.signOut()` drops
 * the local session either way.
 */
export function logout(refresh_token: string, all = false): Promise<LogoutResult> {
  return api.post<LogoutResult>('/v1/auth/logout', { refresh_token, all }, { auth: false });
}

export function getMe(): Promise<MeResult> {
  return api.get<MeResult>('/v1/me');
}

/**
 * Partial profile update. Used right after a phone sign-up that captured a name
 * (OTP verify itself carries no name field), and by Settings for language/region.
 */
export function updateMe(input: UpdateMeInput): Promise<UpdateMeResult> {
  return api.patch<UpdateMeResult>('/v1/me', input);
}

/* ─── Google ────────────────────────────────────────────────────────────────── */

/**
 * Exchanges a Google ID token (from `hooks/useGoogleAuth.ts`, via the native
 * Google Sign-In SDK) for an AgroPulse session:
 *   POST /v1/auth/google  { id_token }  →  TokenBundle & { farmer }
 *
 * The server verifies the token's signature against Google's published keys and
 * checks that its audience is our own client ID, so the ID token is a proof of
 * identity rather than a claim. That is also why a mismatched
 * EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID fails here rather than silently signing in as
 * the wrong person — the two sides must hold the same client ID.
 */
export function googleSignIn(idToken: string): Promise<OtpVerifyResult> {
  return api.post<OtpVerifyResult>('/v1/auth/google', { id_token: idToken }, { auth: false });
}

/* ─── Email + password ──────────────────────────────────────────────────────── */

/**
 * POST /v1/auth/email/register — creates the account and signs in immediately.
 * A verification code is emailed at the same time, but the session does not wait
 * on it: `farmer.email_verified` simply stays false until the code is redeemed.
 */
export function registerWithEmail(input: EmailRegisterInput): Promise<EmailRegisterResult> {
  return api.post<EmailRegisterResult>('/v1/auth/email/register', input, { auth: false });
}

/** POST /v1/auth/email/login — email + password sign-in. */
export function loginWithEmail(input: EmailLoginInput): Promise<OtpVerifyResult> {
  return api.post<OtpVerifyResult>('/v1/auth/email/login', input, { auth: false });
}

/* ─── Email one-time codes ─────────────────────────────────────────────────── */

/**
 * POST /v1/auth/email/otp/request — email a code.
 *
 * `purpose: 'login'` is passwordless sign-in and creates the account on first
 * use, mirroring the phone flow. `purpose: 'email_verify'` confirms the address
 * on an existing account.
 */
export function requestEmailOtp(input: EmailOtpRequestInput): Promise<OtpRequestResult> {
  return api.post<OtpRequestResult>('/v1/auth/email/otp/request', input, { auth: false });
}

/** POST /v1/auth/email/otp/verify — redeem an email code for a session. */
export function verifyEmailOtp(input: EmailOtpVerifyInput): Promise<OtpVerifyResult> {
  return api.post<OtpVerifyResult>('/v1/auth/email/otp/verify', input, { auth: false });
}

/* ─── Password reset ───────────────────────────────────────────────────────── */

/**
 * POST /v1/auth/password/forgot — email a reset code. Always resolves, even for
 * an address with no account: the server deliberately does not reveal which
 * addresses are registered, so the UI should show the same "check your inbox"
 * either way.
 */
export function forgotPassword(input: PasswordForgotInput): Promise<OtpRequestResult> {
  return api.post<OtpRequestResult>('/v1/auth/password/forgot', input, { auth: false });
}

/**
 * POST /v1/auth/password/reset — set a new password with the emailed code and
 * sign in. Every other session is revoked server-side.
 */
export function resetPassword(input: PasswordResetInput): Promise<OtpVerifyResult> {
  return api.post<OtpVerifyResult>('/v1/auth/password/reset', input, { auth: false });
}
