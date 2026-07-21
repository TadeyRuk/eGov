// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Integrity and provenance proofs for OCR-normalized government documents.
/// @dev Raw scans, extracted text, TINs, names, addresses, and individual tax details stay encrypted off-chain.
contract TolvarisDocumentProofRegistry {
    enum Visibility { PRIVATE_INDIVIDUAL, POLICY_GATED_BUSINESS, PUBLIC_GOVERNMENT }

    struct DocumentProof {
        bytes32 documentId;
        bytes32 contentDigest;
        bytes32 subjectCommitment;
        bytes32 normalizedPayloadDigest;
        string schemaVersion;
        string documentType;
        string issuerAgencyCode;
        uint32 fiscalYear;
        Visibility visibility;
        string publicTitle;
        string publicSourceUrl;
        uint64 recordedAt;
    }

    address public immutable registrar;
    mapping(bytes32 documentId => DocumentProof) private proofs;

    error RegistrarOnly();
    error InvalidRecord();
    error DuplicateProof(bytes32 documentId);
    error PrivateMetadataMustRemainPrivate();

    constructor() { registrar = msg.sender; }
    modifier onlyRegistrar() { if (msg.sender != registrar) revert RegistrarOnly(); _; }

    function publishProof(DocumentProof calldata proof) external onlyRegistrar {
        if (proof.documentId == bytes32(0) || proof.contentDigest == bytes32(0) || proof.normalizedPayloadDigest == bytes32(0) || bytes(proof.schemaVersion).length == 0 || bytes(proof.documentType).length == 0 || bytes(proof.issuerAgencyCode).length == 0) revert InvalidRecord();
        if (proofs[proof.documentId].recordedAt != 0) revert DuplicateProof(proof.documentId);
        if (proof.visibility != Visibility.PUBLIC_GOVERNMENT && (bytes(proof.publicTitle).length != 0 || bytes(proof.publicSourceUrl).length != 0)) revert PrivateMetadataMustRemainPrivate();
        proofs[proof.documentId] = proof;
        proofs[proof.documentId].recordedAt = uint64(block.timestamp);
    }

    function getProof(bytes32 documentId) external view returns (DocumentProof memory) { return proofs[documentId]; }
}
