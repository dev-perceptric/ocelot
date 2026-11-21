import { permanentRedirect } from "next/navigation";

// The employer page became the pricing page, which leads straight to the job form.
export default function ForEmployers() {
  permanentRedirect("/pricing");
}
