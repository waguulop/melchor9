# ¿Llegará melchor9 a 1000lp?

Web meme: Gragas en 3D dando vueltas y una barra con los LP de [Sancho Panza#1337](https://op.gg/es/lol/summoners/euw/Sancho%20Panza-1337) camino de los 1000.

- `index.html`, `style.css`, `main.js`: la página (three.js desde CDN, sin build).
- `api/lp.js`: función de Vercel que lee los LP de OP.GG (caché de 10 minutos).
- `tools/skn2glb.py`: convierte la malla y la textura de CommunityDragon en `assets/gragas.glb`.

Proyecto de fans sin relación con Riot Games. Gragas y sus imágenes son de Riot Games, Inc. Los datos vienen de OP.GG.
