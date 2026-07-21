package com.egov.bangon

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import dagger.hilt.android.AndroidEntryPoint

/**
 * Entry point only. NavHost + screen composables intentionally not wired here —
 * owned by UI teammate. Placeholder content until nav graph lands.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            Surface {
                Text("BANGON — scaffold only, UI pending")
            }
        }
    }
}
