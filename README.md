# Chicken Sarookh 2

A chaotic multiplayer browser party game: **don't get rocketed.**

## Run
```bash
npm install
npm start
```
Open http://localhost:3000.

Create a room, share the 4-character code, and play with 2-8 friends.

## Controls
- WASD / Arrow keys — move
- Space — dash
- E — kick

First player to 3 round wins wins the match. The server owns gameplay state; Socket.IO synchronizes rooms in real time.