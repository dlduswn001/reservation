export function checkAdminPassword(password: unknown) {
  const expected = process.env.ADMIN_PASSWORD || "1234";
  return typeof password === "string" && password.trim() === expected.trim();
}
