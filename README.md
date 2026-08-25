# popdog

A Discord bot for a ReHLDS Counter-Strike 1.6 server. It connects to Discord and
queries the game server over GoldSrc's public UDP server-query protocol.

Current commands:

- `/ping` — check the Discord connection
- `/cs status` — show the server name, map, players, address, and query latency

## Discord setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and create an application named `popdog`.
2. Open **Bot**, create/reset the bot token, and keep it private.
3. Under **OAuth2 → URL Generator**, select the `bot` and
   `applications.commands` scopes. Under bot permissions, select **View
   Channels**, **Send Messages**, and **Use Application Commands**. Open the
   generated URL and add the bot to your Discord server.
4. Enable **Developer Mode** in Discord under **User Settings → Advanced**.
   Right-click your server and choose **Copy Server ID**.
5. Create your local configuration:

   ```sh
   cp .env.example .env
   ```

   Fill in the application ID, bot token, and server ID. `.env` is ignored by
   Git so credentials are not committed. Also set `GOLDSRC_HOST` and
   `GOLDSRC_PORT` when ReHLDS is not listening on `127.0.0.1:27015`.
6. Register the command in your test server, then run the bot:

   ```sh
   npm run register
   npm start
   ```

Guild commands generally appear immediately. In Discord, run `/ping`, then
`/cs status`. The host running popdog must be able to reach the ReHLDS game port
over UDP.

## Development

```sh
npm run dev
npm run check
npm test
```

Run `npm run register` again whenever slash-command definitions change.
