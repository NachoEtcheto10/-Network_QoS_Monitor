import CoreTelephony
import Foundation

/// Lee de CoreTelephony lo que iOS permite conocer de la red celular.
///
/// Limitaciones de la plataforma (no del módulo):
/// - No existe API pública para el RSSI / RSRP celular ni para el RSSI de WiFi,
///   por lo que las claves de señal siempre viajan en null.
/// - CTCarrier está deprecado: desde iOS 16.4 devuelve "--" como nombre y
///   "65535" como MCC/MNC, que acá se normalizan a null.
@objcMembers
final class TelephonyProvider: NSObject {

  private static let networkInfo = CTTelephonyNetworkInfo()

  static func currentInfo() -> [String: Any] {
    let radio = currentRadioTechnology()
    let carrier = currentCarrier()

    return [
      "carrier": orNull(sanitize(carrier?.carrierName)),
      "mcc": orNull(sanitize(carrier?.mobileCountryCode)),
      "mnc": orNull(sanitize(carrier?.mobileNetworkCode)),
      "networkType": generation(of: radio),
      "radioTechnology": orNull(radioName(of: radio)),
      "signalDbm": NSNull(),
      "signalLevel": NSNull(),
      "rsrp": NSNull(),
      "rsrq": NSNull(),
      "sinr": NSNull(),
      "wifiRssi": NSNull(),
      "hasPhonePermission": true,
    ]
  }

  /// Tecnología de radio de la línea que transporta los datos (relevante en
  /// equipos dual SIM); si no se puede determinar, la de la primera línea.
  private static func currentRadioTechnology() -> String? {
    guard let technologies = networkInfo.serviceCurrentRadioAccessTechnology else {
      return nil
    }
    if let dataService = networkInfo.dataServiceIdentifier,
       let technology = technologies[dataService] {
      return technology
    }
    return technologies.values.first
  }

  private static func currentCarrier() -> CTCarrier? {
    guard let carriers = networkInfo.serviceSubscriberCellularProviders else {
      return nil
    }
    if let dataService = networkInfo.dataServiceIdentifier,
       let carrier = carriers[dataService] {
      return carrier
    }
    return carriers.values.first
  }

  private static func generation(of radio: String?) -> String {
    guard let radio = radio else { return "unknown" }
    if #available(iOS 14.1, *),
       radio == CTRadioAccessTechnologyNR || radio == CTRadioAccessTechnologyNRNSA {
      return "5g"
    }
    switch radio {
    case CTRadioAccessTechnologyGPRS,
         CTRadioAccessTechnologyEdge,
         CTRadioAccessTechnologyCDMA1x:
      return "2g"
    case CTRadioAccessTechnologyWCDMA,
         CTRadioAccessTechnologyHSDPA,
         CTRadioAccessTechnologyHSUPA,
         CTRadioAccessTechnologyCDMAEVDORev0,
         CTRadioAccessTechnologyCDMAEVDORevA,
         CTRadioAccessTechnologyCDMAEVDORevB,
         CTRadioAccessTechnologyeHRPD:
      return "3g"
    case CTRadioAccessTechnologyLTE:
      return "4g"
    default:
      return "unknown"
    }
  }

  private static func radioName(of radio: String?) -> String? {
    guard let radio = radio else { return nil }
    if #available(iOS 14.1, *) {
      if radio == CTRadioAccessTechnologyNR { return "NR" }
      if radio == CTRadioAccessTechnologyNRNSA { return "NR (NSA)" }
    }
    switch radio {
    case CTRadioAccessTechnologyGPRS: return "GPRS"
    case CTRadioAccessTechnologyEdge: return "EDGE"
    case CTRadioAccessTechnologyCDMA1x: return "1xRTT"
    case CTRadioAccessTechnologyWCDMA: return "UMTS"
    case CTRadioAccessTechnologyHSDPA: return "HSDPA"
    case CTRadioAccessTechnologyHSUPA: return "HSUPA"
    case CTRadioAccessTechnologyCDMAEVDORev0,
         CTRadioAccessTechnologyCDMAEVDORevA,
         CTRadioAccessTechnologyCDMAEVDORevB:
      return "EV-DO"
    case CTRadioAccessTechnologyeHRPD: return "eHRPD"
    case CTRadioAccessTechnologyLTE: return "LTE"
    default: return nil
    }
  }

  private static func sanitize(_ value: String?) -> String? {
    guard let value = value, !value.isEmpty, value != "--", value != "65535" else {
      return nil
    }
    return value
  }

  private static func orNull(_ value: String?) -> Any {
    value ?? NSNull()
  }
}
