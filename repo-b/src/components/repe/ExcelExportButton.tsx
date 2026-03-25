"use client";

import { exportFundExcelUrl } from "@/lib/bos-api";
import { Button } from "@/components/ui/Button";

type Props = {
  fundId: string;
  envId: string;
  businessId: string;
  quarter: string;
};

export function ExcelExportButton({ fundId, envId, businessId, quarter }: Props) {
  function handleExport() {
    const url = exportFundExcelUrl({
      fund_id: fundId,
      env_id: envId,
      business_id: businessId,
      quarter,
    });
    window.open(url, "_blank");
  }

  return (
    <Button size="sm" variant="secondary" onClick={handleExport}>
      Export .xlsx
    </Button>
  );
}
