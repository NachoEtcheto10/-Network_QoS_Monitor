package com.networkqosmonitor.telephony

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import android.telephony.CellInfo
import android.telephony.CellSignalStrength
import android.telephony.CellSignalStrengthLte
import android.telephony.CellSignalStrengthNr
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule

/**
 * TurboModule que expone a JS la información de TelephonyManager / WifiManager
 * que NetInfo no entrega: operador, tecnología de radio y nivel de señal.
 */
@ReactModule(name = TelephonyModule.NAME)
class TelephonyModule(reactContext: ReactApplicationContext) :
  NativeTelephonySpec(reactContext) {

  override fun getName(): String = NAME

  override fun getTelephonyInfo(promise: Promise) {
    try {
      val context = reactApplicationContext
      val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
      val info = Arguments.createMap()

      putOperator(info, telephony)

      val hasPhonePermission = hasPhonePermission(context)
      info.putBoolean("hasPhonePermission", hasPhonePermission)

      val dataType = if (hasPhonePermission) readDataNetworkType(telephony) else TelephonyManager.NETWORK_TYPE_UNKNOWN
      val strengths = readSignalStrengths(telephony)
      // En 5G NSA el plano de datos sigue anclado en LTE y dataNetworkType
      // informa LTE; la presencia de una portadora NR con señal válida es el
      // indicio de que el dispositivo está usando 5G.
      val nr = strengths.filterIsInstance<CellSignalStrengthNr>().firstOrNull { it.dbm.isAvailable() }
      val isNsa = dataType == TelephonyManager.NETWORK_TYPE_LTE && nr != null

      info.putString("networkType", if (isNsa) "5g" else generationOf(dataType))
      putNullableString(info, "radioTechnology", if (isNsa) "NR (NSA)" else radioNameOf(dataType))

      putSignal(info, telephony, strengths, preferNr = isNsa || dataType == TelephonyManager.NETWORK_TYPE_NR)
      putNullableInt(info, "wifiRssi", readWifiRssi(context))

      promise.resolve(info)
    } catch (e: Exception) {
      promise.reject("E_TELEPHONY", e.message ?: "No se pudo leer la información de telefonía", e)
    }
  }

  private fun hasPhonePermission(context: Context): Boolean {
    if (granted(context, Manifest.permission.READ_PHONE_STATE)) return true
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      granted(context, Manifest.permission.READ_BASIC_PHONE_STATE)
  }

  private fun granted(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  private fun putOperator(info: WritableMap, telephony: TelephonyManager) {
    val name = telephony.networkOperatorName?.takeIf { it.isNotBlank() }
      ?: telephony.simOperatorName?.takeIf { it.isNotBlank() }
    putNullableString(info, "carrier", name)

    // networkOperator es MCC (3 dígitos) + MNC (2 o 3 dígitos).
    val numeric = telephony.networkOperator?.takeIf { it.length >= 5 }
      ?: telephony.simOperator?.takeIf { it.length >= 5 }
    putNullableString(info, "mcc", numeric?.substring(0, 3))
    putNullableString(info, "mnc", numeric?.substring(3))
  }

  private fun readDataNetworkType(telephony: TelephonyManager): Int =
    try {
      telephony.dataNetworkType
    } catch (e: SecurityException) {
      TelephonyManager.NETWORK_TYPE_UNKNOWN
    }

  private fun readSignalStrengths(telephony: TelephonyManager): List<CellSignalStrength> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return emptyList()
    return try {
      telephony.signalStrength?.cellSignalStrengths ?: emptyList()
    } catch (e: SecurityException) {
      emptyList()
    }
  }

  private fun putSignal(
    info: WritableMap,
    telephony: TelephonyManager,
    strengths: List<CellSignalStrength>,
    preferNr: Boolean,
  ) {
    val valid = strengths.filter { it.dbm.isAvailable() }
    val primary = (if (preferNr) valid.firstOrNull { it is CellSignalStrengthNr } else null)
      ?: valid.firstOrNull()

    putNullableInt(info, "signalDbm", primary?.dbm)

    // En API 28 no existe cellSignalStrengths, pero sí el nivel agregado.
    val level = primary?.level
      ?: if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) telephony.signalStrength?.level else null
    putNullableInt(info, "signalLevel", level)

    var rsrp: Int? = null
    var rsrq: Int? = null
    var sinr: Int? = null
    when (primary) {
      is CellSignalStrengthNr -> {
        rsrp = primary.ssRsrp.orNullIfUnavailable()
        rsrq = primary.ssRsrq.orNullIfUnavailable()
        sinr = primary.ssSinr.orNullIfUnavailable()
      }
      is CellSignalStrengthLte -> {
        rsrp = primary.rsrp.orNullIfUnavailable()
        rsrq = primary.rsrq.orNullIfUnavailable()
        sinr = primary.rssnr.orNullIfUnavailable()
      }
      else -> Unit
    }
    putNullableInt(info, "rsrp", rsrp)
    putNullableInt(info, "rsrq", rsrq)
    putNullableInt(info, "sinr", sinr)
  }

  @Suppress("DEPRECATION")
  private fun readWifiRssi(context: Context): Int? {
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      ?: return null
    return try {
      // connectionInfo devuelve -127 cuando no hay un AP asociado.
      wifi.connectionInfo?.rssi?.takeIf { it > -127 && it < 0 }
    } catch (e: SecurityException) {
      null
    }
  }

  private fun generationOf(type: Int): String = when (type) {
    TelephonyManager.NETWORK_TYPE_GPRS,
    TelephonyManager.NETWORK_TYPE_EDGE,
    TelephonyManager.NETWORK_TYPE_CDMA,
    TelephonyManager.NETWORK_TYPE_1xRTT,
    TelephonyManager.NETWORK_TYPE_IDEN,
    TelephonyManager.NETWORK_TYPE_GSM -> "2g"

    TelephonyManager.NETWORK_TYPE_UMTS,
    TelephonyManager.NETWORK_TYPE_EVDO_0,
    TelephonyManager.NETWORK_TYPE_EVDO_A,
    TelephonyManager.NETWORK_TYPE_EVDO_B,
    TelephonyManager.NETWORK_TYPE_HSDPA,
    TelephonyManager.NETWORK_TYPE_HSUPA,
    TelephonyManager.NETWORK_TYPE_HSPA,
    TelephonyManager.NETWORK_TYPE_HSPAP,
    TelephonyManager.NETWORK_TYPE_EHRPD,
    TelephonyManager.NETWORK_TYPE_TD_SCDMA -> "3g"

    TelephonyManager.NETWORK_TYPE_LTE,
    TelephonyManager.NETWORK_TYPE_IWLAN -> "4g"

    TelephonyManager.NETWORK_TYPE_NR -> "5g"
    else -> "unknown"
  }

  private fun radioNameOf(type: Int): String? = when (type) {
    TelephonyManager.NETWORK_TYPE_GPRS -> "GPRS"
    TelephonyManager.NETWORK_TYPE_EDGE -> "EDGE"
    TelephonyManager.NETWORK_TYPE_CDMA -> "CDMA"
    TelephonyManager.NETWORK_TYPE_1xRTT -> "1xRTT"
    TelephonyManager.NETWORK_TYPE_IDEN -> "iDEN"
    TelephonyManager.NETWORK_TYPE_GSM -> "GSM"
    TelephonyManager.NETWORK_TYPE_UMTS -> "UMTS"
    TelephonyManager.NETWORK_TYPE_EVDO_0,
    TelephonyManager.NETWORK_TYPE_EVDO_A,
    TelephonyManager.NETWORK_TYPE_EVDO_B -> "EV-DO"
    TelephonyManager.NETWORK_TYPE_HSDPA -> "HSDPA"
    TelephonyManager.NETWORK_TYPE_HSUPA -> "HSUPA"
    TelephonyManager.NETWORK_TYPE_HSPA -> "HSPA"
    TelephonyManager.NETWORK_TYPE_HSPAP -> "HSPA+"
    TelephonyManager.NETWORK_TYPE_EHRPD -> "eHRPD"
    TelephonyManager.NETWORK_TYPE_TD_SCDMA -> "TD-SCDMA"
    TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
    TelephonyManager.NETWORK_TYPE_IWLAN -> "IWLAN"
    TelephonyManager.NETWORK_TYPE_NR -> "NR"
    else -> null
  }

  private fun Int.isAvailable(): Boolean = this != CellInfo.UNAVAILABLE

  private fun Int.orNullIfUnavailable(): Int? = takeIf { it.isAvailable() }

  private fun putNullableString(map: WritableMap, key: String, value: String?) {
    if (value == null) map.putNull(key) else map.putString(key, value)
  }

  private fun putNullableInt(map: WritableMap, key: String, value: Int?) {
    if (value == null) map.putNull(key) else map.putInt(key, value)
  }

  companion object {
    const val NAME = "NativeTelephony"
  }
}
