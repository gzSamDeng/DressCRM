import { Header } from "@/components/header";
import { LeadIntelligenceWorkbench } from "@/components/lead-intelligence-workbench";
import "./lead-intelligence.css";

export default function LeadIntelligencePage() {
  return <div className="shell intelligenceShell"><Header /><main className="intelligenceContainer"><LeadIntelligenceWorkbench /></main></div>;
}
