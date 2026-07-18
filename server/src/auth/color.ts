const PALETTE = [
  "#e03131",
  "#e8590c",
  "#f08c00",
  "#2f9e44",
  "#1971c2",
  "#5f3dc4",
  "#c2255c",
  "#0c8599",
];

export function randomColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}
