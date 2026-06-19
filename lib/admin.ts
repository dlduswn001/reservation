export function checkAdminPassword(password: unknown) {
  const expected = process.env.ADMIN_PASSWORD;
  return typeof expected === "string"
    && expected.trim().length > 0
    && typeof password === "string"
    && password.trim() === expected.trim();
}
