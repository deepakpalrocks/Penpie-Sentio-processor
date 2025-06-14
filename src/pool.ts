import { EthContext } from '@sentio/sdk/eth';
import { Rewcache, Pools, PoolSnapshot } from './schema/schema.js';
import { getStandardizedYieldContractOnContext } from './types/eth/standardizedyield.js';
import { getPendleMarketContractOnContext } from './types/eth/pendlemarket.js';

import { getERC20ContractOnContext } from '@sentio/sdk/eth/builtin/erc20';
import { CHAIN_ID,PENPIE_STAKING_ADDRESS } from './consts.js';
import { getDateInfo } from './helper.js';

export async function createPoolSnapshotIfNotExist(ctx: EthContext, rewcache: Rewcache) {
  const { d, blockDate } = getDateInfo(ctx);
  const sy = getStandardizedYieldContractOnContext(ctx, rewcache.SY);
  const id = `${sy.address.toLowerCase()}-${d}`;

  if (await ctx.store.get(PoolSnapshot, id)) {
    return;
  }

  const yieldToken = getERC20ContractOnContext(ctx, rewcache.underlying_token_address);
  const decimals = rewcache.underlying_token_decimals;
  const market = getPendleMarketContractOnContext(ctx, rewcache.LP);
  const penpieActiveBalance = (await market.activeBalance(PENPIE_STAKING_ADDRESS)).scaleDown(decimals);
  const totalActiveSupply = (await market.totalActiveSupply()).scaleDown(decimals);
  const total_amount = (await sy.totalSupply()).scaleDown(decimals);
  const penpie_rate = penpieActiveBalance.dividedBy(totalActiveSupply);
  const amount = total_amount.multipliedBy(penpie_rate);
  // console.log(`block_number:${ctx.blockNumber},penpieActiveBalance: ${penpieActiveBalance}, totalActiveSupply: ${totalActiveSupply},amount: ${amount}, penpie_rate: ${penpie_rate}`);

  const entity = new PoolSnapshot({
    id: id,
    timestamp: d,
    block_date: blockDate,
    chain_id: CHAIN_ID,
    underlying_token_address: yieldToken.address,
    underlying_token_index: 0,
    pool_address: rewcache.rewardPool,
    underlying_token_amount: amount.toNumber(),
  });

  await ctx.store.upsert(entity);
}

export async function createPoolIfNotExist(ctx: EthContext,syAddr:string, rewardPoolAddr: string, receiptTokenAddr: string, pendleMarketAddr: string) {
  syAddr = syAddr.toLowerCase();

  if (await ctx.store.get(Pools, syAddr)) {
    return;
  }

  const contract = getStandardizedYieldContractOnContext(ctx, syAddr);
  const yieldToken = getERC20ContractOnContext(ctx, await contract.yieldToken());
  const receiptToken = getERC20ContractOnContext(ctx, receiptTokenAddr);
  const pendleMarket = getPendleMarketContractOnContext(ctx, pendleMarketAddr);

  const pool = new Pools({
    id: syAddr,
    chain_id: CHAIN_ID,
    timestamp: Math.floor(ctx.timestamp.getTime() / 1000),
    creation_block_number: ctx.blockNumber,
    underlying_token_address: yieldToken.address,
    underlying_token_index: 0,
    underlying_token_symbol: await yieldToken.symbol(),
    underlying_token_decimals: (await yieldToken.decimals()).toString(),
    receipt_token_address: receiptTokenAddr,
    receipt_token_symbol: await receiptToken.symbol(),
    receipt_token_decimals: (await receiptToken.decimals()).toString(),
    pool_address: receiptTokenAddr.toLowerCase(),
    pool_symbol: "**",
  });

  await ctx.store.upsert(pool);
}
