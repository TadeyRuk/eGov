// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Public benefit catalog plus pseudonymous eligibility and notification receipts.
/// @dev Never publish names, contact details, raw IDs, or message contents here.
contract TolvarisBenefitRegistry {
    struct BenefitProgram {
        string benefitId;
        string title;
        string agencyCode;
        string description;
        string legalBasis;
        string legalBasisUrl;
        string[] eligibleGroupCodes;
        string[] acceptedCardTypes;
        bool active;
        uint64 recordedAt;
    }

    struct EligibilityRecord {
        bytes32 subjectCommitment;
        bytes32 benefitKey;
        bytes32 evidenceCommitment;
        string status;
        uint64 assessedAt;
    }

    struct NotificationReceipt {
        bytes32 notificationFingerprint;
        string channel;
        string deliveryStatus;
        uint64 recordedAt;
    }

    address public immutable registrar;
    mapping(bytes32 benefitKey => BenefitProgram) private programs;
    mapping(bytes32 eligibilityKey => EligibilityRecord) private eligibility;
    mapping(bytes32 eligibilityKey => NotificationReceipt[]) private notifications;

    error RegistrarOnly();
    error InvalidRecord();
    error DuplicateRecord(bytes32 key);
    error ProgramNotFound(bytes32 key);

    constructor() { registrar = msg.sender; }

    modifier onlyRegistrar() {
        if (msg.sender != registrar) revert RegistrarOnly();
        _;
    }

    function benefitKey(string memory agencyCode, string memory benefitId) public pure returns (bytes32) {
        return keccak256(abi.encode(agencyCode, benefitId));
    }

    function eligibilityKey(bytes32 subjectCommitment, bytes32 programKey) public pure returns (bytes32) {
        return keccak256(abi.encode(subjectCommitment, programKey));
    }

    function publishProgram(BenefitProgram calldata program) external onlyRegistrar {
        if (bytes(program.benefitId).length == 0 || bytes(program.title).length == 0 || bytes(program.agencyCode).length == 0) revert InvalidRecord();
        bytes32 key = benefitKey(program.agencyCode, program.benefitId);
        if (programs[key].recordedAt != 0) revert DuplicateRecord(key);
        programs[key] = program;
        programs[key].recordedAt = uint64(block.timestamp);
    }

    function recordEligibility(
        bytes32 subjectCommitment,
        bytes32 programKey,
        bytes32 evidenceCommitment,
        string calldata status
    ) external onlyRegistrar returns (bytes32 key) {
        if (subjectCommitment == bytes32(0) || evidenceCommitment == bytes32(0) || bytes(status).length == 0) revert InvalidRecord();
        if (programs[programKey].recordedAt == 0) revert ProgramNotFound(programKey);
        key = eligibilityKey(subjectCommitment, programKey);
        if (eligibility[key].assessedAt != 0) revert DuplicateRecord(key);
        eligibility[key] = EligibilityRecord(subjectCommitment, programKey, evidenceCommitment, status, uint64(block.timestamp));
    }

    function recordNotification(
        bytes32 key,
        bytes32 notificationFingerprint,
        string calldata channel,
        string calldata deliveryStatus
    ) external onlyRegistrar {
        if (eligibility[key].assessedAt == 0 || notificationFingerprint == bytes32(0) || bytes(channel).length == 0 || bytes(deliveryStatus).length == 0) revert InvalidRecord();
        notifications[key].push(NotificationReceipt(notificationFingerprint, channel, deliveryStatus, uint64(block.timestamp)));
    }

    function getProgram(bytes32 key) external view returns (BenefitProgram memory) { return programs[key]; }
    function getEligibility(bytes32 key) external view returns (EligibilityRecord memory) { return eligibility[key]; }
    function getNotifications(bytes32 key) external view returns (NotificationReceipt[] memory) { return notifications[key]; }
}
