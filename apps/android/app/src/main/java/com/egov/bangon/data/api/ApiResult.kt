package com.egov.bangon.data.api

import com.egov.bangon.data.model.ApiError

/** Mirrors the TS backend's Result<T, AppError> pattern (packages/shared). */
sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>
    data class Failure(val error: ApiError) : ApiResult<Nothing>
}
