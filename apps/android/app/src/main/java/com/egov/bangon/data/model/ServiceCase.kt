package com.egov.bangon.data.model

import kotlinx.serialization.Serializable

@Serializable
data class CreateCaseRequest(val citizenId: String, val title: String)

@Serializable
data class ServiceCase(
    val id: String,
    val citizenId: String,
    val title: String,
    val status: String,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class AdvanceCaseRequest(val nextStatus: String)

/** nextStatus values per docs/api-android.md — do not invent others. */
object ServiceCaseStatus {
    const val SUBMITTED = "submitted"
    const val IN_REVIEW = "in_review"
    const val APPROVED = "approved"
    const val REJECTED = "rejected"
    const val CLOSED = "closed"
}

@Serializable
data class AttachDocumentRequest(
    val fileName: String,
    val contentType: String,
    val contentBase64: String,
)

@Serializable
data class CaseDocument(
    val id: String,
    val caseId: String,
    val fileName: String,
    val contentType: String,
    val createdAt: String,
)
