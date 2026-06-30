const http = require("http");
const crypto = require("crypto");
require("dotenv").config();

const scope = "https://www.googleapis.com/auth/calendar.events";
const preferredPort = Number(process.env.GOOGLE_OAUTH_PORT || 53682);
const host = "127.0.0.1";
let redirectUri = "";

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error(
    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env before running this script."
  );
  process.exit(1);
}

const state = crypto.randomBytes(16).toString("hex");
function buildAuthUrl() {
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  return authUrl;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error_description || data.error || response.statusText;
    throw new Error(`Token exchange failed: ${message}`);
  }

  return data;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);

  if (url.pathname !== "/") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (url.searchParams.get("state") !== state) {
    res.writeHead(400);
    res.end("State mismatch. Please rerun the auth script.");
    server.close();
    return;
  }

  const error = url.searchParams.get("error");
  if (error) {
    res.writeHead(400);
    res.end(`Google authorization failed: ${error}`);
    console.error(`Google authorization failed: ${error}`);
    server.close();
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400);
    res.end("Missing authorization code.");
    server.close();
    return;
  }

  try {
    const token = await exchangeCodeForToken(code);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Google Calendar authorization complete. You can close this tab.");

    if (!token.refresh_token) {
      console.error(
        "Google did not return a refresh token. Revoke this OAuth app from your Google account, then rerun this script."
      );
    } else {
      console.log("\nAdd this to your .env and hosting environment:\n");
      console.log(`GOOGLE_REFRESH_TOKEN=${token.refresh_token}\n`);
    }
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(err.message);
    console.error(err.message);
  } finally {
    server.close();
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${preferredPort} is already in use. Stop the previous auth helper or run GOOGLE_OAUTH_PORT=53683 npm run google:auth.`
    );
    process.exit(1);
  }

  throw err;
});

redirectUri = `http://${host}:${preferredPort}`;
server.listen(preferredPort, host, () => {
  const authUrl = buildAuthUrl();
  console.log(`Listening for Google OAuth callback at ${redirectUri}`);
  console.log("\nOpen this URL and choose your Google account:\n");
  console.log(authUrl.toString());
});
