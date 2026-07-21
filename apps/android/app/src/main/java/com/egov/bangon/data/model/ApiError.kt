package com.egov.bangon.data.model

import kotlinx.serialization.Serializable

@Serializable
data class ApiErrorEnvelope(val error: ApiError)

@Serializable
data class ApiError(val code: String, val message: String)

/** Mirrors docs/api-android.md error `code` values exactly — no additions. */
object ApiErrorCode {
    const val NOT_FOUND = "NOT_FOUND"
    const val VALIDATION = "VALIDATION"
    const val CONFLICT = "CONFLICT"
    const val FORBIDDEN = "FORBIDDEN"
    const val UNAVAILABLE = "UNAVAILABLE"
    const val INTERNAL = "INTERNAL"
}
