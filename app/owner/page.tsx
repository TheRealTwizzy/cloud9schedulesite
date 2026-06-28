import { redirect } from "next/navigation";
import OwnerClient from "@/components/OwnerClient";
import { ToastProvider } from "@/components/Toast";
import { getSession } from "@/lib/session";

export default async function OwnerPage() {
  const session = await getSession();
  if (!session.userId) {
    redirect("/login");
  }
  if (session.mustSetPassword) {
    redirect("/set-password");
  }
  if (session.role !== "owner") {
    redirect("/dashboard");
  }

  return (
    <ToastProvider>
      <OwnerClient />
    </ToastProvider>
  );
}
