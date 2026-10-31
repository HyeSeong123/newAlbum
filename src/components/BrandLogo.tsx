/** Smiling Gomi artwork and readable lettering share one accessible brand name. */
export function BrandLogo() {
  return <span className="brandLogo" role="img" aria-label="곰고미">
    <img className="brandLogoCharacter" src="/brand/gomgomi-logo.png" alt="" width={1280} height={1280} draggable={false} />
    <span className="brandLogoLettering" aria-hidden="true">
      곰고미
    </span>
  </span>;
}
