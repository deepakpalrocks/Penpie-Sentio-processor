import { EthContext } from '@sentio/sdk/eth';
import { getMulticall2ContractOnContext, Multicall2 } from './types/eth/multicall2.js';
import { getERC20ContractOnContext } from '@sentio/sdk/eth/builtin/erc20';
import { getPendleMarketContractOnContext } from './types/eth/pendlemarket.js';
import { getPendleYieldTokenContractOnContext } from './types/eth/pendleyieldtoken.js';
import { MULTICALL_ADDRESS, MULTICALL_BATCH_SIZE } from './consts.js';

export async function readAllUserActiveBalances(
  ctx: EthContext,
  marketAddr: string,
  allAddresses: string[]
): Promise<bigint[]> {
  const multicall = getMulticall2ContractOnContext(ctx, MULTICALL_ADDRESS);
  const market = getPendleMarketContractOnContext(ctx, marketAddr);

  const allCalls: Promise<Multicall2.ResultStructOutput[]>[] = [];
  for (let i = 0; i < allAddresses.length; i += MULTICALL_BATCH_SIZE) {
    const batch = allAddresses.slice(i, i + MULTICALL_BATCH_SIZE);
    const calls = batch.map((address) => {
      return {
        target: market.address,
        callData: market.rawContract.interface.encodeFunctionData('activeBalance', [address]),
      };
    });
    allCalls.push(multicall.callStatic.tryAggregate(true, calls));
  }

  const callOutputs = (await Promise.all(allCalls)).flat();
  return callOutputs.map((d) => {
    return BigInt(d.returnData);
  });
}

export async function readAllUserERC20Balances(
  ctx: EthContext,
  tokenAddress: string,
  allAddresses: string[]
): Promise<bigint[]> {
  const multicall = getMulticall2ContractOnContext(ctx, MULTICALL_ADDRESS);
  const erc20 = getERC20ContractOnContext(ctx, tokenAddress);
  const allCalls: Promise<Multicall2.ResultStructOutput[]>[] = [];
  for (let i = 0; i < allAddresses.length; i += MULTICALL_BATCH_SIZE) {
    const batch = allAddresses.slice(i, i + MULTICALL_BATCH_SIZE);
    const calls = batch.map((address) => {
      return {
        target: erc20.address,
        callData: erc20.rawContract.interface.encodeFunctionData('balanceOf', [address]),
      };
    });
    allCalls.push(multicall.callStatic.tryAggregate(true, calls));
  }
  const callOutputs = (await Promise.all(allCalls)).flat();
  return callOutputs.map((d) => {
    return BigInt(d.returnData);
  });
}

export async function readAllYTPositions(
  ctx: EthContext,
  ytAddr: string,
  allUserAddresses: string[]
): Promise<
  {
    lastPYIndex: bigint;
    accruedInterest: bigint;
  }[]
> {
  const multicall = getMulticall2ContractOnContext(ctx, MULTICALL_ADDRESS);
  const yt = getPendleYieldTokenContractOnContext(ctx, ytAddr);
  const allCalls: Promise<Multicall2.ResultStructOutput[]>[] = [];
  for (let i = 0; i < allUserAddresses.length; i += MULTICALL_BATCH_SIZE) {
    const batch = allUserAddresses.slice(i, i + MULTICALL_BATCH_SIZE);
    const calls = batch.map((address) => {
      return {
        target: yt.address,
        callData: yt.rawContract.interface.encodeFunctionData('userInterest', [address]),
      };
    });
    allCalls.push(multicall.callStatic.tryAggregate(true, calls));
  }
  const callOutputs = (await Promise.all(allCalls)).flat();
  return callOutputs.map((d) => {
    const data = yt.rawContract.interface.decodeFunctionResult('userInterest', d.returnData);
    return {
      lastPYIndex: BigInt(data[0]),
      accruedInterest: BigInt(data[1]),
    };
  });
}
