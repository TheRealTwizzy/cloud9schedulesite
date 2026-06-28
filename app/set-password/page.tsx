import { redirect } from "next/navigation";
import SetPasswordForm from "@/components/SetPasswordForm";
import { getSession } from "@/lib/session";

export default async function SetPasswordPage() {
  const session = await getSession();
  if (!session.userId) {
    redirect("/login");
  }
  if (!session.mustSetPassword) {
    redirect(session.role === "owner" ? "/owner" : "/dashboard");
  }
  return <SetPasswordForm displayName={session.displayName} />;
}
