const LOADER_ICONS: Record<string, string> = {
  fabric: "/loaders/fabric.png",
  forge: "/loaders/forge.png",
  neoforge: "/loaders/neoforge.png",
  quilt: "/loaders/fabric.png",
};

export default function LoaderTag({ loader }: { loader: string }) {
  const icon = LOADER_ICONS[loader.toLowerCase()] ?? null;
  return (
    <span className="chip">
      {icon && <img className="loader-icon" src={icon} alt="" width={14} height={14} loading="lazy" />}
      {loader}
    </span>
  );
}
