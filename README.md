# popdog

A Discord bot for a ReHLDS Counter-Strike 1.6 server. It connects to Discord and
queries the game server over GoldSrc's public UDP server-query protocol. It also
ingests ReHLDS UDP logs as internal structured events for future game commands.

Current commands:

- `/ping` — check the Discord connection
- `/cs status` — show the server name, map, players, address, and query latency
- `/cs say` — send an attributed Discord message to players via RCON
- `/hltv status` — show private HLTV proxy status
- `/hltv rcon` — run an arbitrary HLTV console command

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
   `GOLDSRC_PORT` when ReHLDS is not listening on `127.0.0.1:27015`. To use
   `/cs say`, set `GOLDSRC_RCON_PASSWORD` to the same long, random value as
   `rcon_password` in `cstrike/server.cfg`.
6. Register the command in your test server, then run the bot:

   ```sh
   npm run register
   npm start
   ```

Guild commands generally appear immediately. In Discord, run `/ping`, then
`/cs status`. The host running popdog must be able to reach the ReHLDS game port
over UDP.

`/cs say` requires Discord's Manage Server permission by default. Set
`DISCORD_ADMIN_ROLE_ID` to use a dedicated role instead. For defense in depth,
recent ReHLDS builds support `rcon_adduser <ip-or-cidr>` to allow-list the
popdog host.

## ReHLDS log ingestion

Popdog listens on UDP port `27500` by default and accepts packets only from
`GOLDSRC_LOG_ALLOWED_HOST` (or `GOLDSRC_HOST` when unset). After binding the
receiver, it uses RCON to enable logging and register its exact destination:

```cfg
logaddress_del POPDOG_HOST_IP 27500
log on
logaddress_add POPDOG_HOST_IP 27500
```

Set `GOLDSRC_LOG_ADVERTISE_HOST` to the address ReHLDS should use. It defaults
to a specific bind address such as `127.0.0.1`; it must be explicit when binding
to `0.0.0.0`. Set `GOLDSRC_LOG_AUTO_CONFIGURE=false` only when managing the
destination manually. Popdog removes its exact destination during a graceful
shutdown and never calls `logaddress_delall`.

When the processes run on separate hosts, allow inbound UDP `27500` to popdog
from only the ReHLDS host. Set `GOLDSRC_LOG_DEBUG=true` temporarily to print
parsed events to stdout. Nothing is posted to Discord. Player chat is already
emitted internally as a structured `chat` event containing the name, user ID,
Steam ID, team, message, and whether it was team-only or sent while dead.

Authorized players can run exact-match chat commands:

- `.lo3` executes `lo3.cfg`
- `.pregame` executes `pregame.cfg`
- `.cal` executes `cal.cfg`
- `.calot` and `.ot` execute `calot.cfg`
- `.rr` and `.rr1` run `sv_restart 1`; `.rr3` runs `sv_restart 3`
- `.map <map>` and `.changelevel <map>` change to a validated map name
- `.record` runs `record <prefix>`, confirms the generated filename through
  HLTV's `status`, then announces `Start recording to <filename>` through HLTV
  chat with the available recording disk space appended
- `.stop` and `.stoprecording` run `stoprecording`, then forward HLTV's exact
  completed-demo response (`.stop` deliberately does not run HLTV's destructive
  `stop` command)

Configure the comma-separated Steam2 allow-list with
`GOLDSRC_COMMAND_STEAM_IDS`. Commands are mapped to fixed RCON strings; the map
commands accept only letters, numbers, underscores, and hyphens in their map
name. Duplicate triggers have a three-second cooldown.

The recording prefix defaults to `match`, producing HLTV names such as
`match-date-map.dem`. Override it with `HLTV_RECORDING_PREFIX`; only letters,
numbers, underscores, and hyphens are accepted.

Popdog checks free space using Node's cross-platform filesystem API. Set
`HLTV_DISK_PATH` to a path on the filesystem where HLTV stores demos; it
defaults to the root of popdog's current drive. This measures the machine
running popdog, so it represents HLTV's disk only when they share that
filesystem. A failed disk check is logged but does not prevent recording.

## HLTV RCON

Set `HLTV_HOST`, `HLTV_PORT`, and `HLTV_ADMIN_PASSWORD`. The password must match
HLTV's `adminpassword` setting; it is separate from the game server's
`rcon_password`. Both `/hltv` subcommands require the configured Discord admin
role or Manage Server permission, and responses are ephemeral.

`/mappoll` creates the standard 24-hour, multi-select map poll in the channel
where it is run. It uses the same configured Discord admin role or Manage
Server permission check.

For temporary testing from a laptop behind ordinary stateful NAT, set
`GOLDSRC_LOG_NAT_KEEPALIVE=true`. Popdog will send a harmless A2S_INFO query
from the same UDP socket every 15 seconds to keep a return mapping open. Point
`logaddress_add` at the laptop's public IP and port `27500`. This depends on the
NAT preserving that external port and is intentionally a test convenience, not
a production networking strategy.

## Development

```sh
npm run dev
npm run check
npm test
```

Run `npm run register` again whenever slash-command definitions change.
