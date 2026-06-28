// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─────────────────────────────────────────────────────────────────────────────
//  INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @title IAgentOracle
 * @notice Minimal verification oracle for ERC-7857 proof validation.
 *         Production: TEE relay (e.g. Intel SGX attestation service) or ZKP verifier.
 *         Demo / testnet: address(0) = oracle bypass (always valid).
 */
interface IAgentOracle {
    function verifyProof(
        uint256 tokenId,
        bytes32 oldDataHash,
        bytes32 newDataHash,
        bytes calldata proof
    ) external view returns (bool);
}

/**
 * @title IERC7857
 * @notice 0G Labs ERC-7857 — Intelligent NFT standard for AI agents with
 *         private encrypted metadata. Adapted from the official 0G spec:
 *         https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857
 *
 *         Key concepts:
 *         - dataHash   : Hash of encrypted metadata stored on 0G Storage.
 *         - sealedKey  : AES/ECIES encryption key sealed to the owner's pubkey.
 *         - oracle     : TEE relay or ZKP verifier that approves re-encryption.
 *         - authorizeUsage : Grant a third-party executor (e.g. doctor) access
 *                           without transferring ownership.
 */
interface IERC7857 {
    // ── Events ────────────────────────────────────────────────────────────────

    event AgentMinted(
        uint256 indexed tokenId,
        bytes32 dataHash,
        address oracle
    );

    event AgentMetadataUpdated(
        uint256 indexed tokenId,
        bytes32 oldDataHash,
        bytes32 newDataHash
    );

    event UsageAuthorized(
        uint256 indexed tokenId,
        address indexed executor,
        bytes permissions
    );

    event UsageRevoked(
        uint256 indexed tokenId,
        address indexed executor
    );

    event AgentCloned(
        uint256 indexed originalTokenId,
        uint256 indexed newTokenId,
        address indexed newOwner
    );

    // ── State struct ──────────────────────────────────────────────────────────

    struct AgentData {
        bytes32 dataHash;   // Keccak256 hash of encrypted metadata on 0G Storage
        bytes   sealedKey;  // Encryption key sealed to owner's public key (ECIES)
        address oracle;     // Oracle for proof verification (address(0) = bypass)
    }

    // ── Core ERC-7857 functions ───────────────────────────────────────────────

    /**
     * @notice Transfer token with metadata re-encryption proof.
     *         Oracle verifies that metadata was correctly re-encrypted for new owner.
     */
    function transfer(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata newSealedKey,
        bytes calldata proof
    ) external;

    /**
     * @notice Clone a vault to a new address with re-encrypted metadata.
     *         Useful for wallet migration or backup vault creation.
     */
    function clone(
        address to,
        uint256 tokenId,
        bytes calldata newSealedKey,
        bytes calldata proof
    ) external returns (uint256 newTokenId);

    /**
     * @notice Authorize a third-party executor to use vault capabilities.
     *         In MediVault: grant a doctor wallet access to read encrypted records.
     *         The executor receives a sealed key specific to their public key.
     * @param tokenId     Vault token ID.
     * @param executor    Address to authorize (e.g. doctor's wallet).
     * @param permissions Encoded permissions + sealed key for the executor.
     */
    function authorizeUsage(
        uint256 tokenId,
        address executor,
        bytes calldata permissions
    ) external;

    /**
     * @notice Revoke a previously authorized executor.
     */
    function revokeUsage(uint256 tokenId, address executor) external;

    /**
     * @notice Get the ERC-7857 agent data for a token.
     */
    function getAgentData(uint256 tokenId) external view returns (AgentData memory);

