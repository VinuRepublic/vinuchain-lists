const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const QUOTA_PROXY = '0x824B93dE7221cf8a35FBd29d5202f6eFa3A29C5D';
const PRE_RECEIVER_IMPLEMENTATION =
  '0x0c8735bD6b3E90eaD4cdAB917474Cc6e8E58ce82';
const RECEIVER_IMPLEMENTATION = '0x80DA5f5e78c94EE5125Be515Ad4cd248469B57ba';

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8')
  );
}

function readText(relativePath) {
  return fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8');
}

function getContract(info, name) {
  return info.contracts.find((entry) => entry.name === name);
}

function hasPayableStakeFor(abi) {
  return abi.some(
    (entry) =>
      entry.type === 'function' &&
      entry.name === 'stakeFor' &&
      entry.stateMutability === 'payable' &&
      entry.inputs?.length === 1 &&
      entry.inputs[0]?.type === 'address'
  );
}

describe('VinuChain quota registry receiver metadata', () => {
  it('tracks the Quota proxy and receiver-capable ABI/source', () => {
    const info = readJson('contracts/vinuchain/info.json');
    const abi = readJson('contracts/vinuchain/QuotaContract_abi.json');
    const source = readText('contracts/vinuchain/QuotaContract.sol');

    const proxy = getContract(info, 'OptimizedTransparentUpgradeableProxy');
    const quota = getContract(info, 'QuotaContract');
    const pendingReceiver = getContract(
      info,
      'QuotaContractReceiverImplementation'
    );

    expect(proxy.address).to.equal(QUOTA_PROXY);
    expect(proxy.description).to.include('User/app-facing Quota/Payback');
    expect(quota).to.exist;
    expect(hasPayableStakeFor(abi)).to.equal(true);
    expect(source).to.include('function stakeFor(address delegator)');
    expect(source).to.include("require(delegator != address(0)");

    if (pendingReceiver) {
      expect(quota.address).to.equal(PRE_RECEIVER_IMPLEMENTATION);
      expect(quota.description).to.include('pre-v2.0.17');
      expect(quota.description).to.include('replace this entry');
      expect(pendingReceiver.artifact).to.equal('QuotaContract');
      expect(pendingReceiver.address).to.equal(RECEIVER_IMPLEMENTATION);
      expect(pendingReceiver.description).to.include('stakeFor(address)');
    } else {
      expect(quota.address).to.equal(RECEIVER_IMPLEMENTATION);
      expect(quota.description).to.include('receiver-capable');
      expect(quota.description).to.include('stakeFor(address)');
    }
  });
});
