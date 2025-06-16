import { EthContext } from '@sentio/sdk/eth';
import { Rewcache, RewardPoolUser } from './schema/schema.js';
import { add, UserPositionRaw } from './position-raw.js';
import { getPendleMarketContractOnContext } from './types/eth/pendlemarket.js';
import {
  readAllUserActiveBalances,
  readAllUserERC20Balances,
  readAllYTPositions,
} from './multicall.js';
import { getPendleYieldTokenContractOnContext } from './types/eth/pendleyieldtoken.js';
import { ONE, PENPIE_STAKING_ADDRESS } from './consts.js';

export async function addLPPositionSnapshot(
  ctx: EthContext,
  marcache: Rewcache,
  rc: UserPositionRaw
) {
  const market = getPendleMarketContractOnContext(ctx, marcache.LP);
  const [isExpired, state] = await Promise.all([
    await market.isExpired(),
    await market.readState(market.address),
  ]);
  if (isExpired) {
    return;
  }

  let users = (
    await ctx.store.list(RewardPoolUser, [
      {
        field: 'reward_pool',
        op: '=',
        value: marcache.rewardPool,
      },
    ])
  ).map((e) => e.user).filter((user) => user !== '0x0000000000000000000000000000000000000000');
  users = [... new Set(users)];


  const balances = await readAllUserERC20Balances(ctx, marcache.rewardPool, users);
  const totalActiveSupply = await market.totalActiveSupply();
  const penpieActiveBalance = await market.activeBalance(PENPIE_STAKING_ADDRESS);
  const penpieBalanceOf = await market.balanceOf(PENPIE_STAKING_ADDRESS);

  if (totalActiveSupply === 0n) {
    return;
  }
  if (penpieBalanceOf === 0n) {
    return;
  }

  for (let i = 0; i < users.length; i++) {
    const holding = (state.totalSy * penpieActiveBalance * balances[i]) / (totalActiveSupply * penpieBalanceOf);
    add(rc, users[i], holding);
  }
}

