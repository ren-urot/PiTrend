export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

interface NodeAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  online?: boolean;
}

/**
 * PiMesh's signature avatar treatment: every person renders as a node in
 * the mesh, marked by a thin conic-gradient ring cycling through the
 * brand's three accents (violet, gold, teal) rather than a plain circle.
 * Shows the person's actual photo when one is set, falling back to
 * initials otherwise — the ring itself never changes.
 */
export function NodeAvatar({ name, avatarUrl, size = 40, online = false }: NodeAvatarProps) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="h-full w-full rounded-full p-[2px]"
        style={{
          background: 'conic-gradient(from 200deg, #8A348E, #E8A93A, #1FA097, #8A348E)',
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center rounded-full bg-card font-display font-semibold text-foreground"
            style={{ fontSize: size * 0.36 }}
          >
            {initialsFor(name)}
          </div>
        )}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-card bg-mesh-teal" />
      )}
    </div>
  );
}
