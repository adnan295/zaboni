import { getApiBaseUrl } from "@/lib/apiConfig";

/**
 * Street-map tiles for every map in the app, through our own server
 * (api-server routes/tiles.ts). OpenStreetMap answers apps that fetch its tiles
 * directly with an "Access blocked" picture, in the in-app browser too.
 */
export const TILE_URL = `${getApiBaseUrl()}/api/tiles/{z}/{x}/{y}.png`;
