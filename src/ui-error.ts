/** Keep the actionable service/file error, without Electron's transport wrapper. */
export function uiErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/, "")
    .replace(/^(?:Error|TypeError):\s*/, "");
}
