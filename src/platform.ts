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

export function buildShowroomRoomUrl(roomKey: string): string {
  return `https://www.showroom-live.com/r/${encodeURIComponent(roomKey)}`;
}

type ScreenSize = Pick<Screen, "availWidth" | "availHeight">;

export function buildTheaterWindowFeatures(screenSize: ScreenSize): string {
  const availableWidth = Math.max(320, Math.floor(screenSize.availWidth));
  const availableHeight = Math.max(320, Math.floor(screenSize.availHeight));
  const maxWidth = Math.floor(availableWidth * 0.92);
  const maxHeight = Math.floor(availableHeight * 0.92);
  const controlsHeight = 96;
  let width = Math.min(1280, maxWidth);
  let height = Math.round(width * 9 / 16 + controlsHeight);

  if (height > maxHeight) {
    height = maxHeight;
    width = Math.min(maxWidth, Math.round((height - controlsHeight) * 16 / 9));
  }

  const left = Math.max(0, Math.floor((availableWidth - width) / 2));
  const top = Math.max(0, Math.floor((availableHeight - height) / 2));
  return [
    "popup=yes",
    "resizable=yes",
    "scrollbars=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(",");
}
