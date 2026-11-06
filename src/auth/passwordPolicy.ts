/**
 * Client-side hint matching the server password policy (TradeFlow.Domain PasswordPolicy:
 * at least 8 characters, a letter and a number). The server is authoritative and re-validates.
 */
export function passwordProblems(pw: string): string[] {
  const out: string[] = []
  if (pw.length < 8) out.push('at least 8 characters')
  if (!/[A-Za-z]/.test(pw)) out.push('a letter')
  if (!/\d/.test(pw)) out.push('a number')
  return out
}
