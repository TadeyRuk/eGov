// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Privacy-preserving registry of card types owned by pseudonymous users.
/// @dev Names, eGov subject IDs, card numbers, and document contents must stay off-chain.
contract TolvarisCardRegistry {
    bytes32 public constant NAMESPACE = keccak256("TOLVARIS");

    struct CardRecord {
        string cardType;
        bytes32 cardFingerprint;
        uint64 anchoredAt;
    }

    address public immutable registrar;
    mapping(bytes32 ownerCommitment => CardRecord[]) private cardsByOwner;
    mapping(bytes32 recordKey => bool) private anchoredRecords;

    event CardAnchored(
        bytes32 indexed ownerCommitment,
        bytes32 indexed cardFingerprint,
        string cardType,
        uint64 anchoredAt
    );

    error RegistrarOnly();
    error InvalidOwnerCommitment();
    error InvalidCardType();
    error DuplicateCard();

    constructor() {
        registrar = msg.sender;
    }

    function anchorCard(
        bytes32 ownerCommitment,
        string calldata cardType,
        bytes32 cardFingerprint
    ) external {
        if (msg.sender != registrar) revert RegistrarOnly();
        if (ownerCommitment == bytes32(0)) revert InvalidOwnerCommitment();
        uint256 typeLength = bytes(cardType).length;
        if (typeLength == 0 || typeLength > 64) revert InvalidCardType();

        bytes32 recordKey = keccak256(
            abi.encode(ownerCommitment, cardType, cardFingerprint)
        );
        if (anchoredRecords[recordKey]) revert DuplicateCard();

        uint64 anchoredAt = uint64(block.timestamp);
        anchoredRecords[recordKey] = true;
        cardsByOwner[ownerCommitment].push(
            CardRecord(cardType, cardFingerprint, anchoredAt)
        );
        emit CardAnchored(
            ownerCommitment,
            cardFingerprint,
            cardType,
            anchoredAt
        );
    }

    function isAnchored(
        bytes32 ownerCommitment,
        string calldata cardType,
        bytes32 cardFingerprint
    ) external view returns (bool) {
        return anchoredRecords[
            keccak256(abi.encode(ownerCommitment, cardType, cardFingerprint))
        ];
    }

    function getCards(
        bytes32 ownerCommitment
    ) external view returns (CardRecord[] memory) {
        return cardsByOwner[ownerCommitment];
    }
}
