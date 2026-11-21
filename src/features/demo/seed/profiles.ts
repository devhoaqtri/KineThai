/**
 * Canonical demo profiles and viewer identity constants.
 *
 * Exports: MOCK_ME_ID, MOCK_ME_USERNAME, MOCK_PROFILES
 * Depends on: seed/types, features/session DEMO_AUTH_USER_ID
 */

// The leaf module, never the session barrel: the barrel re-exports the sign-in page, which
// imports the account client, and seed data must not drag that along (2026-11-22).
import { DEMO_AUTH_USER_ID } from "@/features/session/demo-session";
import type { MockProfile } from "./types";

/** @responsibility Stable demo viewer profile id used across seed overlays and mutations. */
export const MOCK_ME_ID = "11111111-1111-4111-8111-111111111111";

/** @responsibility Demo viewer username for /me redirects and profile lookup. */
export const MOCK_ME_USERNAME = "demo_creator";

export const MOCK_PROFILES: MockProfile[] = [
  {
    id: MOCK_ME_ID,
    auth_user_id: DEMO_AUTH_USER_ID,
    username: MOCK_ME_USERNAME,
    display_name: "Demo Creator",
    avatar_url: "https://i.pravatar.cc/240?u=demo_creator",
    bio: "Testing every moving-word flow before it ships.",
    created_at: "2026-05-28T08:30:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    auth_user_id: null,
    username: "nova_rae",
    display_name: "Nova Rae",
    avatar_url: "https://i.pravatar.cc/240?u=nova_rae",
    bio: "High-contrast typography, soft landings, loud feelings.",
    created_at: "2026-04-17T12:12:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    auth_user_id: null,
    username: "kai_loop",
    display_name: "Kai Loop",
    avatar_url: "https://i.pravatar.cc/240?u=kai_loop",
    bio: "Loops for creators who think in beats.",
    created_at: "2026-04-23T15:45:00.000Z",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    auth_user_id: null,
    username: "mira_aux",
    display_name: "Mira Aux",
    avatar_url: "https://i.pravatar.cc/240?u=mira_aux",
    bio: "I turn tiny notes into kinetic postcards.",
    created_at: "2026-05-02T11:05:00.000Z",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    auth_user_id: null,
    username: "zeph_404",
    display_name: "Zeph 404",
    avatar_url: "https://i.pravatar.cc/240?u=zeph_404",
    bio: "Glitch language, video overlays, and borrowed neon.",
    created_at: "2026-05-11T20:22:00.000Z",
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    auth_user_id: null,
    username: "lila_om",
    display_name: "Lila Om",
    avatar_url: "https://i.pravatar.cc/240?u=lila_om",
    bio: "Quiet captions that still know how to move.",
    created_at: "2026-05-20T06:18:00.000Z",
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    auth_user_id: null,
    username: "do_chu_bot",
    display_name: "Đố Chữ Mỗi Ngày",
    avatar_url: "https://api.dicebear.com/7.x/bottts/svg?seed=dochu&backgroundColor=8338EC,3A86FF",
    bio: "🤖 Mỗi ngày một từ tiếng Anh — đoán nghĩa qua gợi ý tiếng Việt.",
    created_at: "2026-05-30T05:00:00.000Z",
  },
];
