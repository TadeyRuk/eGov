// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Tamper-evident eGovPay proof with explicit citizen/business disclosure modes.
/// @dev Individual payments keep identifying and financial details off-chain and encrypted.
contract TolvarisPaymentProofRegistry {
    enum PartyType { INDIVIDUAL, BUSINESS }

    struct PaymentProof {
        bytes32 proofId;
        PartyType partyType;
        bytes32 partyCommitment;
        bytes32 transactionCommitment;
        bytes32 detailDigest;
        string publicBusinessName;
        string publicReference;
        uint256 publicAmountCentavos;
        string publicCurrency;
        string status;
        uint64 recordedAt;
    }

    struct StatusChange {
        string status;
        bytes32 providerResponseDigest;
        uint64 recordedAt;
    }

    address public immutable registrar;
    mapping(bytes32 proofId => PaymentProof) private proofs;
    mapping(bytes32 proofId => StatusChange[]) private history;

    error RegistrarOnly();
    error InvalidRecord();
    error DuplicateProof(bytes32 proofId);
    error ProofNotFound(bytes32 proofId);
    error IndividualDataMustRemainPrivate();

    constructor() { registrar = msg.sender; }
    modifier onlyRegistrar() { if (msg.sender != registrar) revert RegistrarOnly(); _; }

    function publishProof(PaymentProof calldata proof) external onlyRegistrar {
        if (proof.proofId == bytes32(0) || proof.partyCommitment == bytes32(0) || proof.transactionCommitment == bytes32(0) || proof.detailDigest == bytes32(0) || bytes(proof.status).length == 0) revert InvalidRecord();
        if (proofs[proof.proofId].recordedAt != 0) revert DuplicateProof(proof.proofId);
        if (proof.partyType == PartyType.INDIVIDUAL && (bytes(proof.publicBusinessName).length != 0 || bytes(proof.publicReference).length != 0 || proof.publicAmountCentavos != 0 || bytes(proof.publicCurrency).length != 0)) revert IndividualDataMustRemainPrivate();
        proofs[proof.proofId] = proof;
        proofs[proof.proofId].recordedAt = uint64(block.timestamp);
        history[proof.proofId].push(StatusChange(proof.status, proof.detailDigest, uint64(block.timestamp)));
    }

    function appendStatus(bytes32 proofId, string calldata status, bytes32 providerResponseDigest) external onlyRegistrar {
        if (proofs[proofId].recordedAt == 0) revert ProofNotFound(proofId);
        if (bytes(status).length == 0 || providerResponseDigest == bytes32(0)) revert InvalidRecord();
        proofs[proofId].status = status;
        history[proofId].push(StatusChange(status, providerResponseDigest, uint64(block.timestamp)));
    }

    function getProof(bytes32 proofId) external view returns (PaymentProof memory) { return proofs[proofId]; }
    function getHistory(bytes32 proofId) external view returns (StatusChange[] memory) { return history[proofId]; }
}
