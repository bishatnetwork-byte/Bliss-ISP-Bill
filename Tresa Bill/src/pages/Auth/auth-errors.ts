import { ApiError } from "@/api/foreform";

export function authErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 429) return error.message || "Too many attempts. Please wait a few minutes and try again.";
    if (error.status && error.status >= 500) return "The authentication server is not responding correctly. Please try again shortly.";
    return error.message || fallback;
  }

  if (error instanceof Error) {
    if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
      return "We could not reach the server. Check your connection and try again.";
    }
    return error.message || fallback;
  }

  return fallback;
}
