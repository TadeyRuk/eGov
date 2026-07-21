// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Public, append-only, double-entry journal with agency-signature provenance.
/// @dev All values are public. Never submit credentials, bank account numbers, or personal data.
contract TolvarisGeneralLedger {
    struct JournalEntry {
        string agencyCode;
        string entryId;
        string postingDate;
        string description;
        string sourceDocumentId;
        string sourceUrl;
        string signerKeyId;
        bytes32 requestDigest;
        bytes signature;
        uint256 totalDebitCentavos;
        uint256 totalCreditCentavos;
        uint64 recordedAt;
        bool exists;
    }

    struct JournalLine {
        string accountCode;
        string accountName;
        string accountType;
        string fundCode;
        string programCode;
        bytes32 projectKey;
        uint256 debitCentavos;
        uint256 creditCentavos;
    }

    address public immutable registrar;
    mapping(bytes32 entryKey => JournalEntry) private entries;
    mapping(bytes32 entryKey => JournalLine[]) private lines;

    event JournalEntryPublished(
        bytes32 indexed entryKey,
        string indexed agencyCode,
        string entryId,
        string signerKeyId,
        bytes32 requestDigest,
        uint256 totalDebitCentavos,
        uint256 totalCreditCentavos,
        uint64 recordedAt
    );

    error RegistrarOnly();
    error InvalidHeader();
    error InvalidLines();
    error InvalidJournalLine(uint256 lineIndex);
    error UnbalancedEntry(uint256 totalDebitCentavos, uint256 totalCreditCentavos);
    error DuplicateEntry(bytes32 entryKey);

    constructor() {
        registrar = msg.sender;
    }

    function entryKey(
        string memory agencyCode,
        string memory entryId
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(agencyCode, entryId));
    }

    function hasEntry(
        string calldata agencyCode,
        string calldata entryId
    ) external view returns (bool) {
        return entries[entryKey(agencyCode, entryId)].exists;
    }

    function publishJournalEntry(
        string calldata agencyCode,
        string calldata entryId,
        string calldata postingDate,
        string calldata description,
        string calldata sourceDocumentId,
        string calldata sourceUrl,
        string calldata signerKeyId,
        bytes32 requestDigest,
        bytes calldata signature,
        JournalLine[] calldata journalLines
    ) external {
        if (msg.sender != registrar) revert RegistrarOnly();
        if (
            bytes(agencyCode).length == 0 ||
            bytes(entryId).length == 0 ||
            bytes(postingDate).length == 0 ||
            bytes(description).length == 0 ||
            bytes(sourceDocumentId).length == 0 ||
            bytes(signerKeyId).length == 0 ||
            requestDigest == bytes32(0) ||
            signature.length == 0
        ) revert InvalidHeader();
        if (journalLines.length < 2 || journalLines.length > 100) {
            revert InvalidLines();
        }

        bytes32 key = entryKey(agencyCode, entryId);
        if (entries[key].exists) revert DuplicateEntry(key);

        uint256 totalDebit;
        uint256 totalCredit;
        for (uint256 index = 0; index < journalLines.length; index++) {
            JournalLine calldata line = journalLines[index];
            bool hasDebit = line.debitCentavos > 0;
            bool hasCredit = line.creditCentavos > 0;
            if (
                bytes(line.accountCode).length == 0 ||
                bytes(line.accountName).length == 0 ||
                bytes(line.accountType).length == 0 ||
                hasDebit == hasCredit
            ) revert InvalidJournalLine(index);
            totalDebit += line.debitCentavos;
            totalCredit += line.creditCentavos;
        }
        if (totalDebit == 0 || totalDebit != totalCredit) {
            revert UnbalancedEntry(totalDebit, totalCredit);
        }

        uint64 recordedAt = uint64(block.timestamp);
        entries[key] = JournalEntry(
            agencyCode,
            entryId,
            postingDate,
            description,
            sourceDocumentId,
            sourceUrl,
            signerKeyId,
            requestDigest,
            signature,
            totalDebit,
            totalCredit,
            recordedAt,
            true
        );
        for (uint256 index = 0; index < journalLines.length; index++) {
            lines[key].push(journalLines[index]);
        }
        emit JournalEntryPublished(
            key,
            agencyCode,
            entryId,
            signerKeyId,
            requestDigest,
            totalDebit,
            totalCredit,
            recordedAt
        );
    }

    function getEntry(bytes32 key) external view returns (JournalEntry memory) {
        return entries[key];
    }

    function getLines(bytes32 key) external view returns (JournalLine[] memory) {
        return lines[key];
    }
}
