/** Display the approved artwork in two windows so its spacing stays consistent in pixels. */
export function BrandLogo() {
  return <span className="brandLogo" role="img" aria-label="감자싹">
    <span className="brandLogoCharacter" aria-hidden="true">
      <img src="/brand/gamjassak-logo.png" alt="" width={2022} height={778} draggable={false} />
    </span>
    <span className="brandLogoLettering" aria-hidden="true">
      <img src="/brand/gamjassak-logo.png" alt="" width={2022} height={778} draggable={false} />
    </span>
  </span>;
}
