import { Request as IRequest, Router } from "itty-router";

export interface Env {
  API_KEYS: KVNamespace;
  INTERNAL_KEY: string;
  VERIFICATIONS: KVNamespace;
}

interface APIKey {
  access_level: number;
  created_at: number;
  creator: string;
}

interface User {
  id: number;
  username: string;
  privacy?: {
    discord: number;
    roblox: number;
  };
}

async function getAPIKeyHash(apiKey: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-512", new TextEncoder().encode(apiKey))
    )
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makeResponse(body: { [k: string]: any }, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const router = Router();
    const apiKey = request.headers.get("authorization");

    router.get("/api/discord/:id", async (req: IRequest & Request) => {
      const key: User | null = await env.VERIFICATIONS.get(
        req.params?.id as string,
        "json"
      );

      if (!key) return makeResponse({ error: "User is not verified" }, 404);

      const privacyLevel = key.privacy?.discord as number;

      delete key.privacy;

      if (!privacyLevel) return makeResponse(key, 200);

      if (!apiKey)
        return makeResponse({ error: "Resource requires API key" }, 401);

      const keyHash = await getAPIKeyHash(apiKey);
      const apiKeyData: APIKey | null = await env.API_KEYS.get(keyHash, "json");

      if (!apiKeyData && apiKey !== env.INTERNAL_KEY)
        return makeResponse({ error: "API key is invalid" }, 401);

      if (
        apiKey !== env.INTERNAL_KEY &&
        privacyLevel > (apiKeyData?.access_level as number)
      )
        return makeResponse({ error: "You cannot access this user" }, 403);

      return makeResponse(key, 200);
    });

    router.get("/api/roblox/:id", async (req: IRequest & Request) => {
      const key: string[] | null = await env.VERIFICATIONS.get(
        req.params?.id as string,
        "json"
      );

      if (!key)
        return makeResponse(
          { error: "No Discord accounts linked to this Roblox account" },
          404
        );

      const keysToVerify = [];
      const keysToReturn = [];

      for (const uid of key) {
        const locatedUser: User | null = await env.VERIFICATIONS.get(
          uid,
          "json"
        );

        if (!locatedUser) continue;

        if (!locatedUser.privacy?.roblox) {
          delete locatedUser.privacy;
          keysToReturn.push(uid);
        } else {
          keysToVerify.push(uid);
        }
      }

      if (keysToVerify.length && apiKey) {
        const apiKeyHash = await getAPIKeyHash(apiKey);
        const apiKeyData: APIKey | null = await env.API_KEYS.get(
          apiKeyHash,
          "json"
        );

        if (!apiKeyData && apiKey !== env.INTERNAL_KEY)
          return makeResponse({ error: "API key is invalid" }, 401);

        for (const pendingKey of keysToVerify) {
          const reverseKey: User | null = await env.VERIFICATIONS.get(
            pendingKey,
            "json"
          );

          if (!reverseKey) continue;

          if (
            apiKey === env.INTERNAL_KEY ||
            (reverseKey.privacy?.roblox as number) <=
              (apiKeyData?.access_level as number)
          ) {
            delete reverseKey.privacy;
            keysToReturn.push(reverseKey);
          }

          if (!keysToReturn.length)
            return makeResponse(
              { error: "You cannot access the Discord accounts of this user" },
              403
            );

          return makeResponse(keysToReturn, 200);
        }
      } else if (!keysToReturn.length && !apiKey) {
        return makeResponse({ error: "Resource requires API key" }, 401);
      } else {
        return makeResponse(keysToReturn, 200);
      }
    });

    router.all("*", () => makeResponse({ error: "Not found" }, 404));
  },
};
