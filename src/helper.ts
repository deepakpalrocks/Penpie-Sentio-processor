import { EthContext } from '@sentio/sdk/eth';

export function getDateInfo(ctx: EthContext) {
  const d = Math.floor(ctx.timestamp.getTime() / 1000);
  const blockDate = `${ctx.timestamp.getFullYear()}-${ctx.timestamp.getMonth() + 1}-${ctx.timestamp.getDate()}`;
  return { d, blockDate };
}
