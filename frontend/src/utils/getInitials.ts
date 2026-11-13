// Up to two uppercase initials for an avatar placeholder, e.g. "Ada Lovelace"
// -> "AL", "  " -> "". Callers render the result directly as a React node, so
// an empty string is a valid answer that simply leaves the avatar blank.

export function getInitials(name?: string | null): string {
  if (!name) return "";

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export default getInitials;