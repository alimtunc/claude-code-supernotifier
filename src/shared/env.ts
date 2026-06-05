export function isInsideCmux(env: NodeJS.ProcessEnv): boolean {
  const bin = env.CMUX_CLAUDE_HOOK_CMUX_BIN;
  return typeof bin === 'string' && bin.length > 0;
}
