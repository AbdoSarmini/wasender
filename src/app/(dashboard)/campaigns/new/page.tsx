"use client";

import PageHeader from "@/components/PageHeader";
import CampaignForm from "@/components/CampaignForm";
import { useI18n } from "@/lib/i18n/context";

export default function NewCampaignPage() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t.campaigns.newCampaign} description={t.campaigns.newCampaignDescription} />
      <CampaignForm />
    </div>
  );
}
