import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();
  if (session.userId && session.mustSetPassword) {
    redirect("/set-password");
  }
  if (session.userId) {
    redirect(session.role === "owner" ? "/owner" : "/dashboard");
  }
  return <LoginForm />;
}
