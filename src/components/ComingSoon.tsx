export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
      {title} — coming soon.
    </div>
  );
}
