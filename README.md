# popdog

A Discord bot foundation for a ReHLDS Counter-Strike 1.6 server. The current
milestone connects to Discord and provides a `/ping` slash command. GoldSrc RCON
and server event relaying can be added next.

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
   Git so credentials are not committed.
6. Register the command in your test server, then run the bot:

   ```sh
   npm run register
   npm start
   ```

Guild commands generally appear immediately. In Discord, run `/ping`; popdog
should answer with its gateway latency.

## Development

```sh
npm run dev
npm run check
```

Run `npm run register` again whenever slash-command definitions change.
