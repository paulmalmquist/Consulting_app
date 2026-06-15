import HistoryRhymesCockpit from "@/components/historyrhymes/cockpit/HistoryRhymesCockpit";

// Compatibility alias for the cockpit. Docs, QA checklists, and older links
// reference /historyrhymes/routine; it renders the same cockpit as the index
// route, keeping the legacy hr-routine-page testid.
export default function TradingRoutinePage() {
  return <HistoryRhymesCockpit rootTestId="hr-routine-page" />;
}
