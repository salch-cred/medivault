import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // 0G Mainnet
    zg_mainnet: {
      url: "https://evmrpc.0g.ai",
      chainId: 16661,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: "auto",
    },
    // 0G Galileo Testnet (for testing)
    zg_testnet: {
      url: "https://evmrpc-testnet.0g.ai",
      chainId: 16602,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: "auto",
    },
  },
  paths: {
    sources: "./",          // contracts are in /contracts/
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
