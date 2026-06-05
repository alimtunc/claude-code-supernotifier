export function isPidInChain(pid: number, chain: readonly number[]): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  return chain.includes(pid);
}
