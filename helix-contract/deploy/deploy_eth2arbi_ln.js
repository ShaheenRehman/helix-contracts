const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

// goerli test <> arbitrum goerli test
const ethereumUrl = "https://rpc.ankr.com/eth_goerli";
const arbitrumUrl = "https://goerli-rollup.arbitrum.io/rpc";
const ringArbitrumAddress = "0xFBAD806Bdf9cEC2943be281FB355Da05068DE925";
const ringEthereumAddress = "0x1836BAFa3016Dd5Ce543D0F7199cB858ec69F41E";
const ethereumProxyAdmin = "0x3F3eDBda6124462a09E071c5D90e072E0d5d4ed4";
const arbitrumProxyAdmin = "0x66d86a686e50c98bac236105efafb99ee7605dc5";
const inboxEthereumAddress = "0x6BEbC4925716945D46F0Ec336D5C2564F419682C";
const arbitrumChainId = 421613;
const ethereumChainId = 5;
const daoOnArbitrum = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";
const daoOnEthereum = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";

const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";

async function getLnBridgeTargetInitData(wallet, dao, inbox) {
    const bridgeContract = await ethers.getContractFactory("Arb2EthTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, inbox],
        "initialize",
    );
    console.log("LnBridgeInitData init data:", initdata);
}

async function getLnBridgeSourceInitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("Arb2EthSource", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao],
        "initialize",
    );
    console.log("LnBridgeInitData init data:", initdata);
}

async function transferAndLockMargin(
    wallet,
    bridgeAddress, 
    provider,
    tokenAddress,
    amount,
    receiver,
    withdrawNonce,
) {
    const bridge = await ethers.getContractAt("LnDefaultBridgeSource", bridgeAddress, wallet);
    const expectedFee = await bridge.totalFee(
        provider,
        tokenAddress,
        amount);
    console.log("expect fee is", expectedFee);
    const providerInfo = await bridge.lnProviders(await bridge.getProviderKey(provider, tokenAddress));
    //const tx = await bridge.callStatic.transferAndLockMargin(
    const tx = await bridge.transferAndLockMargin(
        [
            provider,
            tokenAddress,
            providerInfo.lastTransferId,
            expectedFee,
            withdrawNonce,
        ],
        amount,
        wallet.address,
    );
    console.log(tx);
}

async function relay(
    wallet,
    bridgeAddress,
    provider,
    sourceToken,
    targetToken,
    previousTransferId,
    timestamp,
    receiver,
    amount,
    expectedTransferId,
) {
    const bridge = await ethers.getContractAt("LnDefaultBridgeTarget", bridgeAddress, wallet);
    //const tx = await bridge.callStatic.relay(
    await bridge.transferAndReleaseMargin(
        [
            previousTransferId,
            provider,
            sourceToken,
            targetToken,
            amount,
            timestamp,
            receiver,
        ],
        expectedTransferId,
    );
    //console.log(tx);
}

async function slash(
    wallet,
    bridgeAddress,
    provider,
    sourceToken,
    targetToken,
    previousTransferId,
    timestamp,
    receiver,
    amount,
    expectedTransferId,
) {
    const bridge = await ethers.getContractAt("Eth2ArbSource", bridgeAddress, wallet);
    const maxSubmissionCost = await bridge.submissionSlashFee(
        30000000000,
        [
            previousTransferId,
            provider,
            sourceToken,
            targetToken,
            amount,
            timestamp,
            receiver,
        ],
        receiver,
        0,
        0,
        10,
    );
    const maxGas = 1000000;
    const gasPriceBid = 20000000000;
    const cost = maxSubmissionCost.add("0x470de4df820000");
    //return;

    //const tx = await bridge.callStatic.slashAndRemoteRefund(
    await bridge.slashAndRemoteRelease(
        [
            previousTransferId,
            provider,
            sourceToken,
            targetToken,
            amount,
            timestamp,
            receiver,
        ],
        expectedTransferId,
        maxSubmissionCost,
        maxGas,
        gasPriceBid,
        {value: cost },
    );
    //console.log(tx);
}

