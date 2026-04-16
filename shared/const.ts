export const COOKIE_NAME = "app_session_id_v2";
export const LEGACY_COOKIE_NAMES = ["app_session_id"] as const;
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const ONE_DAY_MS = 1000 * 60 * 60 * 24;
export const THIRTY_DAYS_MS = ONE_DAY_MS * 30;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
