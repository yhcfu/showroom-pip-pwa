export type Platform = "ios" | "android" | "desktop";

type NavigatorLike = Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">;

export function detectPlatform(navigatorLike: NavigatorLike): Platform {
  const { userAgent, platform, maxTouchPoints } = navigatorLike;
  if (/iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/.test(userAgent)) return "android";
  return "desktop";
}
