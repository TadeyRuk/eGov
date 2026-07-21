package com.egov.bangon.data.api

import com.egov.bangon.data.model.AdvanceCaseRequest
import com.egov.bangon.data.model.AnchorMatchResponse
import com.egov.bangon.data.model.AttachDocumentRequest
import com.egov.bangon.data.model.BenefitMatch
import com.egov.bangon.data.model.CaseDocument
import com.egov.bangon.data.model.CitizenEligibilityProfile
import com.egov.bangon.data.model.ConfirmIdentityRequest
import com.egov.bangon.data.model.CreateCaseRequest
import com.egov.bangon.data.model.DisburseMatchResponse
import com.egov.bangon.data.model.ExplainMatchResponse
import com.egov.bangon.data.model.FindMatchesRequest
import com.egov.bangon.data.model.LivenessResultResponse
import com.egov.bangon.data.model.LivenessSessionRequest
import com.egov.bangon.data.model.LivenessSessionResponse
import com.egov.bangon.data.model.NotifyMatchRequest
import com.egov.bangon.data.model.ReportNonDeliveryRequest
import com.egov.bangon.data.model.ReportNonDeliveryResponse
import com.egov.bangon.data.model.ServiceCase
import com.egov.bangon.data.model.SsoExchangeRequest
import com.egov.bangon.data.model.SsoExchangeResponse
import com.egov.bangon.data.model.SsoProfileRequest
import com.egov.bangon.data.model.SsoProfileResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Exact mirror of docs/api-android.md. Talks only to apps/api — never to
 * platforms.e.gov.ph directly (server holds partner secrets).
 */
interface BangonApi {

    @GET("health")
    suspend fun health(): Response<Map<String, String>>

    // ---- Auth ----

    @POST("auth/sso/exchange")
    suspend fun exchangeSso(@Body body: SsoExchangeRequest): Response<SsoExchangeResponse>

    @POST("auth/sso/profile")
    suspend fun ssoProfile(@Body body: SsoProfileRequest): Response<SsoProfileResponse>

    // ---- Service cases ----

    @POST("cases")
    suspend fun createCase(@Body body: CreateCaseRequest): Response<ServiceCase>

    @GET("cases/{id}")
    suspend fun getCase(@Path("id") id: String): Response<ServiceCase>

    @POST("cases/{id}/advance")
    suspend fun advanceCase(
        @Path("id") id: String,
        @Body body: AdvanceCaseRequest,
    ): Response<ServiceCase>

    @POST("cases/{id}/documents")
    suspend fun attachDocument(
        @Path("id") id: String,
        @Body body: AttachDocumentRequest,
    ): Response<CaseDocument>

    // ---- BANGON ----

    @POST("bangon/liveness/session")
    suspend fun startLivenessSession(
        @Body body: LivenessSessionRequest,
    ): Response<LivenessSessionResponse>

    @GET("bangon/liveness/result/{sessionToken}")
    suspend fun getLivenessResult(
        @Path("sessionToken") sessionToken: String,
    ): Response<LivenessResultResponse>

    @POST("bangon/confirm-identity")
    suspend fun confirmIdentity(
        @Body body: ConfirmIdentityRequest,
    ): Response<CitizenEligibilityProfile>

    @POST("bangon/matches")
    suspend fun findMatches(@Body body: FindMatchesRequest): Response<List<BenefitMatch>>

    @POST("bangon/matches/{matchId}/notify")
    suspend fun notifyMatch(
        @Path("matchId") matchId: String,
        @Body body: NotifyMatchRequest,
    ): Response<Unit>

    @POST("bangon/matches/{matchId}/disburse")
    suspend fun disburseMatch(
        @Path("matchId") matchId: String,
    ): Response<DisburseMatchResponse>

    @POST("bangon/matches/{matchId}/anchor")
    suspend fun anchorMatch(
        @Path("matchId") matchId: String,
    ): Response<AnchorMatchResponse>

    @POST("bangon/matches/{matchId}/explain")
    suspend fun explainMatch(
        @Path("matchId") matchId: String,
    ): Response<ExplainMatchResponse>

    @POST("bangon/report-non-delivery")
    suspend fun reportNonDelivery(
        @Body body: ReportNonDeliveryRequest,
    ): Response<ReportNonDeliveryResponse>
}
