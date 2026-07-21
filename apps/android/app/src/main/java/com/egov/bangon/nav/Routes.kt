package com.egov.bangon.nav

/**
 * Route name contracts only — no NavHost/composables here.
 * Screen implementations owned by UI teammate; wire against these constants.
 */
object Routes {
    const val SSO_CALLBACK = "sso_callback"
    const val LIVENESS_CAPTURE = "liveness_capture"
    const val CONFIRM_IDENTITY = "confirm_identity"
    const val BENEFIT_MATCHES = "benefit_matches"
    const val MATCH_DETAIL = "match_detail/{matchId}"
    const val REPORT_NON_DELIVERY = "report_non_delivery/{matchId}"

    fun matchDetail(matchId: String) = "match_detail/$matchId"
    fun reportNonDelivery(matchId: String) = "report_non_delivery/$matchId"
}
