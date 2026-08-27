const { sanitizeSayText } = require('./goldsrc-rcon');

const HLTV_RECORDING_STATUS_PATTERN =
  /(?:^|\r?\n)Recording to ([a-zA-Z0-9_.-]+\.dem), Length \d+(?:\.\d+)? sec\.(?:\r?\n|$)/;

function formatMatchStatus({ gameInfo, hltvStatus, hltvAvailable = true }) {
  const map = sanitizeSayText(String(gameInfo?.map || 'unknown')) || 'unknown';
  const players = Number.isInteger(gameInfo?.players) ? gameInfo.players : '?';
  const maxPlayers = Number.isInteger(gameInfo?.maxPlayers) ? gameInfo.maxPlayers : '?';

  let recording = 'unavailable';
  if (hltvAvailable) {
    recording = HLTV_RECORDING_STATUS_PATTERN.test(String(hltvStatus || ''))
      ? 'recording'
      : 'not recording';
  }

  return `${map} | ${players}/${maxPlayers} players | HLTV: ${recording}`;
}

module.exports = { formatMatchStatus, HLTV_RECORDING_STATUS_PATTERN };
