#import "RCTNativeTelephony.h"
#import "NetworkQoSMonitor-Swift.h"

@implementation RCTNativeTelephony

+ (NSString *)moduleName
{
  return @"NativeTelephony";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeTelephonySpecJSI>(params);
}

- (void)getTelephonyInfo:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  resolve([TelephonyProvider currentInfo]);
}

@end
