package com.ppeely.e2e.whatsappdouble

import java.nio.ByteBuffer
import java.nio.ByteOrder

data class WebpInfo(val width: Int, val height: Int, val frameDurations: List<Int>) {
    val frameCount: Int get() = maxOf(1, frameDurations.size)
}

/** Parses a WebP RIFF container and extracts the canvas size and each frame's duration; returns null if the data is not WebP. */
object WebpInspector {
    fun inspect(bytes: ByteArray): WebpInfo? {
        if (bytes.size < 16 || String(bytes, 0, 4) != "RIFF" || String(bytes, 8, 4) != "WEBP") {
            return null
        }

        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        var width = 0
        var height = 0
        val durations = mutableListOf<Int>()
        var offset = 12

        while (offset + 8 <= bytes.size) {
            val type = String(bytes, offset, 4)
            val size = buffer.getInt(offset + 4)
            val payload = offset + 8

            when (type) {
                "VP8X" -> {
                    width = uint24(bytes, payload + 4) + 1
                    height = uint24(bytes, payload + 7) + 1
                }
                "VP8 " -> if (width == 0) {
                    width = buffer.getShort(payload + 6).toInt() and 0x3fff
                    height = buffer.getShort(payload + 8).toInt() and 0x3fff
                }
                "VP8L" -> if (width == 0) {
                    val bits = buffer.getInt(payload + 1)
                    width = (bits and 0x3fff) + 1
                    height = ((bits shr 14) and 0x3fff) + 1
                }
                "ANMF" -> durations += uint24(bytes, payload + 12)
            }

            offset = payload + size + (size and 1)
        }

        return WebpInfo(width, height, durations)
    }

    private fun uint24(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xff) or
            ((bytes[offset + 1].toInt() and 0xff) shl 8) or
            ((bytes[offset + 2].toInt() and 0xff) shl 16)
}
