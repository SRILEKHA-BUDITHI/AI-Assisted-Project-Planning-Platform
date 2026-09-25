/** Mirrors the Supabase Auth password policy configured server-side. */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 10 characters', test: (p: string) => p.length >= 10 },
  { id: 'lower', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { id: 'upper', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'digit', label: 'One number', test: (p: string) => /\d/.test(p) },
] as const

export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}
