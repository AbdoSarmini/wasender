"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import CampaignForm, { type CampaignFormInitial } from "@/components/CampaignForm";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";

interface CampaignMessage {
  contactId: string | null;
  rawName: string | null;
  rawPhone: string | null;
  rawFields: string | null;
  contact: { id: string; name: string; phone: string; groupId: string | null } | null;
}

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  deviceId: string;
  templateId: string;
  targetAll: boolean;
  minDelay: number;
  maxDelay: number;
  scheduledAt: string | null;
  groups: { groupId: string }[];
  messages: CampaignMessage[];
}

export default function EditCampaignPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [initial, setInitial] = useState<CampaignFormInitial | null>(null);
  const [loading, setLoading] = useState(true);
  const [notEditable, setNotEditable] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ campaign: CampaignDetail }>(`/api/campaigns/${params.id}`);
        const campaign = data.campaign;
        if (campaign.status !== "draft" && campaign.status !== "scheduled") {
          setNotEditable(true);
          return;
        }
        const groupIds = campaign.groups.map((g) => g.groupId);
        const individualContacts = campaign.messages
          .filter((m) => m.contactId && m.contact && !groupIds.includes(m.contact.groupId ?? ""))
          .map((m) => ({ id: m.contact!.id, name: m.contact!.name, phone: m.contact!.phone }));
        const csvRows = campaign.messages
          .filter((m) => !m.contactId)
          .map((m) => ({ name: m.rawName ?? m.rawPhone ?? "", phone: m.rawPhone ?? "", fields: m.rawFields }));

        setInitial({
          name: campaign.name,
          deviceId: campaign.deviceId,
          templateId: campaign.templateId,
          targetAll: campaign.targetAll,
          groupIds,
          contacts: individualContacts,
          csvRows,
          minDelay: campaign.minDelay,
          maxDelay: campaign.maxDelay,
          scheduledAt: campaign.scheduledAt,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  if (loading) return <div className="p-8 text-gray-500">{t.campaignDetail.loading}</div>;
  if (notEditable) {
    return (
      <div className="p-8 text-gray-500">
        {t.editCampaign.notEditable}{" "}
        <button
          onClick={() => router.push(`/campaigns/${params.id}`)}
          className="text-brand-600 hover:underline"
        >
          {t.editCampaign.backToCampaign}
        </button>
      </div>
    );
  }
  if (!initial) return <div className="p-8 text-gray-500">{t.editCampaign.notFound}</div>;

  return (
    <div>
      <PageHeader title={t.editCampaign.title} description={t.editCampaign.description} />
      <CampaignForm campaignId={params.id} initial={initial} submitLabel={t.campaignForm.saveChanges} />
    </div>
  );
}
