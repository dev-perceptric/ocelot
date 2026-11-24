import { NotFoundBody } from "@/components/NotFoundBody";

// notFound() on any site page (jobs, companies, role and place pages). The site layout already shows the header and
// footer, so this adds only the message; without it the root not-found.tsx shows inside the site layout and the header
// and footer appear twice.
export default function SiteNotFound() {
  return <NotFoundBody />;
}
