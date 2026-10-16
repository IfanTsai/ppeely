package com.ppeely.stickers

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(StickerBridgePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
