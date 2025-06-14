import { EthChainId, EthContext } from '@sentio/sdk/eth';
import { getPendleYieldContractFactoryContractOnContext } from './types/eth/pendleyieldcontractfactory.js';
import { PenpieReceiptTokenProcessorTemplate } from './types/eth/penpiereceipttoken.js';
import { PenpieStakingProcessor, getPenpieStakingContractOnContext } from './types/eth/penpiestaking.js';
import { PendleMarketFactoryV3Processor } from './types/eth/pendlemarketfactoryv3.js';
import { getStandardizedYieldContractOnContext } from './types/eth/standardizedyield.js';
import { ERC20ProcessorTemplate, getERC20ContractOnContext } from '@sentio/sdk/eth/builtin/erc20';
import {
  getPendleMarketContractOnContext,
  PendleMarketBoundContractView,
  PendleMarketProcessorTemplate,
} from './types/eth/pendlemarket.js';
import { RewardPoolUser, Rewcache, PositionSnapshot } from './schema/schema.js';
import {
  CHAIN_ID,
  // EQB_BOOSTER_ADDRESS,
  // EQB_BOOSTER_START_BLOCK,
  ONE_DAY_IN_MINUTE,
  PENPIE_STAKING_ADDRESS,
  PENPIE_STAKING_START_BLOCK
} from './consts.js';
import { UserPositionRaw } from './position-raw.js';
import { addLPPositionSnapshot } from './position-snapshot.js';
import { createPoolIfNotExist, createPoolSnapshotIfNotExist } from './pool.js';
import { getDateInfo } from './helper.js';
import { PendleYieldTokenProcessorTemplate } from './types/eth/pendleyieldtoken.js';


PenpieStakingProcessor.bind({
  address: PENPIE_STAKING_ADDRESS,
  network: EthChainId.SONIC_MAINNET,
  startBlock: PENPIE_STAKING_START_BLOCK,
}).onEventPoolAdded(async (event, ctx) => {
  //记录pools信息
  const penpieStaking = getPenpieStakingContractOnContext(ctx, PENPIE_STAKING_ADDRESS);
  // const poolInfo = await booster.poolInfo(event.args._pid);
  const marketAddress = event.args._market;
  const rewarderAddress = event.args._rewarder;
  const receiptTokenAddress = event.args._receiptToken;
  const market = getPendleMarketContractOnContext(ctx, marketAddress);
  const tokens = await market.readTokens();
  await createPoolIfNotExist(ctx, tokens._SY, rewarderAddress, receiptTokenAddress, marketAddress);

  //创建缓存
  await createRewcache(ctx, marketAddress, tokens, rewarderAddress, receiptTokenAddress);

  // // 记录所有用户
  PenpieReceiptTemplate.bind(
    {
      address: receiptTokenAddress,
      startBlock: event.blockNumber
    },
    ctx
  );
  // //快照用户余额
  // PenpiePoolTemplate.bind(
  //   {
  //     address: receiptTokenAddress,
  //     startBlock: event.blockNumber
  //   },
  //   ctx
  // );
});

const PenpieReceiptTemplate = new PenpieReceiptTokenProcessorTemplate().onEventTransfer(async (event, ctx) => {
  const id = `${event.address.toLowerCase()}-${event.args.to.toLowerCase()}`;
  const entity = await ctx.store.get(RewardPoolUser, id);
  if (!entity) {
    const newEntity = new RewardPoolUser({
      id: id,
      user: event.args.to.toLowerCase(),
      reward_pool: event.address.toLowerCase(),
  });
    await ctx.store.upsert(newEntity);
  }
  //记录日志
  ctx.eventLogger.emit("Events",{
      chain_id: CHAIN_ID,
      user_address: event.args.to.toLowerCase(),
      pool_address:event.address.toLowerCase(),
      amount: event.args.value,
      amount_usd: null,
      event_type: 'Staked'
  })
});



const PenpiePoolTemplate = new PenpieReceiptTokenProcessorTemplate().onTimeInterval(
  async (_, ctx) => {
    let rewcache = (await ctx.store.get(Rewcache, ctx.address.toLowerCase()));
    if (!rewcache) {
      console.log("First attempt failed, trying without toLowerCase");
      rewcache = await ctx.store.get(Rewcache, ctx.address);
    }
    if (!rewcache) {
      console.log("Second attempt failed, trying with original case");
      rewcache = await ctx.store.get(Rewcache, ctx.address.toUpperCase());
    }
    if (!rewcache) {
      console.log("All attempts failed, skipping interval");
      return;
    }

    await createPoolSnapshotIfNotExist(ctx, rewcache);

    const rc: UserPositionRaw = {};
    await addLPPositionSnapshot(ctx, rewcache, rc);
    const users = Object.keys(rc);
    await Promise.all(
      users.map(async (user) => {
        const { d, blockDate } = getDateInfo(ctx);
        const id = `${rewcache.rewardPool}-${user}-${d}`;
        const entity = new PositionSnapshot({
          id: id,
          timestamp: d,
          block_date: blockDate,
          chain_id: CHAIN_ID,
          pool_address: rewcache.rewardPool,
          user_address: user,
          underlying_token_address: rewcache.underlying_token_address,
          underlying_token_index: 0,
          underlying_token_amount: rc[user]
            .scaleDown(rewcache.underlying_token_decimals)
            .toNumber(),
        });
        await ctx.store.upsert(entity);
      })
    );
  },
  ONE_DAY_IN_MINUTE,
  ONE_DAY_IN_MINUTE
);

async function createRewcache(
  ctx: EthContext,
  marketAddr: string,
  tokens: Awaited<ReturnType<PendleMarketBoundContractView['readTokens']>>,
  rewardPoolAddr: string,
  receiptTokenAddr: string
) {
  console.log(`tokens`, tokens);
  const sy = getStandardizedYieldContractOnContext(ctx, tokens._SY);
  const yieldToken = getERC20ContractOnContext(ctx, await sy.yieldToken());

  const decimals = await yieldToken.decimals();
  await ctx.store.upsert(
    new Rewcache({
      id: receiptTokenAddr.toLowerCase(),
      SY: sy.address.toLowerCase(),
      LP: marketAddr.toLowerCase(),
      rewardPool: receiptTokenAddr.toLowerCase(),
      underlying_token_address: yieldToken.address.toLowerCase(),
      underlying_token_decimals: Number(decimals.toString()),
    })
  );
}
