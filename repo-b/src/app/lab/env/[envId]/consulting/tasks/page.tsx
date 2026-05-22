"use client";

import { useCallback, useState } from "react";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import {
  ConsultingPageFrame,
  consultingHeaderLabel,
} from "@/components/consulting/ConsultingPageFrame";
import { ExecutionBoard } from "@/components/consulting/execution/ExecutionBoard";

export default function TasksPage({ params }: { params: { envId: string } }) {
  const { businessId, ready } = useConsultingEnv();
  const [reloadKey, setReloadKey] = useState(0);

  const onReload = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <ConsultingPageFrame
      envId={params.envId}
      activeKey="tasks"
      headerContent={<span style={consultingHeaderLabel}>Tasks</span>}
    >
      {ready && businessId ? (
        <ExecutionBoard
          key={reloadKey}
          envId={params.envId}
          businessId={businessId}
          onReload={onReload}
        />
      ) : (
        <div style={{ padding: 16, fontSize: 13, color: "rgba(220,230,240,0.55)" }}>
          Resolving environment...
        </div>
      )}
    </ConsultingPageFrame>
  );
}
