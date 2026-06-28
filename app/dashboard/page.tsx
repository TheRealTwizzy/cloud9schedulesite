import { redirect } from "next/navigation";
import DashboardClient from "@/components/DashboardClient";
import { ToastProvider } from "@/components/Toast";
import { getSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.userId) {
    redirect("/login");
  }
  if (session.mustSetPassword) {
    redirect("/set-password");
  }
  // The owner has no shifts — send them straight to the owner console.
  if (session.role === "owner") {
    redirect("/owner");
  }

  return (
    <ToastProvider>
      <DashboardClient userId={session.userId} />
    </ToastProvider>
  );
}
