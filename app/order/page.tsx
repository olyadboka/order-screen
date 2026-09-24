import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDefaultRate } from "@/lib/settings";
import OrderScreen from "./OrderScreen";

export default async function OrderPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const defaultRate = await getDefaultRate();
  return <OrderScreen user={user} defaultRate={defaultRate} />;
}
