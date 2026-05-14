export function RouteLoadingScreen() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-1 overflow-hidden bg-[rgba(198,162,123,0.12)]"
    >
      <div className="h-full w-1/3 animate-[route-loader_1s_ease-in-out_infinite] rounded-full bg-[linear-gradient(90deg,var(--color-caramel),var(--color-mocha))]" />
    </div>
  );
}
