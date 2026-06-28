import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Entry point: route the visitor to the right place based on session state.
export default async function Home() {
  const session = await getSession();

  if (!session.userId) {
    redirect("/login");
  }
  if (session.mustSetPassword) {
    redirect("/set-password");
  }
  if (session.role === "owner") {
    redirect("/owner");
  }
  redirect("/dashboard");
}
