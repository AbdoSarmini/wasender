import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={session?.role === "admin"} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
