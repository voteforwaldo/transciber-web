export function isVercel(): boolean {
  return process.env.VERCEL === "1";
}
