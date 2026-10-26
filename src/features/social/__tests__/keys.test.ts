import { describe, expect, it } from "vitest";
import { socialKeys } from "../api/keys";
import { discoveryKeys } from "../../discovery/api/keys";

describe("socialKeys", () => {
  it("namespaces the feed root", () => expect(socialKeys.feedRoot).toEqual(["feed"]));
  it("builds a feed key per data mode", () => {
    expect(socialKeys.feed("demo")).toEqual(["feed", "demo"]);
    expect(socialKeys.feed("live")).toEqual(["feed", "live"]);
  });
  it("namespaces the post root", () => expect(socialKeys.postRoot).toEqual(["post"]));
  it("builds a post key from mode and id", () =>
    expect(socialKeys.post("demo", "p1")).toEqual(["post", "demo", "p1"]));
  it("exposes profile and notification roots", () => {
    expect(socialKeys.profileRoot).toEqual(["profile"]);
    expect(socialKeys.notificationsRoot).toEqual(["notifications"]);
  });
});

describe("discoveryKeys", () => {
  it("namespaces the discover root and per-mode key", () => {
    expect(discoveryKeys.discoverRoot).toEqual(["discover"]);
    expect(discoveryKeys.discover("live")).toEqual(["discover", "live"]);
  });
  it("builds a search key from mode and query", () =>
    expect(discoveryKeys.search("demo", "hello")).toEqual(["search", "demo", "hello"]));
  it("builds a me key per mode", () => expect(discoveryKeys.me("demo")).toEqual(["me", "demo"]));
  it("builds a notifications key per mode", () =>
    expect(discoveryKeys.notifications("live")).toEqual(["notifications", "live"]));
  it("orders the profile key as username then mode", () =>
    expect(discoveryKeys.profile("nova_rae", "demo")).toEqual(["profile", "nova_rae", "demo"]));
  it("exposes stable root prefixes", () => {
    expect(discoveryKeys.searchRoot).toEqual(["search"]);
    expect(discoveryKeys.meRoot).toEqual(["me"]);
    expect(discoveryKeys.profileRoot).toEqual(["profile"]);
  });
  it("separates keys by data mode", () =>
    expect(discoveryKeys.me("demo")).not.toEqual(discoveryKeys.me("live")));
  it("separates search keys by query", () =>
    expect(discoveryKeys.search("demo", "a")).not.toEqual(discoveryKeys.search("demo", "b")));
  it("separates post keys by id", () =>
    expect(socialKeys.post("demo", "a")).not.toEqual(socialKeys.post("demo", "b")));
});
