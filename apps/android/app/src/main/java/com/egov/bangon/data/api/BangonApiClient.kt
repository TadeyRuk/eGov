package com.egov.bangon.data.api

import com.egov.bangon.data.model.ApiError
import com.egov.bangon.data.model.ApiErrorCode
import com.egov.bangon.data.model.ApiErrorEnvelope
import kotlinx.serialization.json.Json
import retrofit2.Response

/** Decodes docs/api-android.md's non-2xx `{ error: { code, message } }` envelope. */
class BangonApiClient(private val api: BangonApi, private val json: Json) {

    suspend fun <T> call(block: suspend BangonApi.() -> Response<T>): ApiResult<T> {
        val response = try {
            api.block()
        } catch (t: Throwable) {
            return ApiResult.Failure(ApiError(ApiErrorCode.UNAVAILABLE, t.message ?: "network error"))
        }

        if (response.isSuccessful) {
            val body = response.body()
            @Suppress("UNCHECKED_CAST")
            return ApiResult.Success(body as T)
        }

        val raw = response.errorBody()?.string()
        val error = raw?.let {
            runCatching { json.decodeFromString(ApiErrorEnvelope.serializer(), it).error }.getOrNull()
        } ?: ApiError(ApiErrorCode.INTERNAL, "HTTP ${response.code()}")

        return ApiResult.Failure(error)
    }
}
