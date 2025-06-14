export type UserPositionRaw = Record<string, bigint>;

export function add(rc: UserPositionRaw, key: string, value: bigint) {
  if (rc[key]) {
    rc[key] += value;
  } else {
    rc[key] = value;
  }
}
