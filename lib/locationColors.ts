// Client-safe location -> brand color map. Mirrors data/locations.json so client
// components can color shift cards without reading the filesystem.

export const LOCATION_COLORS: Record<string, string> = {
  "Cloud 9": "#6DB832",
  Noc9: "#7A2FA8",
  Spearfish: "#0A5A58",
  "Black Hawk": "#6B4A05",
  Warehouse: "#0F3D7A",
  Security: "#8C1313",
  "Overnight Security": "#5A0808",
};

export function locationColor(location: string): string {
  return LOCATION_COLORS[location] ?? "#4B5563";
}
