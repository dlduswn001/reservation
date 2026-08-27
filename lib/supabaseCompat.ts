export function getErrorMessage(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message)
    : error instanceof Error
      ? error.message
      : String(error || "오류가 발생했습니다.");
}

export function isMissingPassColumnError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("pass_registered_at")
    || message.includes("pass_first_lesson_at")
    || message.includes("pass_expires_at")
    || message.includes("pass_extension_used")
    || message.includes("pass_extension_until")
    || message.includes("pass_extension_reason")
    || message.includes("schema cache")
    || message.includes("could not find")
    || message.includes("column")
    || message.includes("pgrst204")
  );
}
