const PROFILE = 'https://op.gg/es/lol/summoners/euw/Sancho%20Panza-1337';

// OP.GG resume el rango en la meta description: "... / Maestro 19 LP / 126Victoria 79Derrota ..."
export function parseRank(html) {
  const match = html.match(/content="[^"]*?\/ ([^/"]+?) ([\d.,]+) LP \/ (\d+)Victoria (\d+)Derrota/);
  if (!match) return null;
  return {
    tier: match[1],
    lp: Number(match[2].replace(/\D/g, '')),
    wins: Number(match[3]),
    losses: Number(match[4]),
  };
}

export default async function handler(req, res) {
  try {
    const response = await fetch(PROFILE, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        'Accept-Language': 'es',
      },
      signal: AbortSignal.timeout(8000),
    });
    const rank = response.ok ? parseRank(await response.text()) : null;
    if (!rank) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: `OP.GG no devolvió el rango (HTTP ${response.status})` });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    return res.status(200).json(rank);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: `No se pudo consultar OP.GG: ${error.message}` });
  }
}
