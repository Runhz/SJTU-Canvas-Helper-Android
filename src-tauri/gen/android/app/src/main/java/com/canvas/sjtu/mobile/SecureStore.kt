package com.canvas.sjtu.mobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureStore(context: Context) {
    private val prefs = context.getSharedPreferences("canvas_secure", Context.MODE_PRIVATE)
    private val alias = "canvas-mobile-settings-v1"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    @Synchronized fun read(name: String): String? {
        val encrypted = prefs.getString(name, null) ?: return null
        val split = encrypted.split(":", limit = 2)
        require(split.size == 2) { "Encrypted settings are damaged" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(split[0], Base64.NO_WRAP)))
        return String(cipher.doFinal(Base64.decode(split[1], Base64.NO_WRAP)), Charsets.UTF_8)
    }
    @Synchronized fun write(name: String, value: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encoded = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        check(prefs.edit().putString(name, encoded).commit()) { "Unable to persist encrypted settings" }
    }
    fun settings(): JSONObject = JSONObject(read("settings") ?: "{\"accounts\":[],\"currentId\":\"\"}")
    fun activeAccount(): JSONObject? {
        val data = settings(); val id = data.optString("currentId")
        val accounts = data.optJSONArray("accounts") ?: return null
        for (i in 0 until accounts.length()) accounts.optJSONObject(i)?.let { if (it.optString("accountId") == id) return it }
        return null
    }
}
