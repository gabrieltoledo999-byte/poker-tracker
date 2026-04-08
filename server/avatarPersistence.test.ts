import { describe, expect, it } from "vitest";
import { shouldReplaceAvatar } from "./avatarPersistence";

describe("shouldReplaceAvatar", () => {
  it("allows provider avatar on first sync when user has no avatar", () => {
    expect(
      shouldReplaceAvatar({
        currentAvatarUrl: null,
        incomingAvatarUrl: "https://lh3.googleusercontent.com/photo",
        source: "provider-sync",
      })
    ).toBe(true);
  });

  it("prevents provider sync from overwriting an existing saved avatar", () => {
    expect(
      shouldReplaceAvatar({
        currentAvatarUrl: "data:image/png;base64,abc123",
        incomingAvatarUrl: "https://lh3.googleusercontent.com/photo",
        source: "provider-sync",
      })
    ).toBe(false);
  });

  it("allows provider sync when avatar is unchanged", () => {
    expect(
      shouldReplaceAvatar({
        currentAvatarUrl: "https://lh3.googleusercontent.com/photo",
        incomingAvatarUrl: "https://lh3.googleusercontent.com/photo",
        source: "provider-sync",
      })
    ).toBe(true);
  });

  it("always allows manual avatar updates", () => {
    expect(
      shouldReplaceAvatar({
        currentAvatarUrl: "https://lh3.googleusercontent.com/photo",
        incomingAvatarUrl: "data:image/png;base64,new-avatar",
        source: "manual-update",
      })
    ).toBe(true);
  });
});