    /**
     * @notice Check whether an executor is authorized for a token.
     */
    function isAuthorized(uint256 tokenId, address executor) external view returns (bool);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN CONTRACT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @title MediVaultRegistry
 * @author MediVault — 0G Zero Cup 2026
 * @notice On-chain registry for self-sovereign health vaults.
 *
 *         Each token is an Intelligent NFT (iNFT) per ERC-7857:
 *         - Holds the owner's AES-256 vault key sealed to their wallet pubkey.
 *         - Anchors the encrypted health record Merkle root on 0G Mainnet.
 *         - Supports oracle-verified metadata re-encryption (TEE / ZKP).
 *         - Lets patients authorize doctors without transferring ownership.
 *
 *         Deployed on 0G Mainnet (chain 16661).
 *         Contract: 0x47b0E8247d3c176E567C3B48743596f87171403e
 */
contract MediVaultRegistry is ERC721, Ownable, ReentrancyGuard, IERC7857 {

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 private _tokenIdCounter;

    /// @dev Core health vault metadata (original MediVaultRegistry fields)
    struct VaultInfo {
        bytes32 rootHash;    // Merkle root of all 0G Storage record hashes
        uint256 recordCount; // Number of documents stored
        uint256 createdAt;   // Unix timestamp of vault creation
        uint256 updatedAt;   // Unix timestamp of last root hash update
        bool    active;      // Vault is active
    }

    /// tokenId => VaultInfo
    mapping(uint256 => VaultInfo) private _vaults;

    /// wallet => tokenId  (one vault per wallet)
    mapping(address => uint256) private _walletToToken;

    // ── ERC-7857 state ────────────────────────────────────────────────────────

    /// tokenId => AgentData (ERC-7857 iNFT metadata)
    mapping(uint256 => AgentData) private _agentData;

    /// tokenId => executor => encoded permissions (includes sealed key for executor)
    mapping(uint256 => mapping(address => bytes)) private _authorizations;

    /// Default oracle address. address(0) = bypass (demo mode).
    address public defaultOracle;

    // ─── Events (original) ────────────────────────────────────────────────────

    event VaultCreated(
        address indexed owner,
        uint256 indexed tokenId,
        bytes32 rootHash,
        bytes32 dataHash,
        uint256 timestamp
    );

    event VaultUpdated(
        address indexed owner,
        uint256 indexed tokenId,
        bytes32 oldRootHash,
        bytes32 newRootHash,
        uint256 recordCount,
        uint256 timestamp
    );

    event VaultDeactivated(
        address indexed owner,
        uint256 indexed tokenId,
        uint256 timestamp
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error VaultAlreadyExists(address wallet);
    error VaultDoesNotExist(address wallet);
    error NotVaultOwner(address caller, uint256 tokenId);
    error VaultNotActive(uint256 tokenId);
    error InvalidRootHash();
    error InvalidDataHash();
    error InvalidProof();
    error NotAuthorized(address executor, uint256 tokenId);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _defaultOracle Oracle for ERC-7857 proof verification.
     *                        Pass address(0) for demo / bypass mode.
     */
    constructor(address _defaultOracle)
        ERC721("MediVault Identity", "MEDIV")
        Ownable(msg.sender)
    {
        defaultOracle = _defaultOracle;
    }

    // ─── Primary: create vault (ERC-7857 mint) ────────────────────────────────

    /**
     * @notice Mint a Vault Identity iNFT for the caller.
     *         One NFT per wallet. Combines original vault creation with ERC-7857
     *         encrypted metadata anchoring.
     *
     * @param rootHash   Merkle root of the caller's encrypted 0G Storage records.
     * @param dataHash   Hash of encrypted metadata blob stored on 0G Storage
     *                   (e.g. keccak256 of the AES-256 ciphertext).
     * @param sealedKey  The vault's AES-256 key sealed to the owner's ECIES pubkey.
     *                   Stored on-chain so the owner can always recover their key.
     * @param oracle     Oracle address for this vault. address(0) = use defaultOracle.
     * @return tokenId   The newly minted iNFT token ID.
     */
    function createVault(
        bytes32 rootHash,
        bytes32 dataHash,
        bytes calldata sealedKey,
        address oracle
    ) external nonReentrant returns (uint256) {
        if (_walletToToken[msg.sender] != 0) revert VaultAlreadyExists(msg.sender);
        if (rootHash == bytes32(0)) revert InvalidRootHash();
        if (dataHash == bytes32(0)) revert InvalidDataHash();

        _tokenIdCounter += 1;
        uint256 tokenId = _tokenIdCounter;

        _safeMint(msg.sender, tokenId);

        // Original vault state
        _vaults[tokenId] = VaultInfo({
            rootHash:    rootHash,
            recordCount: 1,
            createdAt:   block.timestamp,
            updatedAt:   block.timestamp,
            active:      true
        });

        // ERC-7857 agent data
        address resolvedOracle = oracle != address(0) ? oracle : defaultOracle;
        _agentData[tokenId] = AgentData({
            dataHash:  dataHash,
            sealedKey: sealedKey,
            oracle:    resolvedOracle
        });

        _walletToToken[msg.sender] = tokenId;

        emit VaultCreated(msg.sender, tokenId, rootHash, dataHash, block.timestamp);
        emit AgentMinted(tokenId, dataHash, resolvedOracle);

        return tokenId;
    }

    /**
     * @notice Legacy createVault (backward compatible — no ERC-7857 fields).
     *         Kept so existing frontend integrations continue to work.
     */
    function createVault(bytes32 rootHash) external nonReentrant returns (uint256) {
        if (_walletToToken[msg.sender] != 0) revert VaultAlreadyExists(msg.sender);
        if (rootHash == bytes32(0)) revert InvalidRootHash();

        _tokenIdCounter += 1;
        uint256 tokenId = _tokenIdCounter;

        _safeMint(msg.sender, tokenId);

        _vaults[tokenId] = VaultInfo({
            rootHash:    rootHash,
            recordCount: 1,
            createdAt:   block.timestamp,
            updatedAt:   block.timestamp,
            active:      true
        });

        // ERC-7857: dataHash defaults to rootHash; no sealed key in legacy mode
        _agentData[tokenId] = AgentData({
            dataHash:  rootHash,
            sealedKey: "",
            oracle:    defaultOracle
        });

        _walletToToken[msg.sender] = tokenId;

        emit VaultCreated(msg.sender, tokenId, rootHash, rootHash, block.timestamp);
        emit AgentMinted(tokenId, rootHash, defaultOracle);

        return tokenId;
    }

    // ─── ERC-7857: transfer (oracle-verified re-encryption) ───────────────────

    /**
     * @notice ERC-7857 compliant transfer with metadata re-encryption proof.
     *         Requires an oracle proof that the metadata was correctly re-encrypted
     *         for the new owner before transferring the iNFT.
     *
     *         MediVault healthcare note: This allows a patient to migrate their
     *         vault to a new wallet address while keeping records intact —
     *         the oracle verifies the re-encrypted sealed key is valid.
     */
    function transfer(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata newSealedKey,
        bytes calldata proof
    ) external override nonReentrant {
        require(ownerOf(tokenId) == from, "MediVault: not token owner");
        require(to != address(0), "MediVault: invalid recipient");
        require(msg.sender == from || isApprovedForAll(from, msg.sender), "MediVault: not approved");

        AgentData storage agent = _agentData[tokenId];

        // Verify oracle proof (skip if oracle is address(0) — demo/bypass mode)
        if (agent.oracle != address(0)) {
            bytes32 oldDataHash = agent.dataHash;
            bytes32 newDataHash = keccak256(newSealedKey);
            bool valid = IAgentOracle(agent.oracle).verifyProof(
                tokenId, oldDataHash, newDataHash, proof
            );
            if (!valid) revert InvalidProof();
            agent.dataHash = newDataHash;
        }

        // Update sealed key for new owner
        agent.sealedKey = newSealedKey;

        // Update wallet mapping
        delete _walletToToken[from];
        _walletToToken[to] = tokenId;

        // Allow this one transfer by temporarily using safeTransferFrom directly
        _transfer(from, to, tokenId);

        bytes32 newDataHash = keccak256(newSealedKey);
        emit AgentMetadataUpdated(tokenId, agent.dataHash, newDataHash);
    }

    // ─── ERC-7857: clone ──────────────────────────────────────────────────────

    /**
     * @notice Clone a vault to a new wallet with re-encrypted metadata.
     *         The clone gets a new token ID; the original stays with the owner.
     *         Useful for: backup wallet, family member emergency access vault.
     *
     *         Oracle verifies the cloned sealed key is correctly re-encrypted.
     */
    function clone(
        address to,
        uint256 tokenId,
        bytes calldata newSealedKey,
        bytes calldata proof
    ) external override nonReentrant returns (uint256 newTokenId) {
        require(ownerOf(tokenId) == msg.sender, "MediVault: not token owner");
        require(to != address(0), "MediVault: invalid recipient");
        require(_walletToToken[to] == 0, "MediVault: recipient already has vault");

        AgentData storage agent = _agentData[tokenId];

        // Verify oracle proof if oracle is set
        if (agent.oracle != address(0)) {
            bytes32 oldDataHash = agent.dataHash;
            bytes32 newDataHash = keccak256(newSealedKey);
            bool valid = IAgentOracle(agent.oracle).verifyProof(
                tokenId, oldDataHash, newDataHash, proof
            );
            if (!valid) revert InvalidProof();
        }

        // Mint new token for recipient
        _tokenIdCounter += 1;
        newTokenId = _tokenIdCounter;
        _safeMint(to, newTokenId);

        // Copy vault state
        VaultInfo memory original = _vaults[tokenId];
        _vaults[newTokenId] = VaultInfo({
            rootHash:    original.rootHash,
            recordCount: original.recordCount,
            createdAt:   block.timestamp,
            updatedAt:   block.timestamp,
            active:      true
        });

        // ERC-7857 agent data for clone (re-encrypted for new owner)
        _agentData[newTokenId] = AgentData({
            dataHash:  keccak256(newSealedKey),
            sealedKey: newSealedKey,
            oracle:    agent.oracle
        });

        _walletToToken[to] = newTokenId;

        emit AgentCloned(tokenId, newTokenId, to);
        return newTokenId;
    }

    // ─── ERC-7857: authorizeUsage ─────────────────────────────────────────────

    /**
     * @notice Authorize a doctor (or any executor) to access vault capabilities.
     *
     *         In MediVault:
     *         - The patient calls this to grant a doctor's wallet read access.
     *         - `permissions` encodes the AES key sealed to the doctor's ECIES pubkey
     *           plus an optional expiry timestamp and record scope.
     *         - The doctor can then call `getExecutorPermissions(tokenId, doctorAddress)`
     *           to retrieve the sealed key and decrypt only the shared records.
     *         - No ownership transfer — the patient's iNFT stays in their wallet.
     *
     * @param tokenId     The patient's vault token ID.
     * @param executor    Doctor's wallet address.
     * @param permissions ABI-encoded: (bytes sealedKeyForExecutor, uint256 expiry, bytes32[] recordScope)
     */
    function authorizeUsage(
        uint256 tokenId,
        address executor,
        bytes calldata permissions
    ) external override {
        require(ownerOf(tokenId) == msg.sender, "MediVault: not token owner");
        require(executor != address(0), "MediVault: invalid executor");

        _authorizations[tokenId][executor] = permissions;

        emit UsageAuthorized(tokenId, executor, permissions);
    }

    /**
     * @notice Revoke a doctor's access to this vault.
     */
    function revokeUsage(uint256 tokenId, address executor) external override {
        require(ownerOf(tokenId) == msg.sender, "MediVault: not token owner");

        delete _authorizations[tokenId][executor];

        emit UsageRevoked(tokenId, executor);
    }

    // ─── ERC-7857: views ──────────────────────────────────────────────────────

    /**
     * @notice Get ERC-7857 agent data for a token.
     */
    function getAgentData(uint256 tokenId)
        external view override
        returns (AgentData memory)
    {
        return _agentData[tokenId];
    }

    /**
     * @notice Check whether an executor is authorized for a token.
     */
    function isAuthorized(uint256 tokenId, address executor)
        external view override
        returns (bool)
    {
        return _authorizations[tokenId][executor].length > 0;
    }

    /**
     * @notice Get the encoded permissions for an executor (e.g. doctor).
     *         The executor decodes this to retrieve their sealed key.
     */
    function getExecutorPermissions(uint256 tokenId, address executor)
        external view
        returns (bytes memory)
    {
        return _authorizations[tokenId][executor];
    }

    // ─── Original vault functions ─────────────────────────────────────────────

    /**
     * @notice Update the vault root hash after adding / removing a record.
     *         Also updates the ERC-7857 dataHash to match.
     */
    function updateVaultRoot(
        bytes32 rootHash,
        uint256 recordCount
    ) external {
        uint256 tokenId = _getTokenId(msg.sender);
        if (rootHash == bytes32(0)) revert InvalidRootHash();

        VaultInfo storage vault = _vaults[tokenId];
        if (!vault.active) revert VaultNotActive(tokenId);

        bytes32 oldRootHash = vault.rootHash;
        vault.rootHash    = rootHash;
        vault.recordCount = recordCount;
        vault.updatedAt   = block.timestamp;

        // Keep ERC-7857 dataHash in sync with rootHash
        bytes32 oldDataHash = _agentData[tokenId].dataHash;
        _agentData[tokenId].dataHash = rootHash;

        emit VaultUpdated(msg.sender, tokenId, oldRootHash, rootHash, recordCount, block.timestamp);
        emit AgentMetadataUpdated(tokenId, oldDataHash, rootHash);
    }

    /**
     * @notice Update ERC-7857 metadata separately from root hash
     *         (e.g. when the sealedKey rotation happens via TEE).
     */
    function updateAgentMetadata(
        bytes32 newDataHash,
        bytes calldata newSealedKey,
        bytes calldata proof
    ) external {
        uint256 tokenId = _getTokenId(msg.sender);
        if (newDataHash == bytes32(0)) revert InvalidDataHash();

        AgentData storage agent = _agentData[tokenId];

        // Verify oracle proof if oracle is set
        if (agent.oracle != address(0)) {
            bool valid = IAgentOracle(agent.oracle).verifyProof(
                tokenId, agent.dataHash, newDataHash, proof
            );
            if (!valid) revert InvalidProof();
        }

        bytes32 oldDataHash = agent.dataHash;
        agent.dataHash  = newDataHash;
        agent.sealedKey = newSealedKey;

        emit AgentMetadataUpdated(tokenId, oldDataHash, newDataHash);
    }

    /**
     * @notice Deactivate (soft-delete) your vault. The iNFT stays in your wallet.
     */
    function deactivateVault() external {
        uint256 tokenId = _getTokenId(msg.sender);
        VaultInfo storage vault = _vaults[tokenId];
        if (!vault.active) revert VaultNotActive(tokenId);

        vault.active    = false;
        vault.updatedAt = block.timestamp;

        emit VaultDeactivated(msg.sender, tokenId, block.timestamp);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /**
     * @notice Update the default oracle address.
     */
    function setDefaultOracle(address _oracle) external onlyOwner {
        defaultOracle = _oracle;
    }

    // ─── View functions ───────────────────────────────────────────────────────

    function getVaultByAddress(address wallet)
        external view
        returns (
            uint256 tokenId,
            bytes32 rootHash,
            uint256 recordCount,
            uint256 createdAt,
            uint256 updatedAt,
            bool    active
        )
    {
        tokenId = _walletToToken[wallet];
        if (tokenId == 0) revert VaultDoesNotExist(wallet);
        VaultInfo memory v = _vaults[tokenId];
        return (tokenId, v.rootHash, v.recordCount, v.createdAt, v.updatedAt, v.active);
    }

    function getVaultById(uint256 tokenId)
        external view
        returns (
            bytes32 rootHash,
            uint256 recordCount,
            uint256 createdAt,
            uint256 updatedAt,
            bool    active
        )
    {
        VaultInfo memory v = _vaults[tokenId];
        return (v.rootHash, v.recordCount, v.createdAt, v.updatedAt, v.active);
    }

    function hasActiveVault(address wallet) external view returns (bool) {
        uint256 tokenId = _walletToToken[wallet];
        if (tokenId == 0) return false;
        return _vaults[tokenId].active;
    }

    function getRootHash(address wallet) external view returns (bytes32) {
        uint256 tokenId = _walletToToken[wallet];
        if (tokenId == 0) revert VaultDoesNotExist(wallet);
        return _vaults[tokenId].rootHash;
    }

    function totalVaults() external view returns (uint256) {
        return _tokenIdCounter;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _getTokenId(address wallet) internal view returns (uint256) {
        uint256 tokenId = _walletToToken[wallet];
        if (tokenId == 0) revert VaultDoesNotExist(wallet);
        return tokenId;
    }

    /**
     * @dev Block all standard ERC-721 transfers.
     *      Soul-bound: vault identity stays with the original wallet.
     *      The only valid transfer path is via ERC-7857 `transfer()` with oracle proof.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) {
            // Block transfers that don't go through ERC-7857 transfer()
            // (Checked by whether _walletToToken has been pre-updated)
            if (_walletToToken[to] == tokenId || to == address(0)) {
                // Allowed: ERC-7857 transfer() pre-updated the mapping, or burn
            } else {
                revert("MediVault: use ERC-7857 transfer() with oracle proof");
            }
        }
        return super._update(to, tokenId, auth);
    }
}
