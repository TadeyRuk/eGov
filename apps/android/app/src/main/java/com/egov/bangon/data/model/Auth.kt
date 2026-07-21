package com.egov.bangon.data.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** POST /auth/sso/exchange */
@Serializable
data class SsoExchangeRequest(
    val exchangeCode: String,
    val scope: String = "SSO_AUTHENTICATION",
)

@Serializable
data class SsoExchangeResponse(
    val accessToken: String,
    val tokenType: String? = null,
    val expiresIn: Int? = null,
    val raw: JsonElement? = null,
)

/** POST /auth/sso/profile */
@Serializable
data class SsoProfileRequest(val accessToken: String)

@Serializable
data class SsoProfileResponse(val raw: JsonElement? = null)
