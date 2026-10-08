#import <Foundation/Foundation.h>
#import <QosTelephonySpec/QosTelephonySpec.h>

NS_ASSUME_NONNULL_BEGIN

/// TurboModule "NativeTelephony". La lectura de CoreTelephony vive en
/// TelephonyProvider.swift; esta clase solo adapta el protocolo de codegen.
@interface RCTNativeTelephony : NSObject <NativeTelephonySpec>
@end

NS_ASSUME_NONNULL_END
