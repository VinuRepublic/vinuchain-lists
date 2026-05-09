#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const TESTNET_CHAIN_ID = 206n;
const TESTNET_RPC = process.env.TESTNET_RPC || 'https://vinufoundation-rpc.com';
const EXPLORER_API =
  process.env.TESTNET_EXPLORER_API || 'https://testnet.vinuexplorer.org/api/v2';
const QUOTA_PROXY = '0x824B93dE7221cf8a35FBd29d5202f6eFa3A29C5D';
const PROXY_ADMIN = '0xcE154534e1E8F4Cc9Ab642Ad1816Ee1A237055F4';
const VERIFIED_IMPLEMENTATION = '0x80DA5f5e78c94EE5125Be515Ad4cd248469B57ba';
const STAKE_FOR_SELECTOR = '4bf69206';
const INFO_PATH = path.join(process.cwd(), 'contracts/vinuchain/info.json');

const proxyAdminAbi = [
  'function getProxyImplementation(address proxy) view returns (address)',
];

function hasFlag(name) {
  return process.argv.includes(name);
}

function readInfo() {
  return JSON.parse(fs.readFileSync(INFO_PATH, 'utf8'));
}

function writeInfo(info) {
  fs.writeFileSync(INFO_PATH, `${JSON.stringify(info, null, 2)}\n`);
}

function getContract(info, name) {
  const contract = info.contracts.find((entry) => entry.name === name);
  if (!contract) {
    throw new Error(`Missing ${name} entry in contracts/vinuchain/info.json`);
  }
  return contract;
}

async function getExplorerContract(implementation) {
  const response = await fetch(`${EXPLORER_API}/smart-contracts/${implementation}`);
  if (!response.ok) {
    throw new Error(
      `VinuExplorer returned HTTP ${response.status} for ${implementation}`
    );
  }
  return response.json();
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const info = readInfo();
  const provider = new ethers.JsonRpcProvider(TESTNET_RPC);
  const proxyAdmin = new ethers.Contract(PROXY_ADMIN, proxyAdminAbi, provider);

  const [network, liveImplementation] = await Promise.all([
    provider.getNetwork(),
    proxyAdmin.getProxyImplementation(QUOTA_PROXY),
  ]);

  if (network.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`Unexpected chain ${network.chainId}; expected ${TESTNET_CHAIN_ID}`);
  }

  const normalizedLiveImplementation = ethers.getAddress(liveImplementation);
  if (
    normalizedLiveImplementation !== ethers.getAddress(VERIFIED_IMPLEMENTATION)
  ) {
    throw new Error(
      `Live Quota proxy still points at ${normalizedLiveImplementation}; expected verified receiver implementation ${VERIFIED_IMPLEMENTATION}`
    );
  }

  const code = await provider.getCode(normalizedLiveImplementation);
  if (!code.toLowerCase().includes(STAKE_FOR_SELECTOR)) {
    throw new Error(
      `Live implementation ${normalizedLiveImplementation} does not contain stakeFor selector`
    );
  }

  const explorer = await getExplorerContract(normalizedLiveImplementation);
  if (!explorer.is_verified) {
    throw new Error(
      `Live implementation ${normalizedLiveImplementation} is not verified on VinuExplorer`
    );
  }
  if (!explorer.is_fully_verified) {
    throw new Error(
      `Live implementation ${normalizedLiveImplementation} is not fully verified on VinuExplorer`
    );
  }
  if (explorer.is_partially_verified) {
    throw new Error(
      `Live implementation ${normalizedLiveImplementation} is only partially verified on VinuExplorer`
    );
  }
  if (explorer.is_changed_bytecode) {
    throw new Error(
      `VinuExplorer reports changed bytecode for ${normalizedLiveImplementation}`
    );
  }

  const proxyEntry = getContract(info, 'OptimizedTransparentUpgradeableProxy');
  if (ethers.getAddress(proxyEntry.address) !== ethers.getAddress(QUOTA_PROXY)) {
    throw new Error(`Unexpected proxy entry address ${proxyEntry.address}`);
  }

  const quotaEntry = getContract(info, 'QuotaContract');
  quotaEntry.address = normalizedLiveImplementation;
  quotaEntry.description =
    'Current verified receiver-capable Quota/Payback implementation behind the proxy; supports stakeFor(address) so one wallet can fund stake for another wallet receiving refunds';

  info.contracts = info.contracts.filter(
    (entry) => entry.name !== 'QuotaContractReceiverImplementation'
  );

  const result = {
    rpc: TESTNET_RPC,
    explorerApi: EXPLORER_API,
    proxy: QUOTA_PROXY,
    implementation: normalizedLiveImplementation,
    explorerName: explorer.name || null,
    explorerVerified: Boolean(explorer.is_verified),
    explorerFullyVerified: Boolean(explorer.is_fully_verified),
    explorerPartiallyVerified: Boolean(explorer.is_partially_verified),
    explorerChangedBytecode: Boolean(explorer.is_changed_bytecode),
    dryRun,
  };

  if (!dryRun) {
    writeInfo(info);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
