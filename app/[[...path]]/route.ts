import { env } from 'cloudflare:workers';
import { createRoomApi } from '../../lib/room-api.mjs';
import { createGameSite } from '../../lib/game-site.mjs';
import { gamePages } from '../../game/pages';

export const dynamic = 'force-dynamic';

async function gameRequest(request: Request) {
  const api = createRoomApi({db: env.DB});
  return createGameSite({pages: gamePages, api})(request);
}

export const GET = gameRequest;
export const HEAD = gameRequest;
export const POST = gameRequest;
export const PUT = gameRequest;
export const PATCH = gameRequest;
export const DELETE = gameRequest;
export const OPTIONS = gameRequest;
