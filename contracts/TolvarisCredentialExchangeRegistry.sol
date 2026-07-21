// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Issuer attestations and consented access receipts for government credentials/documents.
/// @dev Credential values, images, biometrics, names, raw IDs, and decryptable vault pointers stay off-chain.
contract TolvarisCredentialExchangeRegistry {
    enum CredentialStatus { ACTIVE, REVOKED, EXPIRED }
    enum RequestStatus { PENDING, APPROVED, DENIED, RELEASED, EXPIRED }

    struct CredentialAttestation {
        bytes32 credentialKey;
        bytes32 holderCommitment;
        bytes32 credentialDigest;
        bytes32 vaultPointerDigest;
        string issuerAgencyCode;
        string credentialType;
        CredentialStatus status;
        uint64 expiresAt;
        uint64 attestedAt;
    }

    struct AssurancePolicy {
        bytes32 policyDigest;
        uint16 minimumAssuranceLevel;
        bool imageReleaseAllowed;
        uint64 updatedAt;
    }

    struct AccessRequest {
        bytes32 requestId;
        bytes32 credentialKey;
        bytes32 holderCommitment;
        bytes32 fieldSetDigest;
        bytes32 challengeDigest;
        string issuerAgencyCode;
        string purposeCode;
        bool credentialImageRequested;
        RequestStatus status;
        uint64 expiresAt;
        uint64 requestedAt;
    }

    struct AccessDecision {
        bytes32 holderProofDigest;
        bytes32 consentDigest;
        bytes32 issuerChallengeProofDigest;
        uint16 achievedAssuranceLevel;
        bool credentialImageApproved;
        RequestStatus status;
        uint64 decidedAt;
    }

    struct ReleaseReceipt {
        bytes32 releasedPayloadDigest;
        bytes32 encryptedEnvelopeDigest;
        uint64 releasedAt;
    }

    address public immutable registrar;
    mapping(address issuer => string agencyCode) public issuerAgency;
    mapping(bytes32 credentialKey => CredentialAttestation) private attestations;
    mapping(bytes32 policyKey => AssurancePolicy) private policies;
    mapping(bytes32 requestId => AccessRequest) private requests;
    mapping(bytes32 requestId => AccessDecision) private decisions;
    mapping(bytes32 requestId => ReleaseReceipt) private releases;

    error RegistrarOnly();
    error RegisteredIssuerOnly();
    error InvalidRecord();
    error DuplicateRecord(bytes32 key);
    error RecordNotFound(bytes32 key);
    error PolicyNotFound(bytes32 key);
    error AssuranceInsufficient();
    error ImageReleaseNotAllowed();

    event CredentialAttested(bytes32 indexed credentialKey, bytes32 indexed holderCommitment, string issuerAgencyCode, string credentialType);
    event CredentialStatusChanged(bytes32 indexed credentialKey, CredentialStatus status);
    event AccessRequested(bytes32 indexed requestId, bytes32 indexed credentialKey, string issuerAgencyCode, string purposeCode);
    event AccessDecided(bytes32 indexed requestId, RequestStatus status, uint16 assuranceLevel);
    event ReleaseRecorded(bytes32 indexed requestId, bytes32 releasedPayloadDigest);

    constructor() { registrar = msg.sender; }
    modifier onlyRegistrar() { if (msg.sender != registrar) revert RegistrarOnly(); _; }
    modifier onlyIssuer() { if (bytes(issuerAgency[msg.sender]).length == 0) revert RegisteredIssuerOnly(); _; }

    function policyKey(string memory issuerAgencyCode, string memory credentialType) public pure returns (bytes32) {
        return keccak256(abi.encode(issuerAgencyCode, credentialType));
    }

    function registerIssuer(address issuer, string calldata agencyCode) external onlyRegistrar {
        if (issuer == address(0) || bytes(agencyCode).length == 0) revert InvalidRecord();
        issuerAgency[issuer] = agencyCode;
    }

    function setPolicy(string calldata issuerAgencyCode, string calldata credentialType, AssurancePolicy calldata policy) external onlyIssuer {
        if (keccak256(bytes(issuerAgencyCode)) != keccak256(bytes(issuerAgency[msg.sender])) || bytes(credentialType).length == 0 || policy.policyDigest == bytes32(0) || policy.minimumAssuranceLevel == 0) revert InvalidRecord();
        policies[policyKey(issuerAgencyCode, credentialType)] = AssurancePolicy(policy.policyDigest, policy.minimumAssuranceLevel, policy.imageReleaseAllowed, uint64(block.timestamp));
    }

    function attestCredential(CredentialAttestation calldata attestation) external onlyIssuer {
        if (attestation.credentialKey == bytes32(0) || attestation.holderCommitment == bytes32(0) || attestation.credentialDigest == bytes32(0) || attestation.vaultPointerDigest == bytes32(0) || bytes(attestation.credentialType).length == 0) revert InvalidRecord();
        if (keccak256(bytes(attestation.issuerAgencyCode)) != keccak256(bytes(issuerAgency[msg.sender]))) revert InvalidRecord();
        if (attestations[attestation.credentialKey].attestedAt != 0) revert DuplicateRecord(attestation.credentialKey);
        attestations[attestation.credentialKey] = attestation;
        attestations[attestation.credentialKey].status = CredentialStatus.ACTIVE;
        attestations[attestation.credentialKey].attestedAt = uint64(block.timestamp);
        emit CredentialAttested(attestation.credentialKey, attestation.holderCommitment, attestation.issuerAgencyCode, attestation.credentialType);
    }

    function changeCredentialStatus(bytes32 credentialKey, CredentialStatus status) external onlyIssuer {
        CredentialAttestation storage attestation = attestations[credentialKey];
        if (attestation.attestedAt == 0) revert RecordNotFound(credentialKey);
        if (keccak256(bytes(attestation.issuerAgencyCode)) != keccak256(bytes(issuerAgency[msg.sender]))) revert RegisteredIssuerOnly();
        attestation.status = status;
        emit CredentialStatusChanged(credentialKey, status);
    }

    function requestAccess(AccessRequest calldata request) external onlyRegistrar {
        CredentialAttestation storage attestation = attestations[request.credentialKey];
        if (request.requestId == bytes32(0) || request.fieldSetDigest == bytes32(0) || request.challengeDigest == bytes32(0) || bytes(request.issuerAgencyCode).length == 0 || bytes(request.purposeCode).length == 0 || request.expiresAt <= block.timestamp) revert InvalidRecord();
        if (attestation.attestedAt == 0 || attestation.holderCommitment != request.holderCommitment || attestation.status != CredentialStatus.ACTIVE || keccak256(bytes(request.issuerAgencyCode)) != keccak256(bytes(attestation.issuerAgencyCode))) revert InvalidRecord();
        if (requests[request.requestId].requestedAt != 0) revert DuplicateRecord(request.requestId);
        bytes32 key = policyKey(request.issuerAgencyCode, attestation.credentialType);
        AssurancePolicy storage policy = policies[key];
        if (policy.updatedAt == 0) revert PolicyNotFound(key);
        if (request.credentialImageRequested && !policy.imageReleaseAllowed) revert ImageReleaseNotAllowed();
        requests[request.requestId] = request;
        requests[request.requestId].status = RequestStatus.PENDING;
        requests[request.requestId].requestedAt = uint64(block.timestamp);
        emit AccessRequested(request.requestId, request.credentialKey, request.issuerAgencyCode, request.purposeCode);
    }

    function decideAccess(bytes32 requestId, AccessDecision calldata decision) external onlyIssuer {
        AccessRequest storage request = requests[requestId];
        if (request.requestedAt == 0) revert RecordNotFound(requestId);
        if (request.status != RequestStatus.PENDING || block.timestamp > request.expiresAt) revert InvalidRecord();
        if (decision.holderProofDigest == bytes32(0) || decision.consentDigest == bytes32(0) || decision.issuerChallengeProofDigest == bytes32(0)) revert InvalidRecord();
        CredentialAttestation storage attestation = attestations[request.credentialKey];
        if (keccak256(bytes(attestation.issuerAgencyCode)) != keccak256(bytes(issuerAgency[msg.sender]))) revert RegisteredIssuerOnly();
        AssurancePolicy storage policy = policies[policyKey(request.issuerAgencyCode, attestation.credentialType)];
        if (decision.status == RequestStatus.APPROVED && decision.achievedAssuranceLevel < policy.minimumAssuranceLevel) revert AssuranceInsufficient();
        if (decision.credentialImageApproved && (!request.credentialImageRequested || !policy.imageReleaseAllowed)) revert ImageReleaseNotAllowed();
        if (decision.status != RequestStatus.APPROVED && decision.status != RequestStatus.DENIED) revert InvalidRecord();
        decisions[requestId] = AccessDecision(decision.holderProofDigest, decision.consentDigest, decision.issuerChallengeProofDigest, decision.achievedAssuranceLevel, decision.credentialImageApproved, decision.status, uint64(block.timestamp));
        request.status = decision.status;
        emit AccessDecided(requestId, decision.status, decision.achievedAssuranceLevel);
    }

    function recordRelease(bytes32 requestId, bytes32 releasedPayloadDigest, bytes32 encryptedEnvelopeDigest) external onlyIssuer {
        if (requests[requestId].status != RequestStatus.APPROVED || releasedPayloadDigest == bytes32(0) || encryptedEnvelopeDigest == bytes32(0)) revert InvalidRecord();
        CredentialAttestation storage attestation = attestations[requests[requestId].credentialKey];
        if (keccak256(bytes(attestation.issuerAgencyCode)) != keccak256(bytes(issuerAgency[msg.sender]))) revert RegisteredIssuerOnly();
        if (releases[requestId].releasedAt != 0) revert DuplicateRecord(requestId);
        releases[requestId] = ReleaseReceipt(releasedPayloadDigest, encryptedEnvelopeDigest, uint64(block.timestamp));
        requests[requestId].status = RequestStatus.RELEASED;
        emit ReleaseRecorded(requestId, releasedPayloadDigest);
    }

    function getAttestation(bytes32 credentialKey) external view returns (CredentialAttestation memory) { return attestations[credentialKey]; }
    function getPolicy(string calldata issuerAgencyCode, string calldata credentialType) external view returns (AssurancePolicy memory) { return policies[policyKey(issuerAgencyCode, credentialType)]; }
    function getAccessRequest(bytes32 requestId) external view returns (AccessRequest memory) { return requests[requestId]; }
    function getAccessDecision(bytes32 requestId) external view returns (AccessDecision memory) { return decisions[requestId]; }
    function getReleaseReceipt(bytes32 requestId) external view returns (ReleaseReceipt memory) { return releases[requestId]; }
}
