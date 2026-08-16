import { AdminClient } from "./AdminClient";
import { USE_MOCK_DATA } from "@/lib/config";
import { MOCK_REPORTS } from "@/lib/mock";
import { checkIsAdmin, getReports } from "@/lib/data/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (USE_MOCK_DATA) {
    return (
      <div className="min-h-screen bg-bg">
        <AdminClient initialReports={MOCK_REPORTS} />
      </div>
    );
  }

  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-6 text-center">
        <div>
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-lg font-semibold text-text mb-1">Not authorized</h1>
          <p className="text-text2 text-sm">
            This page is restricted to the Fayd admin account.
          </p>
        </div>
      </div>
    );
  }

  const reports = await getReports();
  return (
    <div className="min-h-screen bg-bg">
      <AdminClient initialReports={reports} />
    </div>
  );
}
