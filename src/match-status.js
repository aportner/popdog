const { sanitizeSayText } = require('./goldsrc-rcon');

const HLTV_RECORDING_STATUS_PATTERN =
  /(?:^|\r?\n)Recording to ([a-zA-Z0-9_.-]+\.dem), Length \d+(?:\.\d+)? sec\.(?:\r?\n|$)/;

function formatMatchStatus({ gameInfo, hltvStatus, hltvAvailable = true, matchStatus = null }) {
  const map = sanitizeSayText(String(gameInfo?.map || 'unknown')) || 'unknown';
  const players = Number.isInteger(gameInfo?.players) ? gameInfo.players : '?';
  const maxPlayers = Number.isInteger(gameInfo?.maxPlayers) ? gameInfo.maxPlayers : '?';

  let recording = 'unavailable';
  if (hltvAvailable) {
    recording = HLTV_RECORDING_STATUS_PATTERN.test(String(hltvStatus || ''))
      ? 'recording'
      : 'not recording';
  }

  const parts = [`${map} | ${players}/${maxPlayers} players`, `HLTV: ${recording}`];
  if (matchStatus) parts.push(matchStatus);
  return parts.join(' | ');
}

module.exports = { formatMatchStatus, HLTV_RECORDING_STATUS_PATTERN };
