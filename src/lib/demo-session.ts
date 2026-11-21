/**
 * Compatibility shim — prefer `@/features/session`.
 * Kept so existing imports continue to work during the structural refactor.
 */
export {
  DEMO_AUTH_USER_ID,
  DEMO_SESSION_KEY,
  endDemoSession,
  getDemoRouteUser,
  getDemoSession,
  isDemoSession,
  startDemoSession,
} from "@/features/session/demo-session";
