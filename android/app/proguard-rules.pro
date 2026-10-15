# R8/ProGuard rules for release builds with -PhivaMinify=true (default build has minify OFF).
#
# Most libraries ship their own consumer rules, which AGP applies automatically (react-android,
# @livekit/react-native, @livekit/react-native-webrtc, @notifee/react-native, react-native-iap,
# react-native-fast-image, react-native-svg, reanimated, worklets, Firebase, Play services, Glide, AdMob).
# The rules below only cover gaps / belt-and-braces. Verified to BUILD; runtime NOT verified on a device.
# After enabling minify for a release, smoke test: LiveKit join, Razorpay checkout, FCM (fg + bg + tap),
# AdMob ad load, Play Billing purchase, fast-image loading, Lottie, SVG, geofence/party audio service.

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ---- App's own native modules / services / receivers (com.hivachat.app.audio, .geofence, .notifications) ----
-keep class com.hivachat.app.** { *; }

# ---- Razorpay (react-native-razorpay README "Proguard Rules"; ships no consumer rules) ----
-dontwarn com.razorpay.**
-keep class com.razorpay.** { *; }
-optimizations !method/inlining/
-keepclasseswithmembers class * {
  public void onPayment*(...);
}
# Razorpay checkout references optional Google Pay / analytics classes
-dontwarn proguard.annotation.Keep
-dontwarn proguard.annotation.KeepClassMembers

# ---- LiveKit / WebRTC (JNI). Library consumer rules keep com.livekit.**, livekit.org.webrtc.**, org.jni_zero.** ----
# JNI resolves these by name from native code; keep everything incl. nested classes and native methods.
-keep class livekit.org.webrtc.** { *; }
-keep class org.jni_zero.** { *; }
-keep class com.livekit.** { *; }
-keepclasseswithmembernames class * {
  native <methods>;
}
-dontwarn org.webrtc.**

# ---- Nitro modules (react-native-nitro-modules, react-native-iap uses it): HybridObjects are created via JNI/fbjni ----
-keep class com.margelo.nitro.** { *; }
-keep class * extends com.margelo.nitro.core.HybridObject { *; }

# ---- react-native-fast-image v10 (com.fastimage + Glide 5): ships consumer-rules.pro (keeps com.fastimage.**,
# GlideModule / AppGlideModule constructors, ImageHeaderParser enum, dontwarn androidsvg). Glide's own rules ship in
# its AAR. Repeated here so a future fast-image bump cannot silently drop them. ----
-keep public class com.fastimage.** { *; }
-keep public class * implements com.bumptech.glide.module.GlideModule {
  <init>();
}
-keep public class * extends com.bumptech.glide.module.AppGlideModule {
  <init>(...);
}
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
  **[] $VALUES;
  public *;
}
-dontwarn com.caverock.androidsvg.**

# ---- react-native-svg ----
-keep public class com.horcrux.svg.** { *; }

# ---- Reanimated / Worklets (JNI + TurboModule/Fabric lookup by name) ----
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }

# ---- Notifee (consumer rules ship in the AAR's proguard-rules.pro) ----
-keep class io.invertase.notifee.** { *; }
-keep class app.notifee.core.** { *; }

# ---- React Native Firebase (messaging/auth/crashlytics): Firebase SDKs ship consumer rules; RNFB modules are
# discovered by name through the autolinked package list. Crashlytics needs line numbers for readable traces
# (kept above via LineNumberTable; mapping file is uploaded by the firebase-crashlytics Gradle plugin). ----
-keep class io.invertase.firebase.** { *; }
-dontwarn io.invertase.firebase.**

# ---- Google Sign-In (react-native-google-signin) ----
-keep class com.reactnativegooglesignin.** { *; }

# ---- react-native-keychain (secure storage; uses AndroidX biometric + reflection into AndroidKeyStore) ----
-keep class com.oblador.keychain.** { *; }
-dontwarn com.oblador.keychain.**

# ---- react-native-google-mobile-ads: Google Mobile Ads SDK consumer rules cover the SDK; RN wrapper is by-name ----
-keep class io.invertase.googlemobileads.** { *; }

# ---- Lottie / image picker / linear-gradient / safe-area / screens: view managers resolved by name ----
-keep class com.airbnb.android.react.lottie.** { *; }
-keep class com.imagepicker.** { *; }
-keep class com.BV.LinearGradient.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
