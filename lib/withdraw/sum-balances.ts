export function sumKnownBalances(values: readonly (bigint | undefined)[]) {
  return {
    total: values.reduce<bigint>((sum, value) => sum + (value ?? BigInt(0)), BigInt(0)),
    failed: values.filter((value) => value === undefined).length,
  };
}
