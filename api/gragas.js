const PAGE = 'https://op.gg/es/lol/summoners/euw/Sancho%20Panza-1337/champions';
const GRAGAS_ID = 79;

// OP.GG manda sus datos dentro del HTML, repartidos en trozos self.__next_f.push([1,"..."]).
function readPageData(html) {
  const chunks = html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g);
  return [...chunks].map((chunk) => JSON.parse(chunk[1])).join('');
}

function readJsonArray(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === '[') {
      depth++;
    } else if (char === ']' && --depth === 0) {
      return JSON.parse(text.slice(start, i + 1));
    }
  }
  return null;
}

export function parseGragasStats(html) {
  const data = readPageData(html);
  const marker = '"my_champion_stats":';
  const position = data.indexOf(marker);
  if (position === -1) return null;

  const gragas = readJsonArray(data, position + marker.length)?.find((row) => row.id === GRAGAS_ID);
  if (!gragas?.kda || !gragas.play) return null;

  return {
    games: gragas.play,
    wins: gragas.win,
    losses: gragas.lose,
    kills: gragas.kda.kill,
    deaths: gragas.kda.death,
    assists: gragas.kda.assist,
    doubleKills: gragas.double_kill,
    tripleKills: gragas.triple_kill,
    quadraKills: gragas.quadra_kill,
    pentaKills: gragas.penta_kill,
    // OP.GG solo da la media por partida de estos tres: el total es una estimación.
    damage: gragas.damage_dealt * gragas.play,
    gold: gragas.gold * gragas.play,
    minions: gragas.cs * gragas.play,
  };
}

export default async function handler(req, res) {
  try {
    const response = await fetch(PAGE, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        'Accept-Language': 'es',
      },
      signal: AbortSignal.timeout(8000),
    });
    const stats = response.ok ? parseGragasStats(await response.text()) : null;
    if (!stats) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: `OP.GG no devolvió las estadísticas (HTTP ${response.status})` });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    return res.status(200).json(stats);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: `No se pudo consultar OP.GG: ${error.message}` });
  }
}
