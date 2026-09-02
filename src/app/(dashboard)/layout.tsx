import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { LOCAL_MODE } from "@/lib/local-mode";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        isAdmin={!LOCAL_MODE && session?.role === "admin"}
        canBackup={LOCAL_MODE || session?.role === "admin"}
      />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
