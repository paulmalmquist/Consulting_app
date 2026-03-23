import { PsychragPatientOverview } from "@/components/psychrag/PsychragPatientOverview";

export default function PsychragPatientOverviewPage({ params }: { params: { patientId: string } }) {
  return <PsychragPatientOverview patientId={params.patientId} />;
}
