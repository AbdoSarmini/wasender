"use client";

import PageHeader from "@/components/PageHeader";
import CampaignForm from "@/components/CampaignForm";

export default function NewCampaignPage() {
  return (
    <div>
      <PageHeader title="New campaign" description="Set up a bulk WhatsApp message campaign." />
      <CampaignForm />
    </div>
  );
}
