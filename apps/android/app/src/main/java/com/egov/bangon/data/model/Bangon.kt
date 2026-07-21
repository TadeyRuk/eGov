package com.egov.bangon.data.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// ---- Face Liveness session (POST /bangon/liveness/session) ----

@Serializable
data class LivenessSessionRequest(
    /** "redirect" | "post" | "close" */
    val action: String,
    val callbackUrl: String? = null,
    val delay: Int? = null,
)

@Serializable
data class LivenessSessionResponse(
    val token: String,
    val url: String,
    val raw: JsonElement? = null,
)

// ---- Face Liveness result (GET /bangon/liveness/result/:sessionToken) ----

@Serializable
data class LivenessResultResponse(
    val status: String,
    val confidence: Double,
    val passed: Boolean,
    val referenceImageUrl: String? = null,
    val raw: JsonElement? = null,
)

// ---- confirm-identity (POST /bangon/confirm-identity) ----

@Serializable
data class ConfirmIdentityPayload(
    val first_name: String,
    val middle_name: String? = null,
    val last_name: String,
    val suffix: String? = null,
    val birth_date: String,
    /** Web SDK result.session_id — Tier eVerify liveness, distinct from Face Liveness API sessionToken. */
    val face_liveness_session_id: String? = null,
)

@Serializable
data class ConfirmIdentityRequest(
    /** eVerify Bearer access_token from POST /api/auth */
    val token: String,
    val payload: ConfirmIdentityPayload,
    /** Face Liveness API token from /bangon/liveness/session */
    val sessionToken: String,
)

@Serializable
data class CitizenEligibilityProfile(
    val dateOfBirth: String,
    val civilStatus: String,
    val vitalStatus: String,
)

// ---- matches (POST /bangon/matches) ----

@Serializable
data class FindMatchesProfile(
    val dateOfBirth: String,
    val civilStatus: String,
    val vitalStatus: String,
)

@Serializable
data class FindMatchesRequest(
    val citizenId: String,
    val profile: FindMatchesProfile,
)

@Serializable
data class BenefitMatch(
    val id: String,
    val citizenId: String,
    val benefitId: String,
    val matchedAt: String,
)

// ---- per-match actions ----

@Serializable
data class NotifyMatchRequest(val citizenPhone: String)

@Serializable
data class DisburseMatchResponse(val transactionId: String? = null)

@Serializable
data class AnchorMatchResponse(val hash: String)

@Serializable
data class ExplainMatchResponse(val explanation: String)

// ---- report-non-delivery (POST /bangon/report-non-delivery) ----

@Serializable
data class ReportNonDeliveryRequest(
    val accessToken: String,
    val citizenId: String,
    val benefitId: String,
    val benefitTitle: String,
    val mobile: String,
    val firstName: String,
    val lastName: String,
    val gender: String,
    val email: String,
    val description: String,
    val regionCode: String,
    val provinceCode: String,
    val municipalityCode: String,
    val barangayCode: String,
)

@Serializable
data class ReportNonDeliveryResponse(val caseNumber: String)
