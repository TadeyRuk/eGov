// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Public accountability trail for eReports without publishing reporter identity.
/// @dev Identity and detailed evidence stay encrypted off-chain; the chain stores commitments.
contract TolvarisReportRegistry {
    struct Report {
        bytes32 reportId;
        bytes32 reporterCommitment;
        bytes32 subjectCommitment;
        bytes32 evidenceDigest;
        string category;
        string assignedAgencyCode;
        string coarseLocation;
        string status;
        uint64 recordedAt;
    }

    struct StatusChange {
        string status;
        string agencyCode;
        bytes32 actionDigest;
        uint64 recordedAt;
    }

    struct DisclosureDecision {
        bytes32 decisionDigest;
        string legalBasis;
        string authorizingAgencyCode;
        bool approved;
        uint64 recordedAt;
    }

    struct ExternalEvidenceSignal {
        bytes32 signalId;
        bytes32 projectKey;
        bytes32 sourceContentDigest;
        bytes32 normalizedClaimDigest;
        string sourceUrl;
        string sourcePublisher;
        string category;
        string status;
        uint64 recordedAt;
    }

    address public immutable registrar;
    mapping(bytes32 reportId => Report) private reports;
    mapping(bytes32 reportId => StatusChange[]) private history;
    mapping(bytes32 reportId => DisclosureDecision[]) private disclosureDecisions;
    mapping(bytes32 signalId => ExternalEvidenceSignal) private externalSignals;

    error RegistrarOnly();
    error InvalidRecord();
    error DuplicateReport(bytes32 reportId);
    error ReportNotFound(bytes32 reportId);
    error DuplicateSignal(bytes32 signalId);

    constructor() { registrar = msg.sender; }
    modifier onlyRegistrar() { if (msg.sender != registrar) revert RegistrarOnly(); _; }

    function publishReport(Report calldata report) external onlyRegistrar {
        if (report.reportId == bytes32(0) || report.reporterCommitment == bytes32(0) || report.evidenceDigest == bytes32(0) || bytes(report.category).length == 0 || bytes(report.assignedAgencyCode).length == 0 || bytes(report.status).length == 0) revert InvalidRecord();
        if (reports[report.reportId].recordedAt != 0) revert DuplicateReport(report.reportId);
        reports[report.reportId] = report;
        reports[report.reportId].recordedAt = uint64(block.timestamp);
        history[report.reportId].push(StatusChange(report.status, report.assignedAgencyCode, report.evidenceDigest, uint64(block.timestamp)));
    }

    function appendStatus(bytes32 reportId, string calldata status, string calldata agencyCode, bytes32 actionDigest) external onlyRegistrar {
        if (reports[reportId].recordedAt == 0) revert ReportNotFound(reportId);
        if (bytes(status).length == 0 || bytes(agencyCode).length == 0 || actionDigest == bytes32(0)) revert InvalidRecord();
        reports[reportId].status = status;
        history[reportId].push(StatusChange(status, agencyCode, actionDigest, uint64(block.timestamp)));
    }

    function recordDisclosureDecision(bytes32 reportId, DisclosureDecision calldata decision) external onlyRegistrar {
        if (reports[reportId].recordedAt == 0) revert ReportNotFound(reportId);
        if (decision.decisionDigest == bytes32(0) || bytes(decision.legalBasis).length == 0 || bytes(decision.authorizingAgencyCode).length == 0) revert InvalidRecord();
        disclosureDecisions[reportId].push(DisclosureDecision(decision.decisionDigest, decision.legalBasis, decision.authorizingAgencyCode, decision.approved, uint64(block.timestamp)));
    }

    function publishExternalEvidenceSignal(ExternalEvidenceSignal calldata signal) external onlyRegistrar {
        if (signal.signalId == bytes32(0) || signal.sourceContentDigest == bytes32(0) || signal.normalizedClaimDigest == bytes32(0) || bytes(signal.sourceUrl).length == 0 || bytes(signal.sourcePublisher).length == 0 || bytes(signal.category).length == 0 || keccak256(bytes(signal.status)) != keccak256(bytes("UNVERIFIED_MEDIA_SIGNAL"))) revert InvalidRecord();
        if (externalSignals[signal.signalId].recordedAt != 0) revert DuplicateSignal(signal.signalId);
        externalSignals[signal.signalId] = signal;
        externalSignals[signal.signalId].recordedAt = uint64(block.timestamp);
    }

    function getReport(bytes32 reportId) external view returns (Report memory) { return reports[reportId]; }
    function getHistory(bytes32 reportId) external view returns (StatusChange[] memory) { return history[reportId]; }
    function getDisclosureDecisions(bytes32 reportId) external view returns (DisclosureDecision[] memory) { return disclosureDecisions[reportId]; }
    function getExternalEvidenceSignal(bytes32 signalId) external view returns (ExternalEvidenceSignal memory) { return externalSignals[signalId]; }
}
