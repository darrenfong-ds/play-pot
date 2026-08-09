import type { Metadata } from "next";
import AdminLiveView from "./admin-live-view";

export const metadata: Metadata = {
  title: "Play Pot Live View",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminLiveView />;
}
