# Sky Hopper 3D

A 3D bird jump game that runs in the browser. Built with plain HTML, CSS, JavaScript and [Three.js](https://threejs.org/). No backend, no build step.

## Play

- Tap / click / press `Space` to jump
- Pass pipes to score. Every 5 pipes is a new level
- Each level: faster speed, smaller gap, new sky theme (Morning, Sunset, Night, Neon)
- From level 3 the pipes move up and down
- Best score is saved in your browser

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page, HUD and Three.js script tag |
| `style.css` | Layout and HUD styling |
| `game.js` | Game logic, 3D scene, levels, sound |

## Run locally

Open `index.html` in a browser. Or run a local server:

```
python3 -m http.server 8000
```

Then visit http://localhost:8000

## Publish on GitHub Pages

1. Create a new GitHub repo named `sky-hopper-3d`
2. Upload `index.html`, `style.css`, `game.js` and `README.md`
3. Go to Settings > Pages
4. Under Source choose "Deploy from a branch", branch `main`, folder `/ (root)`
5. Save. Your game goes live at `https://<your-username>.github.io/sky-hopper-3d/`

## Next ideas

- Global leaderboard using a Cloudflare Worker + D1 database
- More bird skins and themes
- Power-ups and coins
- 
