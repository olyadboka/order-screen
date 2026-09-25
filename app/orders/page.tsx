import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import OrdersScreen from "./OrdersScreen";

export default async function OrdersPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return <OrdersScreen user={user} />;
}
