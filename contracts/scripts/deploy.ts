import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  console.log("\n🏥 Deploying MediVaultRegistry to 0G Mainnet...");
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
  const registry = await MediVaultRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();

  console.log("\n✅ MediVaultRegistry deployed!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📋 Contract address : ${address}`);
  console.log(`🔍 Explorer        : https://chainscan.0g.ai/address/${address}`);
  console.log(`🌐 Network         : 0G Mainnet (chain 16661)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n📝 Next steps:");
  console.log(`   1. Copy contract address: ${address}`);
  console.log("   2. Add to .env.local: NEXT_PUBLIC_MEDIVAULT_REGISTRY=${address}");
  console.log("   3. Update README with the contract address");
  console.log("   4. Verify on chainscan.0g.ai");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
