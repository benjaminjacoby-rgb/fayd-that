import { AppShell } from "@/components/AppShell";

export default function MapPage() {
  return (
    <AppShell title="Near me">
      <div className="px-6 pt-16 text-center">
        <div className="text-5xl mb-3">📍</div>
        <h2 className="text-lg font-semibold mb-1">Coming in Phase 3</h2>
        <p className="text-text2 text-sm">
          Drop a pin and bet on something happening near you. Powered by Mapbox.
        </p>
      </div>
    </AppShell>
  );
}
