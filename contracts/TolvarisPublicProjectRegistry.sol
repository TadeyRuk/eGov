// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Append-only, plaintext registry for public DBM Compass project data.
/// @dev Never submit API credentials, bank data, signatures, or personal information.
contract TolvarisPublicProjectRegistry {
    struct Agency {
        string code;
        string name;
        bool exists;
    }

    struct Project {
        string dataset;
        string sourceRecordId;
        string title;
        string location;
        string agencyCode;
        string implementingUnit;
        string sourceUrl;
        bytes32 projectFingerprint;
        bool exists;
    }

    struct BudgetSnapshot {
        uint32 fiscalYear;
        string asOfDate;
        uint256 appropriationsCentavos;
        uint256 allotmentsCentavos;
        uint256 obligationsCentavos;
        uint256 disbursementsCentavos;
        string status;
        bytes32 sourcePayloadHash;
        uint64 recordedAt;
    }

    address public immutable registrar;
    mapping(bytes32 agencyKey => Agency) private agencies;
    mapping(bytes32 projectKey => Project) private projects;
    mapping(bytes32 projectFingerprint => bytes32 projectKey) private projectByFingerprint;
    mapping(bytes32 projectKey => BudgetSnapshot[]) private snapshots;

    event AgencyPublished(bytes32 indexed agencyKey, string code, string name);
    event ProjectPublished(
        bytes32 indexed projectKey,
        string dataset,
        string sourceRecordId,
        string title,
        string agencyCode
    );
    event BudgetSnapshotPublished(
        bytes32 indexed projectKey,
        uint256 indexed snapshotIndex,
        uint32 fiscalYear,
        string asOfDate,
        uint256 appropriationsCentavos,
        uint256 allotmentsCentavos,
        uint256 obligationsCentavos,
        uint256 disbursementsCentavos,
        string status,
        bytes32 sourcePayloadHash,
        uint64 recordedAt
    );

    error RegistrarOnly();
    error InvalidTextField();
    error UnknownAgency();
    error UnknownProject();
    error DuplicateProject(bytes32 existingProjectKey);

    constructor() {
        registrar = msg.sender;
    }

    modifier onlyRegistrar() {
        if (msg.sender != registrar) revert RegistrarOnly();
        _;
    }

    function agencyKey(string memory code) public pure returns (bytes32) {
        return keccak256(bytes(code));
    }

    function projectKey(
        string memory dataset,
        string memory sourceRecordId
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(dataset, sourceRecordId));
    }

    /// @dev Callers must trim, collapse whitespace, and uppercase the text fields first.
    function projectFingerprint(
        string memory dataset,
        string memory agencyCode,
        string memory canonicalTitle,
        string memory canonicalLocation
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(dataset, agencyCode, canonicalTitle, canonicalLocation)
        );
    }

    function publishAgency(
        string calldata code,
        string calldata name
    ) external onlyRegistrar {
        if (bytes(code).length == 0 || bytes(name).length == 0) {
            revert InvalidTextField();
        }
        bytes32 key = agencyKey(code);
        agencies[key] = Agency(code, name, true);
        emit AgencyPublished(key, code, name);
    }

    function publishProject(
        string calldata dataset,
        string calldata sourceRecordId,
        string calldata title,
        string calldata location,
        string calldata agencyCode,
        string calldata implementingUnit,
        string calldata sourceUrl
    ) external onlyRegistrar returns (bytes32 key) {
        if (
            bytes(dataset).length == 0 ||
            bytes(sourceRecordId).length == 0 ||
            bytes(title).length == 0
        ) revert InvalidTextField();
        if (!agencies[agencyKey(agencyCode)].exists) revert UnknownAgency();

        key = projectKey(dataset, sourceRecordId);
        if (projects[key].exists) revert DuplicateProject(key);
        bytes32 fingerprint = projectFingerprint(
            dataset,
            agencyCode,
            title,
            location
        );
        bytes32 duplicateKey = projectByFingerprint[fingerprint];
        if (duplicateKey != bytes32(0)) revert DuplicateProject(duplicateKey);
        projects[key] = Project(
            dataset,
            sourceRecordId,
            title,
            location,
            agencyCode,
            implementingUnit,
            sourceUrl,
            fingerprint,
            true
        );
        projectByFingerprint[fingerprint] = key;
        emit ProjectPublished(key, dataset, sourceRecordId, title, agencyCode);
    }

    function publishBudgetSnapshot(
        bytes32 key,
        uint32 fiscalYear,
        string calldata asOfDate,
        uint256 appropriationsCentavos,
        uint256 allotmentsCentavos,
        uint256 obligationsCentavos,
        uint256 disbursementsCentavos,
        string calldata status,
        bytes32 sourcePayloadHash
    ) external onlyRegistrar {
        if (!projects[key].exists) revert UnknownProject();
        if (bytes(asOfDate).length == 0 || bytes(status).length == 0) {
            revert InvalidTextField();
        }
        uint64 recordedAt = uint64(block.timestamp);
        snapshots[key].push(BudgetSnapshot(
            fiscalYear,
            asOfDate,
            appropriationsCentavos,
            allotmentsCentavos,
            obligationsCentavos,
            disbursementsCentavos,
            status,
            sourcePayloadHash,
            recordedAt
        ));
        emit BudgetSnapshotPublished(
            key,
            snapshots[key].length - 1,
            fiscalYear,
            asOfDate,
            appropriationsCentavos,
            allotmentsCentavos,
            obligationsCentavos,
            disbursementsCentavos,
            status,
            sourcePayloadHash,
            recordedAt
        );
    }

    function getAgency(string calldata code) external view returns (Agency memory) {
        return agencies[agencyKey(code)];
    }

    function getProject(bytes32 key) external view returns (Project memory) {
        return projects[key];
    }

    function hasProject(
        string calldata dataset,
        string calldata sourceRecordId
    ) external view returns (bool) {
        return projects[projectKey(dataset, sourceRecordId)].exists;
    }

    function findProjectByFingerprint(
        bytes32 fingerprint
    ) external view returns (bytes32 key, bool exists) {
        key = projectByFingerprint[fingerprint];
        exists = key != bytes32(0);
    }

    function getBudgetSnapshots(
        bytes32 key
    ) external view returns (BudgetSnapshot[] memory) {
        return snapshots[key];
    }
}
