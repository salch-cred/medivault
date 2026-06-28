import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  console.log("\n🏥 Deploying MediVaultRegistry (ERC-7857 iNFT) to 0G Mainnet...");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const [deployer] = await ethers.getSigners();
  console.log(`📬 Deployer address : ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Deployer balance : ${ethers.formatEther(balance)} OG`);

  if (balance === 0n) {
    console.error("\n❌ No balance! Get OG tokens from https://faucet.0g.ai");
    process.exit(1);
  }

  console.log("\n⏳ Deploying contract...");
  const MediVaultRegistry = await ethers.getContractFactory("MediVaultRegistry");

  // Pass ethers.ZeroAddress as _defaultOracle for oracle-bypass (demo) mode.
  // To use a real TEE/ZKP oracle, replace with the oracle contract address.
  const registry = await MediVaultRegistry.deploy(ethers.ZeroAddress);
  await registry.waitForDeployment();

  const address = await registry.getAddress();

  console.log("\n✅ MediVaultRegistry (ERC-7857) deployed!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📋 Contract address : ${address}`);
  console.log(`🔍 Explorer        : https://chainscan.0g.ai/address/${address}`);
  console.log(`🌐 Network         : 0G Mainnet (chain 16661)`);
  console.log(`🤖 Standard        : ERC-7857 Agentic iNFT`);
  console.log(`🔮 Oracle           : address(0) — bypass mode`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n📝 Next steps:");
  console.log(`   1. Copy contract address: ${address}`);
  console.log("   2. Update Vercel env: NEXT_PUBLIC_MEDIVAULT_REGISTRY=" + address);
  console.log("   3. Update README with the contract address");
  console.log("   4. Verify on chainscan.0g.ai");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
