export function getAdminPasswordStatus() {
  const expected = process.env.ADMIN_PASSWORD;
  if (typeof expected !== "string" || expected.trim().length === 0) {
    return { ok: false, reason: "관리자 비밀번호 환경변수 ADMIN_PASSWORD가 설정되어 있지 않습니다." };
  }
  return { ok: true, value: expected.trim() };
}

export function checkAdminPassword(password: unknown) {
  const status = getAdminPasswordStatus();
  return status.ok
    && typeof password === "string"
    && password.trim() === status.value;
}

export function getAdminPasswordErrorMessage() {
  const status = getAdminPasswordStatus();
  return status.ok ? "관리자 비밀번호가 올바르지 않습니다." : status.reason;
}
