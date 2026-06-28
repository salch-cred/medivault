// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MediVaultRegistry
 * @author MediVault — 0G Zero Cup 2026
 * @notice On-chain registry for self-sovereign health vaults.
 *         Each NFT (token) represents one patient's permanent vault identity.
 *         The vault root hash is a Merkle root of all their encrypted 0G Storage records.
 *         Built on 0G Mainnet (chain 16661).
 */
contract MediVaultRegistry is ERC721, Ownable {
    // ─── State ───────────────────────────────────────────────────────────────

    uint256 private _tokenIdCounter;

    struct VaultInfo {
        bytes32 rootHash;       // Merkle root of all 0G Storage record hashes
        uint256 recordCount;    // Number of documents stored
        uint256 createdAt;      // Unix timestamp of vault creation
        uint256 updatedAt;      // Unix timestamp of last root hash update
        bool active;            // Vault is active
    }

    // tokenId => VaultInfo
    mapping(uint256 => VaultInfo) private _vaults;

    // wallet address => tokenId (one vault NFT per wallet)
    mapping(address => uint256) private _walletToToken;

    // ─── Events ──────────────────────────────────────────────────────────────

    event VaultCreated(
        address indexed owner,
        uint256 indexed tokenId,
        bytes32 rootHash,
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

    // ─── Errors ──────────────────────────────────────────────────────────────

    error VaultAlreadyExists(address wallet);
    error VaultDoesNotExist(address wallet);
    error NotVaultOwner(address caller, uint256 tokenId);
    error VaultNotActive(uint256 tokenId);
    error InvalidRootHash();

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() ERC721("MediVault Identity", "MEDIV") Ownable(msg.sender) {}

    // ─── External functions ───────────────────────────────────────────────────

    /**
     * @notice Mint a Vault Identity NFT for the caller.
     *         One NFT per wallet address. Represents on-chain proof of vault activation.
     * @param rootHash  Merkle root of the caller's encrypted 0G Storage record set.
     * @return tokenId  The newly minted token ID.
     */
    function createVault(bytes32 rootHash) external returns (uint256) {
        if (_walletToToken[msg.sender] != 0) {
            revert VaultAlreadyExists(msg.sender);
        }
        if (rootHash == bytes32(0)) revert InvalidRootHash();

        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;

        _safeMint(msg.sender, tokenId);

        _vaults[tokenId] = VaultInfo({
            rootHash: rootHash,
            recordCount: 1,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            active: true
        });

        _walletToToken[msg.sender] = tokenId;

        emit VaultCreated(msg.sender, tokenId, rootHash, block.timestamp);
        return tokenId;
    }

    /**
     * @notice Update the vault root hash after adding / removing a record.
     * @param rootHash     New Merkle root of all encrypted records on 0G Storage.
     * @param recordCount  Total number of records in the vault after this update.
     */
    function updateVaultRoot(bytes32 rootHash, uint256 recordCount) external {
        uint256 tokenId = _getTokenId(msg.sender);
        if (rootHash == bytes32(0)) revert InvalidRootHash();

        VaultInfo storage vault = _vaults[tokenId];
        if (!vault.active) revert VaultNotActive(tokenId);

        bytes32 oldRootHash = vault.rootHash;
        vault.rootHash = rootHash;
        vault.recordCount = recordCount;
        vault.updatedAt = block.timestamp;

        emit VaultUpdated(
            msg.sender,
            tokenId,
            oldRootHash,
            rootHash,
            recordCount,
            block.timestamp
        );
    }

    /**
     * @notice Deactivate (soft-delete) your vault. The NFT stays in your wallet.
     */
    function deactivateVault() external {
        uint256 tokenId = _getTokenId(msg.sender);
        VaultInfo storage vault = _vaults[tokenId];
        if (!vault.active) revert VaultNotActive(tokenId);

        vault.active = false;
        vault.updatedAt = block.timestamp;

        emit VaultDeactivated(msg.sender, tokenId, block.timestamp);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    /**
     * @notice Get full vault info for a wallet address.
     */
    function getVaultByAddress(address wallet)
        external
        view
        returns (
            uint256 tokenId,
            bytes32 rootHash,
            uint256 recordCount,
            uint256 createdAt,
            uint256 updatedAt,
            bool active
        )
    {
        tokenId = _walletToToken[wallet];
        if (tokenId == 0) revert VaultDoesNotExist(wallet);
        VaultInfo memory v = _vaults[tokenId];
        return (tokenId, v.rootHash, v.recordCount, v.createdAt, v.updatedAt, v.active);
    }

    /**
     * @notice Get vault info by token ID.
     */
    function getVaultById(uint256 tokenId)
        external
        view
        returns (
            bytes32 rootHash,
            uint256 recordCount,
            uint256 createdAt,
            uint256 updatedAt,
            bool active
        )
    {
        VaultInfo memory v = _vaults[tokenId];
        return (v.rootHash, v.recordCount, v.createdAt, v.updatedAt, v.active);
    }

    /**
     * @notice Check if a wallet has an active vault.
     */
    function hasActiveVault(address wallet) external view returns (bool) {
        uint256 tokenId = _walletToToken[wallet];
        if (tokenId == 0) return false;
        return _vaults[tokenId].active;
    }

    /**
     * @notice Get the current root hash for a wallet.
     */
    function getRootHash(address wallet) external view returns (bytes32) {
        uint256 tokenId = _walletToToken[wallet];
        if (tokenId == 0) revert VaultDoesNotExist(wallet);
        return _vaults[tokenId].rootHash;
    }

    /**
     * @notice Total number of vaults ever created.
     */
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
     * @dev Block transfers — vault identity is soul-bound to the original wallet.
     *      The NFT stays as proof but cannot be traded.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // Allow minting (from == address(0)), block all transfers
        if (from != address(0)) {
            revert("MediVault: vault identity is non-transferable");
        }
        return super._update(to, tokenId, auth);
    }
}