async function requestWithdrawMargin(
    wallet,
    bridgeAddress,
    lastTransferId,
    sourceToken,
    amount,
) {
    const bridge = await ethers.getContractAt("Arb2EthTarget", bridgeAddress, wallet);
    const maxSubmissionCost = await bridge.submissionWithdrawFee(
        30000000000,
        lastTransferId,
        sourceToken,
        amount,
        10,
    );
    const maxGas = 1000000;
    const gasPriceBid = 20000000000;
    const cost = maxSubmissionCost.add("0x470de4df820000");
    //return;

    //const tx = await bridge.callStatic.requestWithdrawMargin(
    await bridge.requestWithdrawMargin(
        lastTransferId,
        sourceToken,
        amount,
        maxSubmissionCost,
        maxGas,
        gasPriceBid,
        {value: cost },
    );
    //console.log(tx);
}

function wallet() {
    const ethereumProvider = new ethers.providers.JsonRpcProvider(ethereumUrl);
    const ethereumWallet = new ethers.Wallet(privateKey, ethereumProvider);
    const arbitrumProvider = new ethers.providers.JsonRpcProvider(arbitrumUrl);
    const arbitrumWallet = new ethers.Wallet(privateKey, arbitrumProvider);
    return [arbitrumWallet, ethereumWallet];
}

async function getLnBridgeOnL1InitData(wallet, dao, inbox) {
    const bridgeContract = await ethers.getContractFactory("Arb2EthTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, inbox],
        "initialize",
    );
    console.log("ln bridge on l1 init data:", initdata);
}

async function getLnBridgeOnL2InitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("Arb2EthSource", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao],
        "initialize",
    );
    console.log("ln bridge on l2 init data:", initdata);
}

async function deployLnTarget(wallet, dao, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Eth2ArbTarget", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln target bridge logic, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao],
        wallet);
    console.log("finish to deploy ln bridge proxy on L2, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deployLnSource(wallet, dao, inbox, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Eth2ArbSource", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln source bridge logic, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao, inbox],
        wallet);
    console.log("finish to deploy ln bridge proxy on ethereum, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deploy(arbitrumWallet, ethereumWallet) {
    const ethereumLnBridgeAddress = await deployLnSource(
        ethereumWallet,
        daoOnEthereum,
        inboxEthereumAddress,
        ethereumProxyAdmin
    );
    const arbitrumLnBridgeAddress = await deployLnTarget(
        arbitrumWallet,
        daoOnArbitrum,
        arbitrumProxyAdmin
    );

    const arbitrumLnBridge = await ethers.getContractAt("Eth2ArbTarget", arbitrumLnBridgeAddress, arbitrumWallet);
    const ethereumLnBridge = await ethers.getContractAt("Eth2ArbSource", ethereumLnBridgeAddress, ethereumWallet);
    await ethereumLnBridge.updateFeeReceiver(daoOnEthereum);
    await arbitrumLnBridge.setRemoteBridge(ethereumLnBridgeAddress);
    await ethereumLnBridge.setRemoteBridge(arbitrumLnBridgeAddress);

    // register special erc20 token
    // native token weth
    // we need replace this wring address by exist one
    const ringOnArbitrum = await ethers.getContractAt("Erc20", ringArbitrumAddress, arbitrumWallet);
    const ringOnEthereum = await ethers.getContractAt("Erc20", ringEthereumAddress, ethereumWallet);

    // register token
    await ethereumLnBridge.setTokenInfo(
        ringEthereumAddress,
        ringArbitrumAddress,
        // helix fee
        ethers.utils.parseEther("1.5"),
        // penaltyLnCollateral
        ethers.utils.parseEther("20"),
        18, // local decimals
        18, // remote decimals
    );

    // register provider
    await ethereumLnBridge.setProviderFee(
        ringEthereumAddress,
        ethers.utils.parseEther("2.5"),
        10,
    );
    await ringOnArbitrum.approve(arbitrumLnBridge.address, ethers.utils.parseEther("10000000"));
    await arbitrumLnBridge.depositProviderMargin(
        ringArbitrumAddress,
        ethers.utils.parseEther("1000"),
    );
    return {
        "LnBridgeOnArbitrum": arbitrumLnBridgeAddress,
        "LnBridgeOnEthereum": ethereumLnBridgeAddress,
    };
}

// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const arbitrumWallet = wallets[0];
    const ethereumWallet = wallets[1];

    //await getLnBridgeTargetInitData(arbitrumWallet, "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4", "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f");
    //await getLnBridgeSourceInitData(arbitrumWallet, "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4");
    //return;

    /*
    const deployed = await deploy(arbitrumWallet, ethereumWallet);
    console.log(deployed);
    return;
    */
    
    const ethereumLnBridgeAddress = "0x1Ff5D8Ab92D617F1e341664938f2381B42e741F8";
    const arbitrumLnBridgeAddress = "0xD3D83F3Eb3b6cE80d8d5A684e737080C2664Ec65";

    // update margin and fee
    /*
    const arbitrumLnBridge = await ethers.getContractAt("Arb2EthSource", arbitrumLnBridgeAddress, arbitrumWallet);
    await arbitrumLnBridge.updateProviderFeeAndMargin(
        ringArbitrumAddress,
        ethers.utils.parseEther("500"),
        ethers.utils.parseEther("10"),
        100 // liquidityFee
    );
    return;
    */

    const ringOnArbitrum = await ethers.getContractAt("Erc20", ringArbitrumAddress, arbitrumWallet);
    //await ringOnArbitrum.approve(arbitrumLnBridgeAddress, ethers.utils.parseEther("10000000"));
    const ringOnEthereum = await ethers.getContractAt("Erc20", ringEthereumAddress, ethereumWallet);
    //await ringOnEthereum.approve(ethereumLnBridgeAddress, ethers.utils.parseEther("10000000"));

    const amount1 = ethers.utils.parseEther("20");
    
    // lock
    /*
    await transferAndLockMargin(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        ringEthereumAddress,
        amount1,
        ethereumWallet.address,
        0,
    );
    console.log("transfer and lock margin 1 successed");
    return;
    */

    // relay
    // query: lastTransferId on arbitrum
    const lastTransferId = "0xE577B65C3DB8F2B536816F3282ADB0EA22EA293BFCC3B86698A59DF51A77F57E";
    const timestamp = 1689688188;
    const expectedTransferId = "0x22B45B572D3191B56020786ED4444E5697E2263F5C09962489BDD3300BDB3B65";

    /*
    await relay(
        arbitrumWallet,
        arbitrumLnBridgeAddress,
        arbitrumWallet.address,
        ringEthereumAddress,
        ringArbitrumAddress,
        lastTransferId,
        timestamp,
        arbitrumWallet.address,
        amount1,
        expectedTransferId,
    )
    console.log("relay 1 successed");
    return;
    */
    
    // slasher
    await slash(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        ringEthereumAddress,
        ringArbitrumAddress,
        lastTransferId,
        timestamp,
        arbitrumWallet.address,
        amount1,
        expectedTransferId,
    );
    console.log("slash successed");
    return;
    
    // withdraw
    
    await requestWithdrawMargin(
        ethereumWallet,
        ethereumLnBridgeAddress,
        "0xDD5703D47E4494FFC87660F3CBF2AFBA7A137755A91C81DC7ED120BB18E33A83", //lastTransferId
        ringArbitrumAddress,
        ethers.utils.parseEther("3"), // amount
    );
    
    console.log("withdraw successed");
    
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
/*
ethereumLnBridgeAddressLogic = 0xa05f9e8A5fe34C3A37a4cBD2700EFb06Bb0Eea04
ethereumLnBridgeAddressProxy = 0x1Ff5D8Ab92D617F1e341664938f2381B42e741F8
arbitrumLnBridgeAddressLogic = 0x91f14687bc135938e165B3672D8D74D59Dd21DE1
arbitrumLnBridgeAddressProxy = 0xD3D83F3Eb3b6cE80d8d5A684e737080C2664Ec65
*/

