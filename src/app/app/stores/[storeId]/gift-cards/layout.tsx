import { ClientMessages } from "@/components/ClientMessages";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ClientMessages section="giftCards">{children}</ClientMessages>;
}
