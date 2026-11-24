import { NotFoundBody } from "@/components/NotFoundBody";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

// Addresses that match no page at all, outside the site layout, so this one brings its own header and footer.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1"><NotFoundBody /></main>
      <SiteFooter />
    </div>
  );
}
