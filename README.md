# Flow of the Elements

A browser game: link gems to dig a tunnel, and let the current reach the altar.

This is an original game inspired by the main mode of a classic four-elements puzzle. It is not a port, it does not use anyone else's art or boards, and it is not affiliated with the original publisher. There is no hidden-object search, no spot-the-difference, and no castle to build.

## How to play

- Hold a gem and drag across at least three of the same color. Only up, down, left, and right.
- Five gems blast a small cross at the end of the chain, six a larger square, seven or more a wider one.
- Ice takes two hits. The first turns it into an ordinary gem. The second breaks that gem and digs. A blast, bomb, spade, or arrow counts as one hit. Only an arrow breaks a slab.
- Green charges the spade, red the bomb, yellow swap, and blue shuffle. A full bar is one use. The bomb does not dig.
- Time passes between moves. Time left becomes points and stars.
- When the board does not fit the window, drag an empty cell, click the minimap, or use the arrow keys. Scroll over the board to zoom. Keys 1–4 choose powers. Esc pauses.

Progress stays in this browser (`localStorage`).

## Locally

ES modules do not run from a `file://` address.

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

To open any level while testing, add `#debug` (`http://localhost:8080/#debug`). That works on this computer and on a private network address. The same link on GitHub Pages leaves the campaign locked.

## GitHub Pages

1. Push this folder to the `main` branch.
2. In the repository: Settings → Pages → Build and deployment → Deploy from a branch.
3. Branch: `main`, folder: `/ (root)`.
4. The game is at [https://mario1842.github.io/flow-of-the-elements/](https://mario1842.github.io/flow-of-the-elements/).

Paths are relative, so the page also works in a project subfolder.
